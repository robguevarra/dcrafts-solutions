import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatOrderTime } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Order } from "@/types/database";
import {
  Package,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
  Truck,
  AlertCircle,
} from "lucide-react";
import { SyncButton } from "./SyncButton";

const PAGE_SIZE = 25;

/** Maps status → icon + label for filter pills */
const STATUS_FILTERS = [
  { value: "",               label: "All",           icon: null },
  { value: "pending_spec",   label: "Pending",       icon: Clock },
  { value: "spec_collected", label: "Spec Collected", icon: CheckCircle2 },
  { value: "shipped",        label: "Shipped",       icon: Truck },
  { value: "cancelled",      label: "Cancelled",     icon: XCircle },
] as const;

/**
 * Admin Order Inbox — Server Component (URL-driven state)
 *
 * URL params:
 *   ?status=shipped  filter by order status
 *   ?q=583...        search by platform_order_id or phone
 *   ?noDetail=1      show only orders with NULL detail_fetched_at
 *   ?page=2          pagination (25/page)
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawStatus  = typeof params.status   === "string" ? params.status   : "";
  const rawQ       = typeof params.q        === "string" ? params.q        : "";
  const noDetail   = params.noDetail === "1";
  const rawPage    = typeof params.page     === "string" ? parseInt(params.page, 10) : 1;
  const page       = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const offset     = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  // ── Build query ──────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("orders")
    .select(
      "id, platform, platform_order_id, buyer_name, buyer_phone, recipient_name, recipient_phone, status, shadow_mode, fulfillment_type, detail_fetched_at, tiktok_created_at, created_at, items_json, total_amount, currency",
      { count: "exact" }
    )
    .eq("platform", "tiktok")
    .not("platform_order_id", "like", "TK-TEST%")
    .order("tiktok_created_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (rawStatus) query = query.eq("status", rawStatus);
  if (noDetail)  query = query.is("detail_fetched_at", null);
  if (rawQ.trim()) {
    const q = rawQ.trim();
    query = query.or(
      `platform_order_id.ilike.%${q}%,buyer_phone.ilike.%${q}%,recipient_phone.ilike.%${q}%,buyer_name.ilike.%${q}%,recipient_name.ilike.%${q}%`
    );
  }

  const { data: orders, error, count } = await query;
  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  // ── Status counts (for pill badges) ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: statusCounts } = await (supabase as any)
    .from("orders")
    .select("status")
    .eq("platform", "tiktok")
    .not("platform_order_id", "like", "TK-TEST%");

  const countByStatus = (statusCounts ?? []).reduce(
    (acc: Record<string, number>, row: { status: string }) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const totalCount = Object.values(countByStatus).reduce((s: number, v) => s + (v as number), 0);

  // ── Build URL helpers ────────────────────────────────────────────────────────
  function buildUrl(overrides: Record<string, string | number | undefined>) {
    const p = new URLSearchParams();
    const merged = { status: rawStatus, q: rawQ, noDetail: noDetail ? "1" : "", page: String(page), ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== "" && v !== "1" || k === "noDetail" && v === "1") {
        if (v !== "") p.set(k, String(v));
      }
    }
    return `/admin/orders?${p.toString()}`;
  }

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Order Inbox
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            TikTok Shop · {count ?? 0} orders match · Page {page}/{totalPages}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncButton />
        </div>
      </div>

      {/* ── Status Filter Pills ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(({ value, label, icon: Icon }) => {
          const isActive = rawStatus === value;
          const cnt = value === "" ? totalCount : (countByStatus[value] ?? 0);
          return (
            <Link
              key={value}
              href={buildUrl({ status: value, page: 1 })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-100"
              style={{
                background: isActive ? "var(--accent-primary)" : "var(--bg-raised)",
                color: isActive ? "#fff" : "var(--text-secondary)",
                border: `1px solid ${isActive ? "var(--accent-primary)" : "var(--border-dim)"}`,
              }}
            >
              {Icon && <Icon size={11} />}
              {label}
              <span
                className="ml-0.5 px-1.5 py-0.5 text-[10px] font-mono"
                style={{
                  background: isActive ? "rgba(255,255,255,0.2)" : "var(--bg-base)",
                  color: isActive ? "#fff" : "var(--text-dim)",
                }}
              >
                {cnt}
              </span>
            </Link>
          );
        })}

        {/* Debug toggle: orders missing enrichment */}
        <Link
          href={buildUrl({ noDetail: noDetail ? "" : "1", page: 1 })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-100 ml-auto"
          style={{
            background: noDetail ? "color-mix(in srgb, #f59e0b 15%, transparent)" : "var(--bg-raised)",
            color: noDetail ? "#f59e0b" : "var(--text-secondary)",
            border: `1px solid ${noDetail ? "color-mix(in srgb, #f59e0b 40%, transparent)" : "var(--border-dim)"}`,
          }}
        >
          <AlertCircle size={11} />
          Missing Detail
          {noDetail && " ✓"}
        </Link>
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────────── */}
      <form method="get" action="/admin/orders" className="relative">
        {/* Preserve other params */}
        {rawStatus && <input type="hidden" name="status" value={rawStatus} />}
        {noDetail   && <input type="hidden" name="noDetail" value="1" />}
        <input type="hidden" name="page" value="1" />

        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-dim)" }}
          />
          <input
            name="q"
            defaultValue={rawQ}
            placeholder="Search by order ID, phone, or name…"
            className="w-full pl-9 pr-4 py-2 text-sm bg-transparent outline-none"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dim)",
              color: "var(--text-primary)",
            }}
          />
        </div>
      </form>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      {error ? (
        <ErrorState message={(error as Error & { message: string }).message} />
      ) : orders && orders.length > 0 ? (
        <OrderTable orders={orders} />
      ) : (
        <EmptyState hasFilters={!!(rawStatus || rawQ || noDetail)} />
      )}

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs" style={{ color: "var(--text-dim)" }}>
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, count ?? 0)} of {count ?? 0}
          </span>
          <div className="flex items-center gap-1">
            {page > 1 ? (
              <Link
                href={buildUrl({ page: page - 1 })}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs transition-colors"
                style={{
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border-dim)",
                  color: "var(--text-secondary)",
                }}
              >
                <ChevronLeft size={12} /> Prev
              </Link>
            ) : (
              <span
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs opacity-40 cursor-not-allowed"
                style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dim)", color: "var(--text-dim)" }}
              >
                <ChevronLeft size={12} /> Prev
              </span>
            )}

            {/* Page numbers (compact window) */}
            {getPageWindow(page, totalPages).map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} className="px-2 text-xs" style={{ color: "var(--text-dim)" }}>…</span>
              ) : (
                <Link
                  key={p}
                  href={buildUrl({ page: p as number })}
                  className="inline-flex items-center justify-center w-8 h-7 text-xs transition-colors"
                  style={{
                    background: p === page ? "var(--accent-primary)" : "var(--bg-raised)",
                    border: `1px solid ${p === page ? "var(--accent-primary)" : "var(--border-dim)"}`,
                    color: p === page ? "#fff" : "var(--text-secondary)",
                  }}
                >
                  {p}
                </Link>
              )
            )}

            {page < totalPages ? (
              <Link
                href={buildUrl({ page: page + 1 })}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs transition-colors"
                style={{
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border-dim)",
                  color: "var(--text-secondary)",
                }}
              >
                Next <ChevronRight size={12} />
              </Link>
            ) : (
              <span
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs opacity-40 cursor-not-allowed"
                style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dim)", color: "var(--text-dim)" }}
              >
                Next <ChevronRight size={12} />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Table Components ─────────────────────────────────────────────────────────

function OrderTable({ orders }: { orders: Order[] }) {
  return (
    <div style={{ border: "1px solid var(--border-dim)", background: "var(--bg-surface)", overflowX: "auto" }}>
      {/* Header */}
      <div
        className="grid text-xs uppercase tracking-wide font-mono-data px-4 py-2 border-b min-w-[860px]"
        style={{
          gridTemplateColumns: "160px 140px 1fr 140px 72px 100px 100px",
          color: "var(--text-dim)",
          borderColor: "var(--border-dim)",
          background: "var(--bg-raised)",
        }}
      >
        <span>Order ID</span>
        <span>Status</span>
        <span>Recipient</span>
        <span>Phone</span>
        <span>Items</span>
        <span>Detail?</span>
        <span>TikTok Date</span>
      </div>

      {/* Rows */}
      <div className="divide-y" style={{ borderColor: "var(--border-dim)" }}>
        {orders.map((order: Order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}

function OrderRow({ order }: { order: Order }) {
  const recipientName = (order as any).recipient_name ?? order.buyer_name ?? "—";
  const phone = (order as any).recipient_phone ?? (order as any).buyer_phone ?? "—";
  const detailFetched = (order as any).detail_fetched_at;
  const itemCount = ((order as any).items_json ?? []).length;
  const tiktokDate = (order as any).tiktok_created_at;
  const isMasked = typeof phone === "string" && phone.includes("*");

  return (
    <Link
      href={`/admin/orders/${order.id}`}
      className="grid items-center px-4 py-2.5 transition-colors duration-100 min-w-[860px] hover:bg-[color-mix(in_srgb,var(--accent-primary)_5%,transparent)]"
      style={{
        gridTemplateColumns: "160px 140px 1fr 140px 72px 100px 100px",
        color: "inherit",
        textDecoration: "none",
        display: "grid",
      }}
    >
      {/* Order ID */}
      <span className="font-mono-data text-xs" style={{ color: "var(--text-secondary)" }}>
        {truncate16(order.platform_order_id)}
      </span>

      {/* Status */}
      <StatusBadge status={order.status} />

      {/* Recipient */}
      <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
        {recipientName}
      </span>

      {/* Phone */}
      <span
        className="text-xs font-mono-data truncate"
        style={{ color: isMasked ? "var(--text-dim)" : "var(--text-secondary)" }}
        title={isMasked ? "Masked by TikTok (platform logistics)" : phone}
      >
        {phone}
      </span>

      {/* Items */}
      <span className="text-xs font-mono-data text-center" style={{ color: itemCount > 0 ? "var(--text-secondary)" : "var(--text-dim)" }}>
        {itemCount > 0 ? itemCount : "—"}
      </span>

      {/* Detail fetched indicator */}
      <span className="flex items-center justify-center">
        {detailFetched ? (
          <CheckCircle2 size={13} style={{ color: "var(--signal-green, #22c55e)" }} />
        ) : (
          <span title="No detail fetched yet" className="inline-flex">
          <AlertCircle size={13} style={{ color: "#f59e0b" }} />
        </span>
        )}
      </span>

      {/* TikTok created date */}
      <span className="text-xs font-mono-data" style={{ color: "var(--text-dim)" }}>
        {tiktokDate ? formatOrderTime(new Date(tiktokDate).getTime() / 1000) : "—"}
      </span>
    </Link>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function truncate16(s: string) {
  return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
}

/** Returns a compact window of page numbers with ellipsis */
function getPageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  if (current > 3) pages.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

// ── Supplementary Components ─────────────────────────────────────────────────

export function PlatformBadge({ platform }: { platform: "tiktok" | "shopee" }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-xs font-mono-data uppercase tracking-wide"
      style={{
        background:
          platform === "tiktok"
            ? "color-mix(in srgb, #EE1D52 12%, transparent)"
            : "color-mix(in srgb, #EE4D2D 12%, transparent)",
        color: platform === "tiktok" ? "#EE1D52" : "#EE4D2D",
        border:
          platform === "tiktok"
            ? "1px solid color-mix(in srgb, #EE1D52 30%, transparent)"
            : "1px solid color-mix(in srgb, #EE4D2D 30%, transparent)",
      }}
    >
      {platform}
    </span>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-24 gap-3"
      style={{ border: "1px solid var(--border-dim)", background: "var(--bg-surface)" }}
    >
      <Package size={32} style={{ color: "var(--text-dim)" }} />
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {hasFilters ? "No orders match your filters" : "No orders ingested yet"}
      </p>
      {hasFilters && (
        <Link
          href="/admin/orders"
          className="text-xs px-3 py-1.5 mt-1"
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-dim)",
            color: "var(--text-secondary)",
          }}
        >
          Clear filters
        </Link>
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      className="px-4 py-3 text-sm"
      style={{
        background: "color-mix(in srgb, var(--signal-red) 10%, transparent)",
        border: "1px solid color-mix(in srgb, var(--signal-red) 30%, transparent)",
        color: "var(--signal-red)",
      }}
    >
      Database error: {message}
    </div>
  );
}
