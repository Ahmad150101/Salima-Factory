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
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const service = createClient(url, envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: authData, error: authError } = await service.auth.getUser(token)
    if (authError || !authData.user) return json({ error: 'غير مصرح' }, 401)
    const { data: caller } = await service.from('profiles').select('role,is_active').eq('id', authData.user.id).single()
    if (!caller?.is_active || caller.role !== 'owner') return json({ error: 'صلاحية المالك مطلوبة' }, 403)

    const { user_id, new_password } = await req.json()
    if (!/^[0-9a-f-]{36}$/i.test(String(user_id || '')) || String(new_password || '').length < 8) return json({ error: 'بيانات غير صالحة' }, 400)
    const { data: target } = await service.from('profiles').select('id,username,full_name,role').eq('id', user_id).maybeSingle()
    if (!target) return json({ error: 'المستخدم غير موجود' }, 404)

    const { error } = await service.auth.admin.updateUserById(user_id, { password: new_password })
    if (error) throw error
    await service.from('audit_logs').insert({
      user_id: authData.user.id, action: 'PASSWORD_RESET', entity_type: 'profiles', entity_id: user_id,
      old_data: null, new_data: { username: target.username, role: target.role },
    })
    return json({ success: true })
  } catch (error) {
    console.error('reset-user-password failed', error)
    return json({ error: error instanceof Error ? error.message : 'تعذر إعادة تعيين كلمة المرور' }, 400)
  }
})
