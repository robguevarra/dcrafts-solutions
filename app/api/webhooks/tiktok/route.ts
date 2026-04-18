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
 * Handles TikTok Shop webhook events (type 1, 2, 4).
 *
 * ⚠️  SIGNATURE DEBUG MODE ACTIVE
 * We are logging the HMAC format that matches so we can lock down
 * the correct algorithm. Once confirmed, DEBUG_SIG_BYPASS will be removed.
 *
 * Current behavior: accept all requests, log signature result.
 * Real orders flow through — we're in shadow_mode so no external writes.
 */

// Set to false once we've confirmed the correct HMAC format in logs
const DEBUG_SIG_BYPASS = true;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody   = await req.text();
  const signature = req.headers.get("x-tts-signature")
    ?? req.headers.get("Authorization")
    ?? "";

  // ── Log ALL incoming headers for one-time forensics ──────────────────────
  const headerMap: Record<string, string> = {};
  req.headers.forEach((val, key) => { headerMap[key] = val; });
  console.log("[webhook/tiktok] Headers:", JSON.stringify(headerMap));
  console.log("[webhook/tiktok] Signature header value:", signature);
  console.log("[webhook/tiktok] Body preview:", rawBody.slice(0, 300));

  const appKey    = process.env.TTS_APP_KEY    ?? "";
  const appSecret = process.env.TTS_APP_SECRET ?? "";

  if (!appKey || !appSecret) {
    console.error("[webhook/tiktok] TTS_APP_KEY or TTS_APP_SECRET not set");
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── Probe all HMAC formats ────────────────────────────────────────────────
  const { matched, format } = verifyTikTokWebhookSignature(
    rawBody, signature, appKey, appSecret
  );

  if (matched) {
    console.log(`[webhook/tiktok] ✅ Signature MATCHED using format: "${format}"`);
  } else {
    console.warn(
      `[webhook/tiktok] ⚠️  Signature did NOT match any format.`,
      `sig_received=${signature.slice(0, 30)}...`,
      `bypass=${DEBUG_SIG_BYPASS}`
    );

    if (!DEBUG_SIG_BYPASS) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // In debug mode: continue processing so real orders aren't dropped
  }

  // Ack TikTok immediately, process async
  void processAsync(rawBody, appKey, appSecret);

  return NextResponse.json({ ok: true }, { status: 200 });
}

// ─── Async handler ────────────────────────────────────────────────────────────

async function processAsync(
  rawBody:   string,
  _appKey:   string,
  _appSecret: string
): Promise<void> {
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("[webhook/tiktok] Invalid JSON:", rawBody.slice(0, 200));
    return;
  }

  console.log(`[webhook/tiktok] Processing type=${payload.type} shop=${payload.shop_id}`);

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

    // ── Order Status Change (type 1) ────────────────────────────────────────
    case 1: {
      const data = payload.data as OrderStatusData;
      if (!data?.order_id) {
        console.warn("[webhook/tiktok] type=1 missing order_id");
        return;
      }

      await ingestOrder(
        {
          platform_order_id: data.order_id,
          buyer_id:          data.buyer_uid     ?? null,
          buyer_name:        data.buyer_username ?? null,
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

    // ── Reverse / Cancel / Return (type 2) ──────────────────────────────────
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

    // ── Cancellation Status Change (type 11) ─────────────────────────────────
    // Same structure as type 2 in our model
    case 11: {
      const data = payload.data as ReverseEventData;
      if (data?.order_id) {
        await handleReverseEvent(
          {
            order_id:             data.order_id,
            reverse_order_status: data.reverse_order_status ?? 0,
            reverse_event_type:   "CANCELLATION_STATUS_CHANGE",
            reverse_type:         1,
            update_time:          data.update_time ?? payload.timestamp,
          } satisfies ReverseEvent,
          supabase
        );
      }
      break;
    }

    // ── Recipient Address Update (type 4) ───────────────────────────────────
    case 4: {
      const data = payload.data as { order_id?: string };
      if (data?.order_id && accessToken) {
        const { enrichOrderDetail } = await import("@/lib/tiktok/order-ingest");
        await enrichOrderDetail(data.order_id, accessToken, supabase);
        console.log(`[webhook/tiktok] Address update re-enriched: ${data.order_id}`);
      }
      break;
    }

    default:
      console.log(`[webhook/tiktok] Unhandled type=${payload.type} — ack'd`);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
  update_time?:          number;
}
