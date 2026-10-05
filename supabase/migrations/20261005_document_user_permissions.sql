-- Documentation-only migration.
-- This change was already applied to the production Supabase project before this
-- file was committed. Do not re-run it against production without first checking
-- the migration history and the existing public.user_permissions definition.

create table if not exists public.user_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null check (permission_key in (
    'dashboard.view',
    'production.view','production.create','production.update','production.delete',
    'shipments.view','shipments.create','shipments.update','shipments.delete',
    'products.view','products.create','products.update','products.delete',
    'reports.view','reports.export','reports.print',
    'records.view','records.update','records.delete','records.export',
    'users.view','users.create','users.update',
    'activity.view','system.view'
  )),
  allowed boolean not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

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
      'records.view','records.update'
    )
    else false
  end;
$$;

create or replace function private.has_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.role = 'owner' then true
    else coalesce(
      (select up.allowed
       from public.user_permissions up
       where up.user_id = p.id
         and up.permission_key = requested_permission),
      private.role_has_permission(p.role, requested_permission)
    )
  end
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active = true;
$$;

revoke all on function private.role_has_permission(text,text) from public;
revoke all on function private.has_permission(text) from public;
grant execute on function private.has_permission(text) to authenticated;

alter table public.user_permissions enable row level security;
drop policy if exists user_permissions_select on public.user_permissions;
create policy user_permissions_select on public.user_permissions
for select to authenticated
using (user_id = (select auth.uid()) or (select private.current_app_role()) = 'owner');
drop policy if exists user_permissions_insert_owner on public.user_permissions;
create policy user_permissions_insert_owner on public.user_permissions
for insert to authenticated
with check ((select private.current_app_role()) = 'owner' and updated_by = (select auth.uid()));
drop policy if exists user_permissions_update_owner on public.user_permissions;
create policy user_permissions_update_owner on public.user_permissions
for update to authenticated
using ((select private.current_app_role()) = 'owner')
with check ((select private.current_app_role()) = 'owner' and updated_by = (select auth.uid()));
drop policy if exists user_permissions_delete_owner on public.user_permissions;
create policy user_permissions_delete_owner on public.user_permissions
for delete to authenticated
using ((select private.current_app_role()) = 'owner');

revoke all on table public.user_permissions from anon, authenticated;
grant select, insert, update, delete on table public.user_permissions to authenticated;

-- Data policies use the same permission function as the client. UI checks are
-- convenience only; these policies remain the authority for every API request.
drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated
using (
  (select private.has_permission('products.view'))
  or (select private.has_permission('production.view'))
  or (select private.has_permission('records.view'))
  or (select private.has_permission('reports.view'))
  or (select private.has_permission('dashboard.view'))
);
drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert to authenticated
with check ((select private.has_permission('products.create')));
drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated
using (
  (select private.has_permission('products.update'))
  or (select private.has_permission('products.delete'))
)
with check (
  (select private.has_permission('products.update'))
  or (select private.has_permission('products.delete'))
);
drop policy if exists products_delete on public.products;
create policy products_delete on public.products for delete to authenticated
using ((select private.has_permission('products.delete')));

drop policy if exists shipments_select on public.shipments;
create policy shipments_select on public.shipments for select to authenticated
using (
  (select private.has_permission('shipments.view'))
  or (select private.has_permission('reports.view'))
);
drop policy if exists shipments_insert on public.shipments;
create policy shipments_insert on public.shipments for insert to authenticated
with check ((select private.has_permission('shipments.create')) and created_by = (select auth.uid()));
drop policy if exists shipments_update on public.shipments;
create policy shipments_update on public.shipments for update to authenticated
using ((select private.has_permission('shipments.update')))
with check ((select private.has_permission('shipments.update')));
drop policy if exists shipments_delete on public.shipments;
create policy shipments_delete on public.shipments for delete to authenticated
using ((select private.has_permission('shipments.delete')));

drop policy if exists production_select on public.production_records;
create policy production_select on public.production_records for select to authenticated
using (
  (
    (select private.has_permission('production.view'))
    or (select private.has_permission('records.view'))
    or (select private.has_permission('reports.view'))
    or (select private.has_permission('dashboard.view'))
  )
  and ((select private.current_app_role()) in ('owner','admin') or created_by = (select auth.uid()))
);
drop policy if exists production_insert on public.production_records;
create policy production_insert on public.production_records for insert to authenticated
with check ((select private.has_permission('production.create')) and created_by = (select auth.uid()));
drop policy if exists production_update on public.production_records;
create policy production_update on public.production_records for update to authenticated
using (
  (
    (select private.has_permission('production.update'))
    or (select private.has_permission('records.update'))
  )
  and ((select private.current_app_role()) in ('owner','admin') or created_by = (select auth.uid()))
)
with check (
  (
    (select private.has_permission('production.update'))
    or (select private.has_permission('records.update'))
  )
  and ((select private.current_app_role()) in ('owner','admin') or created_by = (select auth.uid()))
);
drop policy if exists production_delete on public.production_records;
create policy production_delete on public.production_records for delete to authenticated
using (
  (
    (select private.has_permission('production.delete'))
    or (select private.has_permission('records.delete'))
  )
  and ((select private.current_app_role()) in ('owner','admin') or created_by = (select auth.uid()))
);

drop policy if exists audit_select_owner on public.audit_logs;
create policy audit_select_owner on public.audit_logs for select to authenticated
using ((select private.has_permission('activity.view')));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (select private.has_permission('users.view'))
  or (select private.has_permission('activity.view'))
  or (
    (select private.current_app_role()) in ('owner','admin')
    and (select private.has_permission('records.view'))
  )
);

drop policy if exists presence_select_self_or_owner on public.user_presence;
create policy presence_select_self_or_owner on public.user_presence for select to authenticated
using (user_id = (select auth.uid()) or (select private.has_permission('activity.view')));

create index if not exists user_permissions_user_idx on public.user_permissions(user_id);
