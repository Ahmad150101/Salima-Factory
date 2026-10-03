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

    const body = await req.json()
    const userId = String(body.user_id || '')
    const updates: Record<string, unknown> = {}
    if (typeof body.full_name === 'string') {
      const fullName = body.full_name.trim()
      if (!fullName) return json({ error: 'الاسم الكامل مطلوب' }, 400)
      updates.full_name = fullName
    }
    if (['owner', 'admin', 'engineer'].includes(body.role)) updates.role = body.role
    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active
    if (!/^[0-9a-f-]{36}$/i.test(userId) || !Object.keys(updates).length) return json({ error: 'بيانات غير صالحة' }, 400)
    if (userId === authData.user.id && updates.is_active === false) return json({ error: 'لا يمكنك تعطيل حسابك' }, 400)

    const { data: target } = await service.from('profiles').select('id,username,full_name,role,is_active,created_by').eq('id', userId).single()
    if (!target) return json({ error: 'المستخدم غير موجود' }, 404)
    if (target.role === 'owner' && target.is_active && ((updates.role && updates.role !== 'owner') || updates.is_active === false)) {
      const { count } = await service.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'owner').eq('is_active', true)
      if ((count || 0) <= 1) return json({ error: 'لا يمكن تعديل أو تعطيل آخر مالك فعال' }, 400)
    }

    const { data, error } = await service.from('profiles').update(updates).eq('id', userId).select('id,username,full_name,role,is_active,created_by').single()
    if (error) throw error
    await service.from('audit_logs').insert({
      user_id: authData.user.id, action: 'UPDATE', entity_type: 'profiles', entity_id: userId, old_data: target, new_data: data,
    })
    return json({ user: data })
  } catch (error) {
    console.error('manage-user failed', error)
    return json({ error: error instanceof Error ? error.message : 'تعذر تحديث المستخدم' }, 400)
  }
})
