-- Run manually AFTER reviewing the migration. Do not put passwords here.
-- Replace the placeholders with the current Auth user's UUID and desired username.
-- The username must be 3-30 lowercase letters, digits, or underscores.

begin;

update public.profiles
set username = lower(trim('<CURRENT_USERNAME>')),
    role = 'owner',
    is_active = true,
    updated_at = now()
where id = '<CURRENT_AUTH_USER_UUID>'::uuid;

-- This must return exactly one row before COMMIT.
select id, username, full_name, role, is_active
from public.profiles
where id = '<CURRENT_AUTH_USER_UUID>'::uuid;

commit;
