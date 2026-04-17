import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PlatformBadge } from "@/app/(dashboard)/admin/orders/page";
import { formatOrderTime } from "@/lib/utils";
import type { Order, PrintSpec, PrintJob } from "@/types/database";
import {
  ArrowLeft,
  User,
  FileText,
  Printer,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * T1.9 — Order Detail Page (Server Component)
 * Shows full order info, print spec, print job status, and raw payload.
 */
export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch order + related records in parallel
  const [orderRes, specRes, jobRes] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).single(),
    supabase.from("print_specs").select("*").eq("order_id", id).maybeSingle(),
    supabase.from("print_jobs").select("*").eq("order_id", id).maybeSingle(),
  ]);

  if (orderRes.error || !orderRes.data) notFound();

  const order = orderRes.data as Order;
  const spec = specRes.data as PrintSpec | null;
  const job = jobRes.data as PrintJob | null;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Back + header */}
      <div className="space-y-3">
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1.5 text-xs transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft size={12} />
          Order Inbox
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1
                className="text-lg font-mono-data font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {order.platform_order_id}
              </h1>
              <PlatformBadge platform={order.platform} />
              {order.shadow_mode && <ShadowTag />}
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
              Received {formatOrderTime(new Date(order.created_at).getTime() / 1000)} ·
              Updated {formatOrderTime(new Date(order.updated_at).getTime() / 1000)}
            </p>
          </div>
          <StatusBadge status={order.status} />
        </div>
      </div>

      {/* Pipeline strip */}
      <StatusPipeline current={order.status} />

      {/* Grid: Buyer info + Spec + Job */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <BuyerCard order={order} />
        <PrintJobCard job={job} />
      </div>

      {/* Spec card — full width */}
      <PrintSpecCard spec={spec} orderId={order.id} />

      {/* Raw payload — collapsible */}
      <RawPayloadCard payload={order.raw_payload} />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function ShadowTag() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono-data uppercase"
      style={{
        background: "color-mix(in srgb, var(--signal-amber) 12%, transparent)",
        color: "var(--signal-amber)",
        border: "1px solid color-mix(in srgb, var(--signal-amber) 30%, transparent)",
      }}
    >
      Shadow
    </span>
  );
}

const STATUSES: Order["status"][] = [
  "pending_spec",
  "spec_collected",
  "in_production",
  "qc_upload",
  "shipped",
];

const STATUS_LABELS: Record<string, string> = {
  pending_spec: "Pending Spec",
  spec_collected: "Spec Collected",
  in_production: "In Production",
  qc_upload: "QC Upload",
  shipped: "Shipped",
  cancelled: "Cancelled",
};

function StatusPipeline({ current }: { current: Order["status"] }) {
  if (current === "cancelled") {
    return (
      <div
        className="flex items-center gap-2 px-4 py-3 text-sm"
        style={{
          background: "color-mix(in srgb, var(--signal-red) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--signal-red) 25%, transparent)",
          color: "var(--signal-red)",
        }}
      >
        <AlertTriangle size={14} />
        Order cancelled
      </div>
    );
  }

  const currentIdx = STATUSES.indexOf(current);

  return (
    <div
      className="flex items-center px-4 py-3 gap-0"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-dim)",
      }}
    >
      {STATUSES.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const upcoming = i > currentIdx;

        return (
          <div key={s} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: done
                    ? "var(--signal-green)"
                    : active
                    ? "var(--signal-amber)"
                    : "var(--border-dim)",
                }}
              />
              <span
                className="text-xs font-mono-data text-center"
                style={{
                  color: done
                    ? "var(--signal-green)"
                    : active
                    ? "var(--signal-amber)"
                    : "var(--text-dim)",
                  fontSize: "10px",
                }}
              >
                {STATUS_LABELS[s]}
              </span>
            </div>
            {i < STATUSES.length - 1 && (
              <div
                className="h-px flex-1 mb-4"
                style={{
                  background: done ? "var(--signal-green)" : "var(--border-dim)",
                  maxWidth: "40px",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-4 space-y-3"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-dim)",
      }}
    >
      <div
        className="flex items-center gap-2 pb-2 border-b text-xs uppercase tracking-wide font-mono-data"
        style={{ borderColor: "var(--border-dim)", color: "var(--text-dim)" }}
      >
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs shrink-0" style={{ color: "var(--text-dim)" }}>
        {label}
      </span>
      <span
        className="text-xs font-mono-data text-right"
        style={{ color: value ? "var(--text-primary)" : "var(--text-dim)" }}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

function BuyerCard({ order }: { order: Order }) {
  return (
    <Card icon={<User size={12} />} title="Buyer">
      <div className="space-y-2">
        <DataRow label="Name" value={order.buyer_name} />
        <DataRow label="Buyer ID" value={order.buyer_id} />
        <DataRow label="Phone" value={order.buyer_phone} />
        <DataRow label="Platform" value={order.platform} />
        <DataRow label="Order ID" value={order.platform_order_id} />
      </div>
    </Card>
  );
}

function PrintJobCard({ job }: { job: PrintJob | null }) {
  return (
    <Card icon={<Printer size={12} />} title="Print Job">
      {job ? (
        <div className="space-y-2">
          <DataRow label="Job ID" value={job.id.substring(0, 8) + "…"} />
          <DataRow label="Designer" value={job.designer_id ?? "Unassigned"} />
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--text-dim)" }}>
              Status
            </span>
            <StatusBadge status={job.status} />
          </div>
          <DataRow label="Proof Sent" value={job.proof_sent_at ? formatOrderTime(new Date(job.proof_sent_at).getTime() / 1000) : undefined} />
          {job.proof_photo_url && (
            <a
              href={job.proof_photo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs mt-1"
              style={{ color: "var(--signal-blue)" }}
            >
              View proof photo →
            </a>
          )}
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center py-6 gap-2"
          style={{ color: "var(--text-dim)" }}
        >
          <Clock size={20} />
          <p className="text-xs">No print job assigned yet</p>
        </div>
      )}
    </Card>
  );
}

function PrintSpecCard({ spec, orderId }: { spec: PrintSpec | null; orderId: string }) {
  if (!spec) {
    return (
      <div
        className="p-6 flex items-center gap-4"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-dim)",
        }}
      >
        <AlertTriangle size={18} style={{ color: "var(--signal-amber)" }} />
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Print Spec Not Yet Collected
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            The AI chatbot will collect font, color, size, and letter choices from the buyer.
            This section updates automatically once the spec is confirmed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Card icon={<FileText size={12} />} title="Print Specification">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <SpecItem label="Letters" value={spec.letters_text} large />
        <SpecItem label="Font" value={spec.font_name} />
        <SpecItem label="Color" value={spec.color_name} />
        <SpecItem label="Size (cm)" value={spec.size_cm?.toString()} />
        <SpecItem label="Case" value={spec.letter_case} />
        <SpecItem label="Quantity" value={spec.quantity?.toString()} />
      </div>
      {spec.confirmed_at && (
        <div
          className="flex items-center gap-2 mt-3 pt-3 border-t text-xs"
          style={{ borderColor: "var(--border-dim)", color: "var(--signal-green)" }}
        >
          <CheckCircle2 size={12} />
          Confirmed by buyer at {formatOrderTime(new Date(spec.confirmed_at).getTime() / 1000)}
        </div>
      )}
    </Card>
  );
}

function SpecItem({
  label,
  value,
  large,
}: {
  label: string;
  value?: string | null;
  large?: boolean;
}) {
  return (
    <div
      className="p-3 space-y-1"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dim)",
      }}
    >
      <p className="text-xs uppercase tracking-wide font-mono-data" style={{ color: "var(--text-dim)", fontSize: "10px" }}>
        {label}
      </p>
      <p
        className={`font-mono-data font-semibold ${large ? "text-2xl" : "text-base"}`}
        style={{ color: value ? "var(--text-primary)" : "var(--text-dim)" }}
      >
        {value ?? "—"}
      </p>
    </div>
  );
}

function RawPayloadCard({ payload }: { payload: unknown }) {
  return (
    <details
      className="group"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-dim)",
      }}
    >
      <summary
        className="px-4 py-3 text-xs uppercase tracking-wide font-mono-data cursor-pointer select-none"
        style={{ color: "var(--text-dim)" }}
      >
        Raw Payload (debug)
      </summary>
      <pre
        className="p-4 text-xs overflow-x-auto border-t"
        style={{
          borderColor: "var(--border-dim)",
          color: "var(--text-secondary)",
          fontFamily: "DM Mono, monospace",
          lineHeight: "1.6",
        }}
      >
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  );
}
