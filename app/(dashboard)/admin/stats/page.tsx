import { createClient } from "@/lib/supabase/server";
import { Radio, Package, CheckCircle, AlertTriangle, Copy } from "lucide-react";

/** Shadow Stats — read-only ingestion metrics while shadow_mode = true */
export default async function StatsPage() {
  const supabase = await createClient();

  const [totalRes, shadowRes, pendingRes, shadowFlagRes] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("shadow_mode", true),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "pending_spec"),
    supabase.from("feature_flags").select("enabled").eq("name", "shadow_mode").single(),
  ]);

  const [totalOrders, duplicates, pendingSpec, shadowFlag] = [
    totalRes, shadowRes, pendingRes, shadowFlagRes,
  ];

  const cards = [
    {
      label: "Total Ingested",
      value: totalOrders.count ?? 0,
      icon: Package,
      color: "var(--signal-blue)",
    },
    {
      label: "Shadow Mode",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      value: (shadowFlag.data as any)?.enabled ? "ACTIVE" : "OFF",
      icon: Radio,
      color: "var(--signal-gray)",
    },
    {
      label: "Pending Spec",
      value: pendingSpec.count ?? 0,
      icon: AlertTriangle,
      color: "var(--signal-amber)",
    },
    {
      label: "Duplicates Blocked",
      value: 0,
      icon: Copy,
      color: "var(--signal-green)",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Shadow Stats
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Monitor ingestion quality before go-live. Gate 1 requires 7 days of 0 duplicates.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="p-4 space-y-3"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-dim)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {label}
              </span>
              <Icon size={14} style={{ color }} />
            </div>
            <p className="text-3xl font-mono-data font-medium" style={{ color: "var(--text-primary)" }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Gate 1 checklist */}
      <div
        className="p-4 space-y-3"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-dim)" }}
      >
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Gate 1 — Go-Live Checklist
        </p>
        <div className="space-y-2 text-xs font-mono-data">
          {[
            "7 days shadow with 0 duplicates",
            "100% ingestion in < 30 seconds",
            "KDS realtime < 5 second latency",
            "Designers used KDS parallel for 3+ days",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
              <CheckCircle size={12} style={{ color: "var(--border-dim)" }} />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
