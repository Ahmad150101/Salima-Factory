-- Salima Factory v4 - Supabase schema
-- Run this file once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'engineer' check (role in ('admin','engineer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  bags_per_pallet integer not null check (bags_per_pallet > 0),
  packs_per_bag integer not null check (packs_per_bag > 0),
  units_per_pack integer not null check (units_per_pack > 0),
  unit_weight_kg numeric(12,3) not null check (unit_weight_kg > 0),
  is_active boolean not null default true,
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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
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
set search_path = public
as $$
begin
  -- Security rule: a newly-created Auth user always starts as engineer.
  -- Never trust client-controlled user metadata for authorization.
  -- Admin promotion is performed only by an existing admin/server-side flow.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id text;
begin
  row_id := coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, '');
  insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data, new_data)
  values (
    auth.uid(), tg_op, tg_table_name, row_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.shipments enable row level security;
alter table public.production_records enable row level security;
alter table public.audit_logs enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (id = auth.uid() or public.current_app_role() = 'admin');
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

-- products: everyone logged in may read; only admin may change
drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated using (true);
drop policy if exists products_insert_admin on public.products;
create policy products_insert_admin on public.products for insert to authenticated with check (public.current_app_role() = 'admin');
drop policy if exists products_update_admin on public.products;
create policy products_update_admin on public.products for update to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
drop policy if exists products_delete_admin on public.products;
create policy products_delete_admin on public.products for delete to authenticated using (public.current_app_role() = 'admin');

-- shipments: admin only
drop policy if exists shipments_select_admin on public.shipments;
create policy shipments_select_admin on public.shipments for select to authenticated using (public.current_app_role() = 'admin');
drop policy if exists shipments_insert_admin on public.shipments;
create policy shipments_insert_admin on public.shipments for insert to authenticated with check (public.current_app_role() = 'admin' and created_by = auth.uid());
drop policy if exists shipments_update_admin on public.shipments;
create policy shipments_update_admin on public.shipments for update to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
drop policy if exists shipments_delete_admin on public.shipments;
create policy shipments_delete_admin on public.shipments for delete to authenticated using (public.current_app_role() = 'admin');

-- production: admin sees all; engineer sees/creates own records. Engineer may update own record on the same production day.
drop policy if exists production_select on public.production_records;
create policy production_select on public.production_records for select to authenticated
using (public.current_app_role() = 'admin' or created_by = auth.uid());
drop policy if exists production_insert on public.production_records;
create policy production_insert on public.production_records for insert to authenticated
with check (created_by = auth.uid() and public.current_app_role() in ('admin','engineer'));
drop policy if exists production_update on public.production_records;
create policy production_update on public.production_records for update to authenticated
using (public.current_app_role() = 'admin' or (created_by = auth.uid() and production_date = current_date))
with check (public.current_app_role() = 'admin' or (created_by = auth.uid() and production_date = current_date));
drop policy if exists production_delete_admin on public.production_records;
create policy production_delete_admin on public.production_records for delete to authenticated
using (public.current_app_role() = 'admin');

-- audit log is admin-readable only
drop policy if exists audit_select_admin on public.audit_logs;
create policy audit_select_admin on public.audit_logs for select to authenticated using (public.current_app_role() = 'admin');

-- Audit business tables
drop trigger if exists audit_products on public.products;
create trigger audit_products after insert or update or delete on public.products for each row execute function public.audit_row();
drop trigger if exists audit_shipments on public.shipments;
create trigger audit_shipments after insert or update or delete on public.shipments for each row execute function public.audit_row();
drop trigger if exists audit_production on public.production_records;
create trigger audit_production after insert or update or delete on public.production_records for each row execute function public.audit_row();

-- Default products
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
