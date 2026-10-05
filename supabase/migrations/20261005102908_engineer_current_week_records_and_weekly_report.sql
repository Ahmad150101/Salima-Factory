-- Documentation-only migration.
-- Migration 20261005102908_engineer_current_week_records_and_weekly_report
-- was already applied to Supabase production before this file was committed.
-- Do not re-run it against production.

create or replace function private.factory_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Hebron')::date;
$$;

create or replace function private.current_week_start()
returns date
language sql
stable
set search_path = ''
as $$
  select private.factory_today()
         - (((extract(dow from private.factory_today())::integer + 1) % 7));
$$;

revoke all on function private.factory_today() from public;
revoke all on function private.current_week_start() from public;
grant execute on function private.factory_today() to authenticated;
grant execute on function private.current_week_start() to authenticated;

create or replace function private.role_has_permission(app_role text, requested_permission text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when app_role = 'owner' then true
    when app_role = 'admin' then requested_permission in (
      'dashboard.view',
      'production.view','production.create','production.update','production.delete',
      'shipments.view','shipments.create','shipments.update','shipments.delete',
      'products.view','products.create','products.update','products.delete',
      'reports.view','reports.export','reports.print',
      'records.view','records.update','records.delete','records.export'
    )
    when app_role = 'engineer' then requested_permission in (
      'dashboard.view',
      'production.view','production.create','production.update',
      'records.view','records.update',
      'reports.view'
    )
    else false
  end;
$$;

drop policy if exists shipments_select on public.shipments;
create policy shipments_select on public.shipments
for select to authenticated
using (
  (select private.has_permission('shipments.view'))
  or (
    (select private.current_app_role()) in ('owner','admin')
    and (select private.has_permission('reports.view'))
  )
);

drop policy if exists production_select on public.production_records;
create policy production_select on public.production_records
for select to authenticated
using (
  (
    (select private.has_permission('production.view'))
    or (select private.has_permission('records.view'))
    or (select private.has_permission('reports.view'))
    or (select private.has_permission('dashboard.view'))
  )
  and (
    (select private.current_app_role()) in ('owner','admin')
    or (
      (select private.current_app_role()) = 'engineer'
      and created_by = (select auth.uid())
      and production_date >= (select private.current_week_start())
      and production_date <= (select private.factory_today())
    )
  )
);

drop policy if exists production_insert on public.production_records;
create policy production_insert on public.production_records
for insert to authenticated
with check (
  (select private.has_permission('production.create'))
  and created_by = (select auth.uid())
  and (
    (select private.current_app_role()) in ('owner','admin')
    or (
      (select private.current_app_role()) = 'engineer'
      and production_date >= (select private.current_week_start())
      and production_date <= (select private.factory_today())
    )
  )
);

drop policy if exists production_update on public.production_records;
create policy production_update on public.production_records
for update to authenticated
using (
  (
    (select private.has_permission('production.update'))
    or (select private.has_permission('records.update'))
  )
  and (
    (select private.current_app_role()) in ('owner','admin')
    or (
      (select private.current_app_role()) = 'engineer'
      and created_by = (select auth.uid())
      and production_date >= (select private.current_week_start())
      and production_date <= (select private.factory_today())
    )
  )
)
with check (
  (
    (select private.has_permission('production.update'))
    or (select private.has_permission('records.update'))
  )
  and (
    (select private.current_app_role()) in ('owner','admin')
    or (
      (select private.current_app_role()) = 'engineer'
      and created_by = (select auth.uid())
      and production_date >= (select private.current_week_start())
      and production_date <= (select private.factory_today())
    )
  )
);

drop policy if exists production_delete on public.production_records;
create policy production_delete on public.production_records
for delete to authenticated
using (
  (
    (select private.has_permission('production.delete'))
    or (select private.has_permission('records.delete'))
  )
  and (select private.current_app_role()) in ('owner','admin')
);
