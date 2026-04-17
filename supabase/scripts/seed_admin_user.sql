-- ============================================================
-- Admin User Setup
--
-- Run this AFTER you've signed up / logged in at least once.
-- It promotes your user to the 'admin' role so the dashboard
-- becomes accessible.
--
-- Steps:
--   1. Run: SELECT id, email FROM auth.users;
--      to find your user ID.
--   2. Replace 'YOUR-USER-UUID-HERE' below with your UUID.
--   3. Execute this SQL in Supabase Dashboard → SQL Editor.
--      OR run via MCP: apply this as a one-off query.
-- ============================================================

-- Set admin role in app_metadata (read by RLS policies)
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE id = 'YOUR-USER-UUID-HERE';

-- Verify it worked:
SELECT id, email, raw_app_meta_data ->> 'role' as role
FROM auth.users
WHERE id = 'YOUR-USER-UUID-HERE';
