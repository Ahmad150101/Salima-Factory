-- Production migration: 20261024171859_server_calendar_and_detailed_nylon
-- Backward-compatible nylon item tracking and authenticated factory calendar.
-- Legacy nylon columns are intentionally retained for older clients and exports.

create or replace function private.is_valid_nylon_items(items jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  item jsonb;
begin
  if jsonb_typeof(items) <> 'array' then return false; end if;
  for item in select value from jsonb_array_elements(items)
  loop
    if jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item -> 'name') <> 'string'
      or btrim(item ->> 'name') = ''
      or jsonb_typeof(item -> 'weight_kg') <> 'number'
      or (item ->> 'weight_kg')::numeric < 0
      or jsonb_typeof(item -> 'quantity') <> 'number'
      or (item ->> 'quantity')::numeric < 0
      or (item ->> 'quantity')::numeric <> trunc((item ->> 'quantity')::numeric)
    then return false;
    end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;
revoke all on function private.is_valid_nylon_items(jsonb) from public, anon, authenticated;
grant execute on function private.is_valid_nylon_items(jsonb) to authenticated, service_role;

alter table public.production_records
  add column if not exists transparent_nylon_items jsonb not null default '[]'::jsonb,
  add column if not exists printed_nylon_items jsonb not null default '[]'::jsonb;

update public.production_records
set transparent_nylon_items = jsonb_build_array(jsonb_build_object(
  'name', 'شفاف سابق', 'weight_kg', transparent_nylon_weight, 'quantity', 0
))
where transparent_nylon_items = '[]'::jsonb and transparent_nylon_weight > 0;

update public.production_records
set printed_nylon_items = jsonb_build_array(jsonb_build_object(
  'name', 'مطبوع سابق', 'weight_kg', printed_nylon_weight, 'quantity', printed_nylon_rolls
))
where printed_nylon_items = '[]'::jsonb
  and (printed_nylon_weight > 0 or printed_nylon_rolls > 0);

alter table public.production_records
  drop constraint if exists production_records_transparent_nylon_items_valid,
  add constraint production_records_transparent_nylon_items_valid
    check (private.is_valid_nylon_items(transparent_nylon_items)) not valid,
  drop constraint if exists production_records_printed_nylon_items_valid,
  add constraint production_records_printed_nylon_items_valid
    check (private.is_valid_nylon_items(printed_nylon_items)) not valid;

alter table public.production_records validate constraint production_records_transparent_nylon_items_valid;
alter table public.production_records validate constraint production_records_printed_nylon_items_valid;

create or replace function public.sync_production_nylon_legacy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  transparent_weight numeric;
  printed_weight numeric;
  printed_quantity integer;
  legacy_changed boolean;
begin
  new.transparent_nylon_items := coalesce(new.transparent_nylon_items, '[]'::jsonb);
  new.printed_nylon_items := coalesce(new.printed_nylon_items, '[]'::jsonb);

  legacy_changed := tg_op = 'UPDATE' and (
    new.transparent_nylon_weight is distinct from old.transparent_nylon_weight
    or new.printed_nylon_weight is distinct from old.printed_nylon_weight
    or new.printed_nylon_rolls is distinct from old.printed_nylon_rolls
    or new.printed_nylon_mode is distinct from old.printed_nylon_mode
  );

  if (tg_op = 'INSERT' and new.transparent_nylon_items = '[]'::jsonb and new.transparent_nylon_weight > 0)
     or (legacy_changed and new.transparent_nylon_items is not distinct from old.transparent_nylon_items) then
    new.transparent_nylon_items := case when new.transparent_nylon_weight > 0
      then jsonb_build_array(jsonb_build_object('name','شفاف سابق','weight_kg',new.transparent_nylon_weight,'quantity',0))
      else '[]'::jsonb end;
  end if;

  if (tg_op = 'INSERT' and new.printed_nylon_items = '[]'::jsonb and (new.printed_nylon_weight > 0 or new.printed_nylon_rolls > 0))
     or (legacy_changed and new.printed_nylon_items is not distinct from old.printed_nylon_items) then
    new.printed_nylon_items := case when new.printed_nylon_weight > 0 or new.printed_nylon_rolls > 0
      then jsonb_build_array(jsonb_build_object('name','مطبوع سابق','weight_kg',new.printed_nylon_weight,'quantity',new.printed_nylon_rolls))
      else '[]'::jsonb end;
  end if;

  select coalesce(sum((value ->> 'weight_kg')::numeric), 0)
    into transparent_weight from jsonb_array_elements(new.transparent_nylon_items);
  select coalesce(sum((value ->> 'weight_kg')::numeric), 0), coalesce(sum((value ->> 'quantity')::integer), 0)
    into printed_weight, printed_quantity from jsonb_array_elements(new.printed_nylon_items);

  new.transparent_nylon_weight := transparent_weight;
  new.printed_nylon_weight := printed_weight;
  new.printed_nylon_rolls := printed_quantity;
  new.printed_nylon_mode := case when printed_weight = 0 and printed_quantity > 0 then 'rolls' else 'weight' end;
  return new;
end;
$$;
revoke all on function public.sync_production_nylon_legacy() from public, anon, authenticated;

drop trigger if exists sync_nylon_legacy_fields on public.production_records;
create trigger sync_nylon_legacy_fields
before insert or update on public.production_records
for each row execute function public.sync_production_nylon_legacy();

comment on column public.production_records.transparent_nylon_weight is 'Deprecated compatibility total; use transparent_nylon_items.';
comment on column public.production_records.printed_nylon_mode is 'Deprecated compatibility field; use printed_nylon_items.';
comment on column public.production_records.printed_nylon_weight is 'Deprecated compatibility total; use printed_nylon_items.';
comment on column public.production_records.printed_nylon_rolls is 'Deprecated compatibility total; use printed_nylon_items.quantity.';

create or replace function public.get_factory_calendar()
returns table(today date, week_start date, week_end date)
language sql
stable
security invoker
set search_path = ''
as $$
  select private.factory_today(), private.current_week_start(), private.current_week_start() + 6;
$$;
revoke all on function public.get_factory_calendar() from public, anon;
grant execute on function public.get_factory_calendar() to authenticated;
