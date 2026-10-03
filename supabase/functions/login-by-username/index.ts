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
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const genericError = 'اسم المستخدم أو كلمة المرور غير صحيحة'
  try {
    const { username, password } = await req.json()
    const normalizedUsername = String(username || '').trim().toLowerCase()
    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername) || typeof password !== 'string') return json({ error: genericError }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const secretKey = envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
    const publishableKey = envKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
    const service = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: profile } = await service.from('profiles').select('id,email,is_active').eq('username', normalizedUsername).maybeSingle()
    if (!profile?.email || !profile.is_active) return json({ error: genericError }, 401)

    const auth = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await auth.auth.signInWithPassword({ email: profile.email, password })
    if (error || !data.session) return json({ error: genericError }, 401)

    const now = new Date().toISOString()
    await service.from('profiles').update({ last_login_at: now, last_activity_at: now }).eq('id', profile.id)

    return json({
      access_token: data.session.access_token, refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in, expires_at: data.session.expires_at, token_type: data.session.token_type,
    })
  } catch (error) {
    console.error('login-by-username failed', error)
    return json({ error: genericError }, 401)
  }
})
