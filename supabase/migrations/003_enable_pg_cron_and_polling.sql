-- ============================================================
-- Migration: 003_enable_pg_cron_and_polling
-- Purpose: T1.7 — 15-minute TikTok order polling fallback
--
-- Components:
--   1. Enable pg_cron + pg_net extensions
--   2. Schedule the poll-tiktok-orders Edge Function every 15min
--
-- Architecture:
--   pg_cron → net.http_post → Edge Function (poll-tiktok-orders)
--   → TikTok GetOrderList API → upsert into public.orders
--
-- Why Edge Function instead of raw pg_net to TikTok?
--   TikTok requires HMAC-SHA256 signed requests. Native crypto
--   in Edge Functions is cleaner than Postgres extensions.
--   Edge Functions also have access to env vars (secrets).
--
-- Internal auth: x-internal-secret header (stored in app.poll_internal_secret)
-- ============================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Schedule the polling job (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('poll-tiktok-orders-every-15min');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job didn't exist, that's fine
END;
$$;

SELECT cron.schedule(
  'poll-tiktok-orders-every-15min',
  '*/15 * * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://qgonuztynqabujtamorm.supabase.co/functions/v1/poll-tiktok-orders',
    headers := jsonb_build_object(
      'Content-Type',       'application/json',
      'x-internal-secret',  current_setting('app.poll_internal_secret', true)
    ),
    body    := '{}'::jsonb
  )
  $job$
);
