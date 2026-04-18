import { NextRequest, NextResponse } from "next/server";
import { verifyTikTokWebhookSignature } from "@/lib/tiktok/webhook";
import { createServiceClient } from "@/lib/supabase/server";
import {
  ingestOrder,
  handleReverseEvent,
  mapTikTokStatus,
  type ReverseEvent,
} from "@/lib/tiktok/order-ingest";

/**
 * POST /api/webhooks/tiktok
 *
 * Handles all TikTok Shop webhook event types:
 *   type 1 — ORDER_STATUS_CHANGE
 *   type 2 — Reverse Status Update (cancellations, returns)
 *   type 4 — Recipient Address Update  (address changes before shipment)
 *
 * Signature: HMAC-SHA256(app_key + raw_body, app_secret)
 * Header:    x-tts-signature
 *
 * Response strategy: always 200 within 5s. Process async after ack.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody   = await req.text();
  const signature = req.headers.get("x-tts-signature") ?? "";

  const appKey    = process.env.TTS_APP_KEY    ?? "";
  const appSecret = process.env.TTS_APP_SECRET ?? "";

  if (!appKey || !appSecret) {
    // Log but still return 200 — avoid TikTok disabling the endpoint
    console.error("[webhook/tiktok] TTS_APP_KEY or TTS_APP_SECRET not set");
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (!verifyTikTokWebhookSignature(rawBody, signature, appKey, appSecret)) {
    console.warn("[webhook/tiktok] Signature mismatch — rejected");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ack TikTok immediately, process async
  void processAsync(rawBody, appKey, appSecret);

  return NextResponse.json({ ok: true }, { status: 200 });
}

// ─── Async handler ────────────────────────────────────────────────────────────

async function processAsync(
  rawBody:   string,
  appKey:    string,
  appSecret: string
): Promise<void> {
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("[webhook/tiktok] Invalid JSON payload:", rawBody.slice(0, 200));
    return;
  }

  console.log(`[webhook/tiktok] type=${payload.type} shop=${payload.shop_id}`);

  const supabase = createServiceClient();

  // Load access_token for Order Detail enrichment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tokenRow } = await (supabase as any)
    .from("shop_tokens")
    .select("access_token")
    .order("authorized_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const accessToken: string = tokenRow?.access_token ?? "";

  // Shadow mode flag
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: flag } = await (supabase as any)
    .from("feature_flags")
    .select("enabled")
    .eq("name", "shadow_mode")
    .single();
  const shadowMode: boolean = flag?.enabled ?? true;

  switch (payload.type) {

    // ── Order Status Change ─────────────────────────────────────────────────
    case 1: {
      const data = payload.data as OrderStatusData;
      if (!data?.order_id) {
        console.warn("[webhook/tiktok] type=1 missing order_id");
        return;
      }

      await ingestOrder(
        {
          platform_order_id: data.order_id,
          buyer_id:          data.buyer_uid      ?? null,
          buyer_name:        data.buyer_username  ?? null,
          raw_payload:       payload as unknown as Record<string, unknown>,
          status:            mapTikTokStatus(data.order_status ?? ""),
          shadow_mode:       shadowMode,
          tiktok_updated_at: data.update_time
            ? new Date(data.update_time * 1000).toISOString()
            : null,
        },
        accessToken,
        supabase
      );
      break;
    }

    // ── Reverse / Cancellation / Return ────────────────────────────────────
    case 2: {
      const data = payload.data as ReverseEventData;
      if (!data?.order_id) {
        console.warn("[webhook/tiktok] type=2 missing order_id");
        return;
      }

      await handleReverseEvent(
        {
          order_id:             data.order_id,
          reverse_order_id:     data.reverse_order_id,
          reverse_order_status: data.reverse_order_status ?? 0,
          reverse_event_type:   data.reverse_event_type   ?? "UNKNOWN",
          reverse_type:         data.reverse_type         ?? 0,
          update_time:          data.update_time          ?? payload.timestamp,
        } satisfies ReverseEvent,
        supabase
      );
      break;
    }

    // ── Recipient Address Update ────────────────────────────────────────────
    // Buyer changed their shipping address before shipment.
    // We must re-fetch Order Detail to get the corrected address.
    case 4: {
      const data = payload.data as { order_id?: string };
      if (!data?.order_id) {
        console.warn("[webhook/tiktok] type=4 missing order_id");
        return;
      }

      if (!accessToken) {
        console.error("[webhook/tiktok] No access token — cannot re-fetch address for", data.order_id);
        return;
      }

      const { enrichOrderDetail } = await import("@/lib/tiktok/order-ingest");
      await enrichOrderDetail(data.order_id, accessToken, supabase);
      console.log(`[webhook/tiktok] Address update re-enriched: ${data.order_id}`);
      break;
    }

    // ── Unknown type — log and ignore ──────────────────────────────────────
    default:
      console.log(`[webhook/tiktok] Unhandled event type=${payload.type} — ack'd, not processed`);
  }
}

// ─── Payload Types ────────────────────────────────────────────────────────────

interface WebhookPayload {
  type:      number;
  shop_id:   string;
  timestamp: number;
  data:      Record<string, unknown>;
}

interface OrderStatusData {
  order_id?:       string;
  order_status?:   string;
  buyer_uid?:      string;
  buyer_username?: string;
  update_time?:    number;
}

interface ReverseEventData {
  order_id?:             string;
  reverse_order_id?:     string;
  reverse_event_type?:   string;
  reverse_order_status?: number;
  reverse_type?:         number;
  reverse_user?:         number;
  update_time?:          number;
}
