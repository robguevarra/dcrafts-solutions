import { NextRequest, NextResponse } from "next/server";
import { verifyTikTokWebhookSignature, normalizeTikTokOrder, type TikTokWebhookPayload } from "@/lib/tiktok/webhook";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/webhooks/tiktok
 *
 * Receives ORDER_STATUS_CHANGE events from TikTok Shop.
 * - Verifies HMAC signature before processing (reject otherwise).
 * - Immediately returns 200 to TikTok (< 5s SLA).
 * - Processes the order asynchronously (non-blocking).
 * - Respects `shadow_mode` feature flag: stores data but never writes back to TikTok.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Read raw body for HMAC verification
  const rawBody = await req.text();
  const signature = req.headers.get("x-tts-signature") ?? "";
  const appSecret = process.env.TIKTOK_WEBHOOK_SECRET ?? "";

  if (!appSecret) {
    console.error("[webhook/tiktok] TIKTOK_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  // 2. Reject unsigned or tampered requests
  if (!verifyTikTokWebhookSignature(rawBody, signature, appSecret)) {
    console.warn("[webhook/tiktok] Invalid signature — rejected");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3. Acknowledge TikTok immediately (they require < 5s response)
  //    Process the order in a detached async task.
  void processOrderAsync(rawBody);

  return NextResponse.json({ ok: true }, { status: 200 });
}

async function processOrderAsync(rawBody: string): Promise<void> {
  try {
    const payload: TikTokWebhookPayload = JSON.parse(rawBody);

    // Only handle order status change events (type 1)
    if (payload.type !== 1) return;

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

    // Upsert with UNIQUE(platform, platform_order_id) — prevents duplicates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("orders")
      .upsert(normalized, {
        onConflict: "platform,platform_order_id",
        ignoreDuplicates: false, // update status if exists
      });

    if (error) {
      console.error("[webhook/tiktok] DB upsert failed:", error.message);
      return;
    }

    console.log(
      `[webhook/tiktok] Order ingested: ${normalized.platform_order_id} | shadow=${shadowMode}`
    );
  } catch (err) {
    console.error("[webhook/tiktok] Processing failed:", err);
  }
}
