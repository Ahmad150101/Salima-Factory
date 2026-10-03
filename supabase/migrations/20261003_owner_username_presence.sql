-- Safe additive migration for the existing Salima Factory database.
-- Existing users may keep username NULL until OWNER_BOOTSTRAP.sql is applied.

create schema if not exists private;

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists created_by uuid references public.profiles(id);
alter table public.profiles add column if not exists last_login_at timestamptz;
alter table public.profiles add column if not exists last_activity_at timestamptz;

alter table public.products add column if not exists created_by uuid references public.profiles(id);
alter table public.products add column if not exists updated_by uuid references public.profiles(id);
alter table public.shipments add column if not exists updated_by uuid references public.profiles(id);
alter table public.production_records add column if not exists updated_by uuid references public.profiles(id);

update public.profiles
set username = lower(trim(username))
where username is not null;

do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%admin%engineer%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check check (role in ('owner','admin','engineer')) not valid;
alter table public.profiles validate constraint profiles_role_check;

alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,30}$') not valid;
alter table public.profiles validate constraint profiles_username_format;

create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username))
  where username is not null;

create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  current_page text not null default 'dashboard'
    check (current_page in ('dashboard','production','shipments','products','reports','records','users','activity','system')),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    'engineer'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active = true;
$$;
revoke all on function private.current_app_role() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_app_role() to authenticated;

create or replace function public.set_actor_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  end if;
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
revoke all on function public.set_actor_columns() from public, anon, authenticated;

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare row_id text;
begin
  row_id := coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, '');
  insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data, new_data)
  values (
    (select auth.uid()),
    tg_op,
    tg_table_name,
    row_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.audit_row() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.shipments enable row level security;
alter table public.production_records enable row level security;
alter table public.audit_logs enable row level security;
alter table public.user_presence enable row level security;

do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','products','shipments','production_records','audit_logs','user_presence')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- The older helper is no longer used after replacing the policies above.
drop function if exists public.current_app_role();

create policy profiles_select on public.profiles
for select to authenticated
using (id = (select auth.uid()) or (select private.current_app_role()) = 'owner');

create policy products_select on public.products
for select to authenticated
using ((select private.current_app_role()) in ('owner','admin','engineer'));
create policy products_insert on public.products
for insert to authenticated
with check ((select private.current_app_role()) in ('owner','admin'));
create policy products_update on public.products
for update to authenticated
using ((select private.current_app_role()) in ('owner','admin'))
with check ((select private.current_app_role()) in ('owner','admin'));
create policy products_delete on public.products
for delete to authenticated
using ((select private.current_app_role()) in ('owner','admin'));

create policy shipments_select on public.shipments
for select to authenticated
using ((select private.current_app_role()) in ('owner','admin'));
create policy shipments_insert on public.shipments
for insert to authenticated
with check ((select private.current_app_role()) in ('owner','admin') and created_by = (select auth.uid()));
create policy shipments_update on public.shipments
for update to authenticated
using ((select private.current_app_role()) in ('owner','admin'))
with check ((select private.current_app_role()) in ('owner','admin'));
create policy shipments_delete on public.shipments
for delete to authenticated
using ((select private.current_app_role()) in ('owner','admin'));

create policy production_select on public.production_records
for select to authenticated
using ((select private.current_app_role()) in ('owner','admin') or created_by = (select auth.uid()));
create policy production_insert on public.production_records
for insert to authenticated
with check (created_by = (select auth.uid()) and (select private.current_app_role()) in ('owner','admin','engineer'));
create policy production_update on public.production_records
for update to authenticated
using ((select private.current_app_role()) in ('owner','admin') or (created_by = (select auth.uid()) and production_date = current_date))
with check ((select private.current_app_role()) in ('owner','admin') or (created_by = (select auth.uid()) and production_date = current_date));
create policy production_delete on public.production_records
for delete to authenticated
using ((select private.current_app_role()) in ('owner','admin'));

create policy audit_select_owner on public.audit_logs
for select to authenticated
using ((select private.current_app_role()) = 'owner');

-- Users may read their own presence row so UPSERT can perform its conflict update.
-- Only the owner may read presence rows belonging to other users.
create policy presence_select_self_or_owner on public.user_presence
for select to authenticated
using (user_id = (select auth.uid()) or (select private.current_app_role()) = 'owner');
create policy presence_insert_self on public.user_presence
for insert to authenticated
with check (user_id = (select auth.uid()) and (select private.current_app_role()) is not null);
create policy presence_update_self on public.user_presence
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
revoke all on table public.products from anon, authenticated;
grant select, insert, update, delete on table public.products to authenticated;
revoke all on table public.shipments from anon, authenticated;
grant select, insert, update, delete on table public.shipments to authenticated;
revoke all on table public.production_records from anon, authenticated;
grant select, insert, update, delete on table public.production_records to authenticated;
revoke all on table public.user_presence from anon, authenticated;
grant select, insert, update on table public.user_presence to authenticated;
revoke all on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;

drop trigger if exists set_actor_products on public.products;
create trigger set_actor_products
before insert or update on public.products
for each row execute function public.set_actor_columns();

drop trigger if exists set_actor_shipments on public.shipments;
create trigger set_actor_shipments
before insert or update on public.shipments
for each row execute function public.set_actor_columns();

drop trigger if exists set_actor_production on public.production_records;
create trigger set_actor_production
before insert or update on public.production_records
for each row execute function public.set_actor_columns();

-- Profile administration is done only through owner-only Edge Functions.
-- Do not attach the generic profile audit trigger: last_login/last_activity are system fields
-- and would otherwise generate noisy audit entries every heartbeat.
drop trigger if exists audit_profiles on public.profiles;

create index if not exists user_presence_last_seen_idx on public.user_presence(last_seen_at desc);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_filters_idx on public.audit_logs(user_id, entity_type, action, created_at desc);

create or replace function public.sync_presence_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set last_activity_at = new.last_seen_at
  where id = new.user_id;
  return new;
end;
$$;
revoke all on function public.sync_presence_activity() from public, anon, authenticated;
drop trigger if exists sync_presence_activity on public.user_presence;
create trigger sync_presence_activity
after insert or update on public.user_presence
for each row execute function public.sync_presence_activity();
