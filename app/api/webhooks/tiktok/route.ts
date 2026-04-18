import { NextRequest, NextResponse } from "next/server";
import { verifyTikTokWebhookSignature, normalizeTikTokOrder, type TikTokWebhookPayload } from "@/lib/tiktok/webhook";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/webhooks/tiktok
 *
 * Receives events from TikTok Shop (ORDER_STATUS_CHANGE, reverse events, etc.)
 *
 * Signature verification:
 *   HMAC-SHA256(app_key + raw_body, app_secret) compared to x-tts-signature header.
 *   Uses TTS_APP_KEY + TTS_APP_SECRET — NOT a separate webhook secret.
 *
 * Response strategy:
 *   - Always return 200 within 5s (TikTok's SLA) for any recognized request.
 *   - Only process type=1 (ORDER_STATUS_CHANGE) — other types are ack'd and ignored.
 *   - Process asynchronously so the 200 is sent immediately.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody  = await req.text();
  const signature = req.headers.get("x-tts-signature") ?? "";

  const appKey    = process.env.TTS_APP_KEY    ?? "";
  const appSecret = process.env.TTS_APP_SECRET ?? "";

  if (!appKey || !appSecret) {
    console.error("[webhook/tiktok] TTS_APP_KEY or TTS_APP_SECRET not set");
    // Still return 200 to avoid TikTok disabling the webhook endpoint —
    // we'll fix the env var separately. Log is enough for alerting.
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Reject unsigned or tampered payloads
  if (!verifyTikTokWebhookSignature(rawBody, signature, appKey, appSecret)) {
    console.warn("[webhook/tiktok] Invalid signature — rejected", {
      received: signature.slice(0, 20) + "...",
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Acknowledge TikTok immediately (< 5s SLA) then process async
  void processAsync(rawBody);

  return NextResponse.json({ ok: true }, { status: 200 });
}

async function processAsync(rawBody: string): Promise<void> {
  let payload: TikTokWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("[webhook/tiktok] Failed to parse payload:", rawBody.slice(0, 200));
    return;
  }

  console.log(`[webhook/tiktok] Received type=${payload.type} shop=${payload.shop_id}`);

  // Only ingest ORDER_STATUS_CHANGE (type 1)
  // Other types (2=reverse, 3=product, etc.) are ack'd above and logged here
  if (payload.type !== 1) {
    console.log(`[webhook/tiktok] Ignoring non-order event type=${payload.type}`);
    return;
  }

  try {
    const supabase = createServiceClient();

    // Check shadow mode feature flag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: flag } = await (supabase as any)
      .from("feature_flags")
      .select("enabled")
      .eq("name", "shadow_mode")
      .single();

    const shadowMode = flag?.enabled ?? true;
    const normalized = normalizeTikTokOrder(payload);
    normalized.shadow_mode = shadowMode;

    // Upsert on UNIQUE(platform, platform_order_id) — deduplication guarantee
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("orders")
      .upsert(normalized, {
        onConflict: "platform,platform_order_id",
        ignoreDuplicates: false, // update status if order already exists
      });

    if (error) {
      console.error("[webhook/tiktok] DB upsert failed:", error.message);
      return;
    }

    console.log(
      `[webhook/tiktok] ✅ Order ingested: ${normalized.platform_order_id} status=${normalized.status} shadow=${shadowMode}`
    );
  } catch (err) {
    console.error("[webhook/tiktok] Processing error:", err);
  }
}
