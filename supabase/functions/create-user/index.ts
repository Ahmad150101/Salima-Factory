import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

function envKey(jsonName: string, legacyName: string): string {
  const raw = Deno.env.get(jsonName)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.default) return parsed.default
    } catch (_) {}
  }
  const legacy = Deno.env.get(legacyName)
  if (!legacy) throw new Error(`Missing ${jsonName}`)
  return legacy
}

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
    const secretKey = envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) throw new Error('Missing authorization token')

    const service = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: userResult, error: userError } = await service.auth.getUser(token)
    if (userError || !userResult.user) throw new Error('Unauthorized')

    const { data: caller, error: callerError } = await service.from('profiles').select('role,is_active').eq('id', userResult.user.id).single()
    if (callerError || !caller?.is_active || caller.role !== 'owner') throw new Error('Owner permission required')

    const body = await req.json()
    const username = String(body.username || '').trim().toLowerCase()
    const email = `${username}@users.salima.internal`
    const password = String(body.password || '')
    const fullName = String(body.full_name || '').trim()
    const role = ['owner', 'admin', 'engineer'].includes(body.role) ? body.role : ''
    if (!/^[a-z0-9_]{3,30}$/.test(username) || !fullName || password.length < 8 || !role) throw new Error('Invalid user data')

    const { data: duplicate } = await service.from('profiles').select('id').eq('username', username).maybeSingle()
    if (duplicate) throw new Error('Username already exists')

    const { data, error } = await service.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    })
    if (error) throw error
    const createdUser = data.user
    if (!createdUser) throw new Error('User creation returned no user')

    const { data: profile, error: profileError } = await service
      .from('profiles')
      .update({ username, role, full_name: fullName, is_active: true, created_by: userResult.user.id })
      .eq('id', createdUser.id)
      .select('id,username,full_name,role,is_active,created_at,created_by,last_login_at,last_activity_at')
      .single()

    if (profileError) {
      await service.auth.admin.deleteUser(createdUser.id)
      throw profileError
    }

    const { error: auditError } = await service.from('audit_logs').insert({
      user_id: userResult.user.id, action: 'INSERT', entity_type: 'profiles', entity_id: createdUser.id,
      new_data: profile,
    })
    if (auditError) {
      await service.auth.admin.deleteUser(createdUser.id)
      throw auditError
    }

    return new Response(JSON.stringify({ user: { id: createdUser.id, username, role } }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
