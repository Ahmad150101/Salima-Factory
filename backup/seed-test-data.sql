-- TEST-only DML seed. No schema changes. Idempotent by stable TEST markers.
-- Generates 75 days × 6 production records, 19 shipments, 5 products, and 75 explicit activity rows.
begin;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where is_active = true order by case when role in ('owner','admin') then 0 else 1 end, created_at limit 1),
  true
);

insert into public.products (
  name, bags_per_pallet, packs_per_bag, units_per_pack, unit_weight_kg, is_active, created_by, updated_by, created_at, updated_at
)
select name, bags_per_pallet, packs_per_bag, units_per_pack, unit_weight_kg, true, auth.uid(), auth.uid(), now(), now()
from (values
  ('TEST — مناديل اقتصادية', 28, 10, 6, 0.180::numeric),
  ('TEST — مناديل ناعمة',    30, 10, 5, 0.200::numeric),
  ('TEST — مناديل عائلية',   32,  8, 6, 0.225::numeric),
  ('TEST — رول مطبخ',        24,  6, 4, 0.450::numeric),
  ('TEST — رول حمام',        36, 12, 4, 0.150::numeric)
) as source(name, bags_per_pallet, packs_per_bag, units_per_pack, unit_weight_kg)
where not exists (select 1 from public.products p where p.name = source.name);

with test_products as (
  select p.*, row_number() over (order by p.name) as rn
  from public.products p
  where p.name in (
    'TEST — مناديل اقتصادية', 'TEST — مناديل ناعمة', 'TEST — مناديل عائلية',
    'TEST — رول مطبخ', 'TEST — رول حمام'
  )
), candidates as (
  select
    day_value::date as production_date,
    slot,
    concat('[TEST] PROD-', to_char(day_value, 'YYYYMMDD'), '-', lpad(slot::text, 2, '0')) as marker,
    ((day_number - 1) * 6 + slot - 1) % 5 + 1 as product_number
  from generate_series(current_date - 74, current_date, interval '1 day') with ordinality as days(day_value, day_number)
  cross join generate_series(1, 6) as slots(slot)
)
insert into public.production_records (
  production_date, shift, product_id, product_snapshot, rolls, pallets, extra_bags,
  transparent_nylon_items, printed_nylon_items, waste_weight, waste_type, notes,
  created_by, updated_by, created_at, updated_at
)
select
  c.production_date,
  case when c.slot <= 3 then 'صباحي' else 'مسائي' end,
  p.id,
  jsonb_build_object(
    'id', p.id, 'name', p.name, 'bagsPerPallet', p.bags_per_pallet,
    'packsPerBag', p.packs_per_bag, 'unitsPerPack', p.units_per_pack, 'unitWeightKg', p.unit_weight_kg
  ),
  jsonb_build_array(
    jsonb_build_object('code', concat('TEST-R-', to_char(c.production_date, 'YYMMDD'), '-', c.slot, '-1'), 'weight', 108 + c.slot, 'note', 'TEST رول أول'),
    jsonb_build_object('code', concat('TEST-R-', to_char(c.production_date, 'YYMMDD'), '-', c.slot, '-2'), 'weight', 104 + c.slot, 'note', 'TEST رول ثان')
  ) || case when c.slot % 2 = 0 then jsonb_build_array(
    jsonb_build_object('code', concat('TEST-R-', to_char(c.production_date, 'YYMMDD'), '-', c.slot, '-3'), 'weight', 98 + c.slot, 'note', 'TEST رول إضافي')
  ) else '[]'::jsonb end,
  4 + (c.slot % 4),
  c.slot % 3,
  jsonb_build_array(
    jsonb_build_object('name', 'TEST شفاف كبير', 'weight_kg', 18 + c.slot, 'quantity', 3 + (c.slot % 3)),
    jsonb_build_object('name', 'TEST شفاف صغير', 'weight_kg', 9 + c.slot, 'quantity', 2 + (c.slot % 2))
  ),
  jsonb_build_array(
    jsonb_build_object('name', 'TEST مطبوع رئيسي', 'weight_kg', 14 + c.slot, 'quantity', 2 + (c.slot % 3)),
    jsonb_build_object('name', 'TEST مطبوع احتياطي', 'weight_kg', 6 + c.slot, 'quantity', 1 + (c.slot % 2))
  ),
  case when (extract(day from c.production_date)::integer + c.slot) % 5 = 0 then round((0.4 + c.slot * 0.17)::numeric, 2) else 0 end,
  case when (extract(day from c.production_date)::integer + c.slot) % 5 = 0 then 'TEST تالف ضبط ماكينة' else null end,
  c.marker,
  auth.uid(), auth.uid(), c.production_date + time '07:00' + make_interval(hours => c.slot * 2), c.production_date + time '07:30' + make_interval(hours => c.slot * 2)
from candidates c
join test_products p on p.rn = c.product_number
where not exists (select 1 from public.production_records existing where existing.notes = c.marker);

with candidates as (
  select
    day_value::date as shipment_date,
    concat('TEST-SHIP-', to_char(day_value, 'YYYYMMDD')) as reference,
    row_number() over (order by day_value) as seq
  from generate_series(current_date - 72, current_date, interval '4 days') as days(day_value)
)
insert into public.shipments (
  shipment_date, supplier, container_count, roll_count, total_weight, reference, notes,
  created_by, updated_by, created_at, updated_at
)
select
  c.shipment_date, concat('TEST مورد ', 1 + (c.seq % 4)), 1 + (c.seq % 3), 18 + (c.seq % 9),
  round((2100 + c.seq * 37.5)::numeric, 2), c.reference, '[TEST] شحنة بيانات تجريبية',
  auth.uid(), auth.uid(), c.shipment_date + time '09:00', c.shipment_date + time '09:15'
from candidates c
where not exists (select 1 from public.shipments existing where existing.reference = c.reference);

with candidates as (
  select
    day_value::date as activity_date,
    concat('TEST-ACTIVITY-', to_char(day_value, 'YYYYMMDD')) as entity_id
  from generate_series(current_date - 74, current_date, interval '1 day') as days(day_value)
)
insert into public.audit_logs (user_id, action, entity_type, entity_id, old_data, new_data, created_at)
select auth.uid(), 'TEST_DAILY_ACTIVITY', 'test_seed', c.entity_id, null,
       jsonb_build_object('test_marker', 'TEST', 'description', 'TEST نشاط يومي للنسخ الاحتياطي'),
       c.activity_date + time '20:00'
from candidates c
where not exists (select 1 from public.audit_logs existing where existing.entity_type = 'test_seed' and existing.entity_id = c.entity_id);

commit;
