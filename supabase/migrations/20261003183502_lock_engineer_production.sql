-- Production permissions and validation for the clarified workflow.
-- Engineer: every required production field must be complete on INSERT and UPDATE.
-- Engineer may edit their own saved records later.
-- Admin/Owner: may save operationally incomplete records so they can correct or complete them later.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (select private.current_app_role()) in ('owner', 'admin')
);

drop policy if exists production_select on public.production_records;
create policy production_select on public.production_records
for select to authenticated
using (
  (select private.current_app_role()) in ('owner', 'admin')
  or created_by = (select auth.uid())
);

drop policy if exists production_insert on public.production_records;
create policy production_insert on public.production_records
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.current_app_role()) in ('owner', 'admin', 'engineer')
);

drop policy if exists production_update on public.production_records;
create policy production_update on public.production_records
for update to authenticated
using (
  (select private.current_app_role()) in ('owner', 'admin')
  or ((select private.current_app_role()) = 'engineer' and created_by = (select auth.uid()))
)
with check (
  (select private.current_app_role()) in ('owner', 'admin')
  or ((select private.current_app_role()) = 'engineer' and created_by = (select auth.uid()))
);

drop policy if exists production_delete on public.production_records;
create policy production_delete on public.production_records
for delete to authenticated
using ((select private.current_app_role()) in ('owner', 'admin'));

-- Remove the previously proposed global strict checks.
-- Strict completeness is role-aware and enforced by the trigger below only for engineers.
alter table public.production_records
  drop constraint if exists production_records_pallets_positive;
alter table public.production_records
  drop constraint if exists production_records_printed_nylon_consistent;

create or replace function public.prepare_production_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authenticated user required';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_at := now();
    new.updated_by := null;
    new.updated_at := new.created_at;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := (select auth.uid());
    new.updated_at := now();
  end if;

  return new;
end;
$$;
revoke all on function public.prepare_production_record() from public, anon, authenticated;

create or replace function public.validate_production_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  app_role text;
  roll_item jsonb;
  normalized_codes text[] := array[]::text[];
  normalized_code text;
begin
  app_role := (select private.current_app_role());

  -- Structural fields remain required for every record because the base schema uses
  -- NOT NULL / FK constraints and reports depend on them. The UI always pre-fills them.
  new.shift := btrim(coalesce(new.shift, ''));
  if new.production_date is null or new.shift = '' or new.product_id is null then
    raise exception 'Production date, shift and product are required';
  end if;

  -- Normalize nullable/blank management values without forcing completeness.
  new.notes := coalesce(btrim(new.notes), '');
  new.rolls := coalesce(new.rolls, '[]'::jsonb);
  new.pallets := coalesce(new.pallets, 0);
  new.extra_bags := coalesce(new.extra_bags, 0);
  new.transparent_nylon_weight := coalesce(new.transparent_nylon_weight, 0);
  new.printed_nylon_weight := coalesce(new.printed_nylon_weight, 0);
  new.printed_nylon_rolls := coalesce(new.printed_nylon_rolls, 0);
  new.waste_weight := coalesce(new.waste_weight, 0);
  new.waste_type := coalesce(btrim(new.waste_type), 'لا يوجد');
  new.printed_nylon_mode := case when new.printed_nylon_mode in ('weight', 'rolls') then new.printed_nylon_mode else 'weight' end;

  if new.pallets < 0 or new.extra_bags < 0 or new.transparent_nylon_weight < 0 or new.waste_weight < 0
     or new.printed_nylon_weight < 0 or new.printed_nylon_rolls < 0 then
    raise exception 'Production numeric values cannot be negative';
  end if;

  if new.printed_nylon_mode = 'weight' then
    new.printed_nylon_rolls := 0;
  else
    new.printed_nylon_weight := 0;
  end if;

  -- Admin/Owner may intentionally save an incomplete operational record.
  if app_role in ('owner', 'admin') then
    return new;
  end if;

  -- Engineer must provide a complete record on every save, including later edits.
  if app_role <> 'engineer' then
    raise exception 'Valid application role required';
  end if;

  if new.pallets <= 0 then
    raise exception 'Engineer must enter pallets greater than zero';
  end if;

  if new.notes = '' then
    raise exception 'Engineer must enter production notes';
  end if;

  if new.waste_weight > 0 and (new.waste_type = '' or new.waste_type = 'لا يوجد') then
    raise exception 'Engineer must enter waste type when waste weight is greater than zero';
  elsif new.waste_weight = 0 then
    new.waste_type := 'لا يوجد';
  end if;

  if jsonb_typeof(new.rolls) <> 'array' or jsonb_array_length(new.rolls) < 1 then
    raise exception 'Engineer must enter at least one roll';
  end if;

  for roll_item in select value from jsonb_array_elements(new.rolls)
  loop
    if jsonb_typeof(roll_item) <> 'object'
      or jsonb_typeof(roll_item -> 'code') <> 'string'
      or btrim(roll_item ->> 'code') = ''
      or jsonb_typeof(roll_item -> 'weight') <> 'number'
      or (roll_item ->> 'weight')::numeric <= 0 then
      raise exception 'Engineer must enter a code and positive weight for every roll';
    end if;

    normalized_code := lower(btrim(roll_item ->> 'code'));
    if normalized_code = any(normalized_codes) then
      raise exception 'Duplicate roll code: %', btrim(roll_item ->> 'code');
    end if;
    normalized_codes := array_append(normalized_codes, normalized_code);
  end loop;

  return new;
end;
$$;
revoke all on function public.validate_production_record() from public, anon, authenticated;

drop trigger if exists set_actor_production on public.production_records;
drop trigger if exists trg_production_updated_at on public.production_records;
drop trigger if exists prepare_production_record on public.production_records;
create trigger prepare_production_record
before insert or update on public.production_records
for each row execute function public.prepare_production_record();

drop trigger if exists validate_production_record on public.production_records;
create trigger validate_production_record
before insert or update on public.production_records
for each row execute function public.validate_production_record();

-- Keep complete old/new snapshots for the owner audit UI.
drop trigger if exists audit_production on public.production_records;
create trigger audit_production
after insert or update or delete on public.production_records
for each row execute function public.audit_row();
