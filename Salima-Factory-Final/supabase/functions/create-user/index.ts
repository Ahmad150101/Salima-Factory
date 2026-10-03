import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) throw new Error('Missing authorization token')

    const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: userResult, error: userError } = await service.auth.getUser(token)
    if (userError || !userResult.user) throw new Error('Unauthorized')

    const { data: caller, error: callerError } = await service.from('profiles').select('role,is_active').eq('id', userResult.user.id).single()
    if (callerError || !caller?.is_active || caller.role !== 'admin') throw new Error('Admin permission required')

    const body = await req.json()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const fullName = String(body.full_name || '').trim()
    const role = body.role === 'admin' ? 'admin' : 'engineer'
    if (!email || !fullName || password.length < 8) throw new Error('Invalid user data')

    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // Role is intentionally NOT trusted through user_metadata.
      // The database trigger creates every new profile as engineer first.
      user_metadata: { full_name: fullName },
    })
    if (error) throw error

    const createdUser = data.user
    if (!createdUser) throw new Error('User creation returned no user')

    const { error: profileError } = await service
      .from('profiles')
      .update({ role, full_name: fullName, is_active: true })
      .eq('id', createdUser.id)

    if (profileError) {
      // Avoid leaving behind a half-created account if role/profile setup fails.
      await service.auth.admin.deleteUser(createdUser.id)
      throw profileError
    }

    return new Response(JSON.stringify({ user: { id: createdUser.id, email: createdUser.email, role } }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
