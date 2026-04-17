-- ============================================================
-- Migration: 002_rbac_policies_and_fk_indexes
-- Resolves: security advisor (rls_policy_always_true × 8)
--           performance advisor (unindexed_foreign_keys × 3)
-- ============================================================

-- -------------------------------------------------------
-- SECTION 1: RLS POLICY HARDENING
--
-- Strategy:
--   - service_role bypasses RLS automatically — no explicit policy.
--   - authenticated admins (app_metadata.role = 'admin') get full
--     CRUD on operational tables via Server Actions / Server Components.
--   - anon gets NO direct access; all writes go via service_role key
--     server-side (webhooks, edge functions, cron jobs).
-- -------------------------------------------------------

-- orders: admin full CRUD
DROP POLICY IF EXISTS "service_role_all" ON public.orders;
CREATE POLICY "admin_full_access" ON public.orders
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- print_jobs: admin full CRUD
DROP POLICY IF EXISTS "service_role_all" ON public.print_jobs;
CREATE POLICY "admin_full_access" ON public.print_jobs
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- print_specs: admin full CRUD
DROP POLICY IF EXISTS "service_role_all" ON public.print_specs;
CREATE POLICY "admin_full_access" ON public.print_specs
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- feature_flags: admin read-only (writes are infra-managed via service_role)
DROP POLICY IF EXISTS "service_role_all" ON public.feature_flags;
CREATE POLICY "admin_read" ON public.feature_flags
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- conversations: service_role only in Phase 1 (no authenticated policy)
-- Phase 2 (Messaging Studio) will add: agent read + human_handoff escalation write
DROP POLICY IF EXISTS "service_role_all" ON public.conversations;

-- messages: service_role only in Phase 1
DROP POLICY IF EXISTS "service_role_all" ON public.messages;

-- sms_logs: service_role writes; admin read for audit trail
DROP POLICY IF EXISTS "service_role_all" ON public.sms_logs;
CREATE POLICY "admin_read" ON public.sms_logs
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- pre_order_intents: service_role only in Phase 1
DROP POLICY IF EXISTS "service_role_all" ON public.pre_order_intents;


-- -------------------------------------------------------
-- SECTION 2: MISSING FK INDEXES
-- Resolves: unindexed_foreign_keys advisor warnings
-- -------------------------------------------------------

-- conversations.order_id (used in joins from orders detail page)
CREATE INDEX IF NOT EXISTS conversations_order_id_idx
  ON public.conversations (order_id);

-- sms_logs.order_id (used in order detail audit trail)
CREATE INDEX IF NOT EXISTS sms_logs_order_id_idx
  ON public.sms_logs (order_id);

-- pre_order_intents.linked_order_id (used when linking intents to placed orders)
CREATE INDEX IF NOT EXISTS pre_order_intents_linked_order_id_idx
  ON public.pre_order_intents (linked_order_id);
