import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatOrderTime, truncate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Order } from "@/types/database";
import { Package, RefreshCcw } from "lucide-react";

/**
 * Admin Order Inbox — Server Component
 * Renders first 50 orders, ordered by most recent.
 * Each row navigates to /admin/orders/[id].
 */
export default async function OrdersPage() {
  const supabase = await createClient();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Order Inbox
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            TikTok Shop · Shadow Mode (read-only)
          </p>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-xs"
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-dim)",
            color: "var(--text-secondary)",
          }}
        >
          <RefreshCcw size={12} />
          Auto-syncing
        </div>
      </div>

      {/* Table */}
      {error ? (
        <ErrorState message={error.message} />
      ) : orders && orders.length > 0 ? (
        <OrderTable orders={orders} />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function OrderTable({ orders }: { orders: Order[] }) {
  return (
    <div
      style={{ border: "1px solid var(--border-dim)", background: "var(--bg-surface)" }}
    >
      {/* Table header */}
      <div
        className="grid text-xs uppercase tracking-wide font-mono-data px-4 py-2 border-b"
        style={{
          gridTemplateColumns: "180px 140px 1fr 160px 100px",
          color: "var(--text-dim)",
          borderColor: "var(--border-dim)",
          background: "var(--bg-raised)",
        }}
      >
        <span>Order ID</span>
        <span>Platform</span>
        <span>Buyer</span>
        <span>Status</span>
        <span>Created</span>
      </div>

      {/* Rows */}
      <div className="divide-y" style={{ "--tw-divide-opacity": 1 } as React.CSSProperties}>
        {orders.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}

function OrderRow({ order }: { order: Order }) {
  return (
    <Link
      href={`/admin/orders/${order.id}`}
      className="order-row grid items-center px-4 py-3 transition-colors duration-100"
      style={{
        gridTemplateColumns: "180px 140px 1fr 160px 100px",
        borderColor: "var(--border-dim)",
        display: "grid",
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <span className="font-mono-data text-xs" style={{ color: "var(--text-secondary)" }}>
        {truncate(order.platform_order_id, 18)}
      </span>
      <span>
        <PlatformBadge platform={order.platform} />
      </span>
      <span className="text-sm" style={{ color: "var(--text-primary)" }}>
        {order.buyer_name ?? "—"}
      </span>
      <span>
        <StatusBadge status={order.status} />
      </span>
      <span className="text-xs font-mono-data" style={{ color: "var(--text-dim)" }}>
        {formatOrderTime(new Date(order.created_at).getTime() / 1000)}
      </span>
    </Link>
  );
}

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

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center py-24 gap-3"
      style={{ border: "1px solid var(--border-dim)", background: "var(--bg-surface)" }}
    >
      <Package size={32} style={{ color: "var(--text-dim)" }} />
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        No orders ingested yet
      </p>
      <p className="text-xs" style={{ color: "var(--text-dim)" }}>
        Waiting for TikTok webhook events…
      </p>
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
