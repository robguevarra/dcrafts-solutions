-- Migration 005: TikTok Shop OAuth Tokens
--
-- Stores access_token + refresh_token per authorized shop.
-- Tokens rotate: access_token expires every ~12h, refresh_token every 30 days.
-- The callback route upserts here. A background job (future) handles rotation.

CREATE TABLE IF NOT EXISTS shop_tokens (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             text        UNIQUE NOT NULL,
  seller_name         text,
  access_token        text        NOT NULL,
  refresh_token       text        NOT NULL,
  access_expires_at   timestamptz NOT NULL,
  refresh_expires_at  timestamptz NOT NULL,
  authorized_at       timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on every write
CREATE TRIGGER set_shop_tokens_updated_at
  BEFORE UPDATE ON shop_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Service role only — tokens are secrets, never expose via anon key
ALTER TABLE shop_tokens ENABLE ROW LEVEL SECURITY;

-- Only server-side (service role) can read/write tokens
CREATE POLICY "service_role_full_access" ON shop_tokens
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
