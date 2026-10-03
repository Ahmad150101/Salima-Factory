-- Salima Factory - clean-install Supabase schema
-- For new environments only. Existing production databases should use migrations.

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text check (username is null or username ~ '^[a-z0-9_]{3,30}$'),
  full_name text,
  role text not null default 'engineer' check (role in ('owner','admin','engineer')),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  last_login_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username)) where username is not null;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  bags_per_pallet integer not null check (bags_per_pallet > 0),
  packs_per_bag integer not null check (packs_per_bag > 0),
  units_per_pack integer not null check (units_per_pack > 0),
  unit_weight_kg numeric(12,3) not null check (unit_weight_kg > 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_date date not null,
  supplier text,
  container_count integer not null check (container_count > 0),
  roll_count integer not null check (roll_count > 0),
  total_weight numeric(14,2) not null check (total_weight > 0),
  reference text,
  notes text,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.production_records (
  id uuid primary key default gen_random_uuid(),
  production_date date not null,
  shift text not null,
  product_id uuid not null references public.products(id),
  product_snapshot jsonb not null default '{}'::jsonb,
  rolls jsonb not null default '[]'::jsonb,
  pallets integer not null default 0 check (pallets >= 0),
  extra_bags integer not null default 0 check (extra_bags >= 0),
  transparent_nylon_weight numeric(14,2) not null default 0 check (transparent_nylon_weight >= 0),
  printed_nylon_mode text not null default 'weight' check (printed_nylon_mode in ('weight','rolls')),
  printed_nylon_weight numeric(14,2) not null default 0 check (printed_nylon_weight >= 0),
  printed_nylon_rolls integer not null default 0 check (printed_nylon_rolls >= 0),
  waste_weight numeric(14,2) not null default 0 check (waste_weight >= 0),
  waste_type text,
  notes text,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  current_page text not null default 'dashboard'
    check (current_page in ('dashboard','production','shipments','products','reports','records','users','activity','system')),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists trg_shipments_updated_at on public.shipments;
create trigger trg_shipments_updated_at before update on public.shipments for each row execute function public.set_updated_at();
drop trigger if exists trg_production_updated_at on public.production_records;
create trigger trg_production_updated_at before update on public.production_records for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, coalesce(new.email, ''), nullif(new.raw_user_meta_data ->> 'full_name', ''), 'engineer')
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active = true;
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
    (select auth.uid()), tg_op, tg_table_name, row_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.audit_row() from public, anon, authenticated;

create or replace function public.sync_presence_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set last_activity_at = new.last_seen_at where id = new.user_id;
  return new;
end;
$$;
revoke all on function public.sync_presence_activity() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.shipments enable row level security;
alter table public.production_records enable row level security;
alter table public.audit_logs enable row level security;
alter table public.user_presence enable row level security;

create policy profiles_select on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.current_app_role()) = 'owner');

create policy products_select on public.products for select to authenticated
using ((select private.current_app_role()) in ('owner','admin','engineer'));
create policy products_insert on public.products for insert to authenticated
with check ((select private.current_app_role()) in ('owner','admin'));
create policy products_update on public.products for update to authenticated
using ((select private.current_app_role()) in ('owner','admin'))
with check ((select private.current_app_role()) in ('owner','admin'));
create policy products_delete on public.products for delete to authenticated
using ((select private.current_app_role()) in ('owner','admin'));

create policy shipments_select on public.shipments for select to authenticated
using ((select private.current_app_role()) in ('owner','admin'));
create policy shipments_insert on public.shipments for insert to authenticated
with check ((select private.current_app_role()) in ('owner','admin') and created_by = (select auth.uid()));
create policy shipments_update on public.shipments for update to authenticated
using ((select private.current_app_role()) in ('owner','admin'))
with check ((select private.current_app_role()) in ('owner','admin'));
create policy shipments_delete on public.shipments for delete to authenticated
using ((select private.current_app_role()) in ('owner','admin'));

create policy production_select on public.production_records for select to authenticated
using ((select private.current_app_role()) in ('owner','admin') or created_by = (select auth.uid()));
create policy production_insert on public.production_records for insert to authenticated
with check (created_by = (select auth.uid()) and (select private.current_app_role()) in ('owner','admin','engineer'));
create policy production_update on public.production_records for update to authenticated
using ((select private.current_app_role()) in ('owner','admin') or (created_by = (select auth.uid()) and production_date = current_date))
with check ((select private.current_app_role()) in ('owner','admin') or (created_by = (select auth.uid()) and production_date = current_date));
create policy production_delete on public.production_records for delete to authenticated
using ((select private.current_app_role()) in ('owner','admin'));

create policy audit_select_owner on public.audit_logs for select to authenticated
using ((select private.current_app_role()) = 'owner');
create policy presence_select_self_or_owner on public.user_presence for select to authenticated
using (user_id = (select auth.uid()) or (select private.current_app_role()) = 'owner');
create policy presence_insert_self on public.user_presence for insert to authenticated
with check (user_id = (select auth.uid()) and (select private.current_app_role()) is not null);
create policy presence_update_self on public.user_presence for update to authenticated
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
revoke all on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;
revoke all on table public.user_presence from anon, authenticated;
grant select, insert, update on table public.user_presence to authenticated;

drop trigger if exists set_actor_products on public.products;
create trigger set_actor_products before insert or update on public.products for each row execute function public.set_actor_columns();
drop trigger if exists set_actor_shipments on public.shipments;
create trigger set_actor_shipments before insert or update on public.shipments for each row execute function public.set_actor_columns();
drop trigger if exists set_actor_production on public.production_records;
create trigger set_actor_production before insert or update on public.production_records for each row execute function public.set_actor_columns();

drop trigger if exists audit_products on public.products;
create trigger audit_products after insert or update or delete on public.products for each row execute function public.audit_row();
drop trigger if exists audit_shipments on public.shipments;
create trigger audit_shipments after insert or update or delete on public.shipments for each row execute function public.audit_row();
drop trigger if exists audit_production on public.production_records;
create trigger audit_production after insert or update or delete on public.production_records for each row execute function public.audit_row();

drop trigger if exists sync_presence_activity on public.user_presence;
create trigger sync_presence_activity after insert or update on public.user_presence for each row execute function public.sync_presence_activity();

create index if not exists user_presence_last_seen_idx on public.user_presence(last_seen_at desc);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_filters_idx on public.audit_logs(user_id, entity_type, action, created_at desc);

insert into public.products (name, bags_per_pallet, packs_per_bag, units_per_pack, unit_weight_kg)
values
  ('محارم المنى 1.2 كغم', 27, 10, 6, 0.200),
  ('محارم المرام 1 كغم', 30, 10, 5, 0.200),
  ('محارم رانيا 1 كغم', 40, 10, 4, 0.250),
  ('محارم الهنا 1 كغم', 30, 10, 5, 0.200)
on conflict (name) do update set
  bags_per_pallet = excluded.bags_per_pallet,
  packs_per_bag = excluded.packs_per_bag,
  units_per_pack = excluded.units_per_pack,
  unit_weight_kg = excluded.unit_weight_kg,
  is_active = true;
