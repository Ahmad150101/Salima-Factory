-- Optional TEST-only cleanup. Do not run unless the user explicitly requests removal.
-- Deletes only rows carrying the stable TEST markers created by seed-test-data.sql.
begin;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where is_active = true order by case when role in ('owner','admin') then 0 else 1 end, created_at limit 1),
  true
);

delete from public.production_records where notes like '[TEST] PROD-%';
delete from public.shipments where reference like 'TEST-SHIP-%' and notes like '[TEST]%';
delete from public.products where name like 'TEST — %';

-- Run last so audit rows created by the TEST deletes are removed as well.
delete from public.audit_logs
where entity_type = 'test_seed'
   or action = 'TEST_DAILY_ACTIVITY'
   or (entity_type = 'production_records' and coalesce(new_data->>'notes', old_data->>'notes', '') like '[TEST] PROD-%')
   or (entity_type = 'shipments' and coalesce(new_data->>'reference', old_data->>'reference', '') like 'TEST-SHIP-%')
   or (entity_type = 'products' and coalesce(new_data->>'name', old_data->>'name', '') like 'TEST — %');

commit;
