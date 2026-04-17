-- ============================================================
-- Dcrafts Operations Platform — Initial Schema Migration
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE order_platform AS ENUM ('tiktok', 'shopee');
CREATE TYPE order_status   AS ENUM (
  'pending_spec', 'spec_collected', 'in_production',
  'qc_upload', 'shipped', 'cancelled'
);
CREATE TYPE print_job_status AS ENUM ('queued', 'in_progress', 'done');
CREATE TYPE conversation_state AS ENUM (
  'new', 'pre_order_faq', 'pre_order_spec', 'post_order_spec',
  'order_confirmation', 'human_handoff', 'resolved'
);

-- ── 1. Orders ────────────────────────────────────────────────

CREATE TABLE orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform            order_platform   NOT NULL,
  platform_order_id   TEXT             NOT NULL,
  buyer_id            TEXT,
  buyer_name          TEXT,
  buyer_phone         TEXT,
  raw_payload         JSONB            NOT NULL DEFAULT '{}',
  status              order_status     NOT NULL DEFAULT 'pending_spec',
  shadow_mode         BOOLEAN          NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  -- Deduplication: one row per order per platform
  CONSTRAINT orders_platform_id_unique UNIQUE (platform, platform_order_id)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX orders_status_idx    ON orders (status);
CREATE INDEX orders_platform_idx  ON orders (platform);
CREATE INDEX orders_created_idx   ON orders (created_at DESC);

-- ── 2. Print Specs ───────────────────────────────────────────

CREATE TABLE print_specs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  font_name     TEXT,
  color_name    TEXT,
  size_cm       NUMERIC(5,2),
  letter_case   TEXT CHECK (letter_case IN ('upper', 'lower')),
  letters_text  TEXT,
  quantity      INTEGER NOT NULL DEFAULT 1,
  confirmed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX print_specs_order_idx ON print_specs (order_id);

-- ── 3. Pre-Order Intents ─────────────────────────────────────

CREATE TABLE pre_order_intents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tiktok_user_id  TEXT NOT NULL,
  font_name       TEXT,
  color_name      TEXT,
  size_cm         NUMERIC(5,2),
  letter_case     TEXT CHECK (letter_case IN ('upper', 'lower')),
  letters_text    TEXT,
  linked_order_id UUID REFERENCES orders (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX pre_order_user_idx ON pre_order_intents (tiktok_user_id);

-- ── 4. Print Jobs ────────────────────────────────────────────

CREATE TABLE print_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  designer_id     UUID,  -- references auth.users when auth is set up
  status          print_job_status NOT NULL DEFAULT 'queued',
  proof_photo_url TEXT,
  proof_sent_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER print_jobs_updated_at
  BEFORE UPDATE ON print_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX print_jobs_status_idx    ON print_jobs (status);
CREATE INDEX print_jobs_designer_idx  ON print_jobs (designer_id);
CREATE INDEX print_jobs_order_idx     ON print_jobs (order_id);

-- ── 5. Conversations ─────────────────────────────────────────

CREATE TABLE conversations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_conversation_id TEXT NOT NULL UNIQUE,
  buyer_id                 TEXT NOT NULL,
  order_id                 UUID REFERENCES orders (id) ON DELETE SET NULL,
  state                    conversation_state NOT NULL DEFAULT 'new',
  is_escalated             BOOLEAN NOT NULL DEFAULT FALSE,
  last_activity_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX conversations_buyer_idx      ON conversations (buyer_id);
CREATE INDEX conversations_escalated_idx  ON conversations (is_escalated) WHERE is_escalated = TRUE;

-- ── 6. Messages ──────────────────────────────────────────────

CREATE TABLE messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('buyer', 'bot', 'agent')),
  content          TEXT NOT NULL,
  suggested_reply  TEXT,
  was_sent         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at DESC);

-- ── 7. SMS Logs ──────────────────────────────────────────────

CREATE TABLE sms_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  phone                 TEXT NOT NULL,
  message               TEXT NOT NULL,
  semaphore_message_id  TEXT,
  status                TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 8. Feature Flags ─────────────────────────────────────────

CREATE TABLE feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed the 3 control flags (all disabled = full shadow mode)
INSERT INTO feature_flags (name, enabled, description) VALUES
  ('shadow_mode',           TRUE,  'Ingest orders without writing back to TikTok. Gate 1.'),
  ('chatbot_suggest_mode',  FALSE, 'Bot generates replies but human must approve. Gate 2.'),
  ('chatbot_auto_mode',     FALSE, 'Bot sends messages autonomously. Gate 3.');

-- ── RLS (Row Level Security) ──────────────────────────────────
-- Enable RLS on all tables (policies to be refined in T1.3)

ALTER TABLE orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_specs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_order_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags     ENABLE ROW LEVEL SECURITY;

-- Temporary: allow service role full access (tighten in T1.3)
CREATE POLICY "service_role_all" ON orders            FOR ALL USING (true);
CREATE POLICY "service_role_all" ON print_specs       FOR ALL USING (true);
CREATE POLICY "service_role_all" ON pre_order_intents FOR ALL USING (true);
CREATE POLICY "service_role_all" ON print_jobs        FOR ALL USING (true);
CREATE POLICY "service_role_all" ON conversations     FOR ALL USING (true);
CREATE POLICY "service_role_all" ON messages          FOR ALL USING (true);
CREATE POLICY "service_role_all" ON sms_logs          FOR ALL USING (true);
CREATE POLICY "service_role_all" ON feature_flags     FOR ALL USING (true);

-- Enable Realtime for KDS (print_jobs) and inbox (orders)
ALTER TABLE print_jobs REPLICA IDENTITY FULL;
ALTER TABLE orders     REPLICA IDENTITY FULL;
