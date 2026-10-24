import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' }
const pageSize = 1000

async function fetchAllRows(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>,
) {
  const rows: unknown[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1)
    if (error) throw new Error(error.message || 'Supabase export query failed')
    const page = data || []
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

Deno.serve(async request => {
  try {
    if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders })
    const body = await request.json().catch(() => ({})) as { token?: string }
    const expectedToken = Deno.env.get('DAILY_SYNC_TOKEN')
    if (!expectedToken || body.token !== expectedToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase runtime secrets')
    const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

    const [products, production, shipments, activity, profiles, permissions] = await Promise.all([
      fetchAllRows((from, to) => db.from('products').select('*').order('name').range(from, to)),
      fetchAllRows((from, to) => db.from('production_records').select('*').order('production_date').order('id').range(from, to)),
      fetchAllRows((from, to) => db.from('shipments').select('*').order('shipment_date').order('id').range(from, to)),
      fetchAllRows((from, to) => db.from('audit_logs').select('*').order('created_at').order('id').range(from, to)),
      fetchAllRows((from, to) => db.from('profiles').select('id,username,full_name,role,is_active,created_at').order('created_at').order('id').range(from, to)),
      fetchAllRows((from, to) => db.from('user_permissions').select('user_id,permission_key,allowed,updated_by,updated_at').order('user_id').order('permission_key').range(from, to)),
    ])

    return new Response(JSON.stringify({
      generated_at: new Date().toISOString(), products, production, shipments, activity, profiles, permissions,
    }), { status: 200, headers: jsonHeaders })
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: jsonHeaders })
  }
})
