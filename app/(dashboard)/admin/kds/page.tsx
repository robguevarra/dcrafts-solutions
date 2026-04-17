"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { cn, formatOrderTime } from "@/lib/utils";
import { Monitor, Wifi, WifiOff } from "lucide-react";
import type { PrintJob, Order, PrintSpec } from "@/types/database";

type KDSJob = PrintJob & {
  order: Pick<Order, "platform_order_id" | "buyer_name" | "platform"> | null;
  spec: Pick<PrintSpec, "font_name" | "color_name" | "size_cm" | "letter_case" | "letters_text" | "quantity"> | null;
};

/**
 * Designer Kitchen Display System (KDS)
 *
 * Real-time display of print jobs for designers.
 * Replaces the shared Excel file — each designer sees only their assigned jobs.
 * Uses Supabase Realtime to push new jobs without page refresh.
 */
export default function KDSPage() {
  const [jobs, setJobs] = useState<KDSJob[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Initial load
    async function loadJobs() {
      const { data } = await supabase
        .from("print_jobs")
        .select(`
          *,
          order:orders(platform_order_id, buyer_name, platform),
          spec:print_specs(font_name, color_name, size_cm, letter_case, letters_text, quantity)
        `)
        .in("status", ["queued", "in_progress"])
        .order("created_at", { ascending: true });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setJobs((data as any as KDSJob[]) ?? []);
      setLoading(false);
    }

    loadJobs();

    // Realtime subscription
    const channel = supabase
      .channel("print-jobs-kds")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "print_jobs" },
        async (payload) => {
          // Re-fetch the updated job with its relations
          if (payload.eventType === "DELETE") {
            setJobs((prev) => prev.filter((j) => j.id !== (payload.old as PrintJob).id));
            return;
          }

          const { data: updated } = await supabase
            .from("print_jobs")
            .select(`
              *,
              order:orders(platform_order_id, buyer_name, platform),
              spec:print_specs(font_name, color_name, size_cm, letter_case, letters_text, quantity)
            `)
            .eq("id", (payload.new as PrintJob).id)
            .single();

          if (!updated) return;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const typedUpdated = updated as any as KDSJob;

          setJobs((prev) => {
            const exists = prev.find((j) => j.id === typedUpdated.id);
            if (!exists) return [typedUpdated, ...prev];
            return prev.map((j) => (j.id === typedUpdated.id ? typedUpdated : j));
          });
        }
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="p-6 space-y-5" style={{ minHeight: "100vh" }}>
      {/* KDS Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Monitor size={20} style={{ color: "var(--signal-amber)" }} />
          <div>
            <h1 className="text-xl font-semibold font-mono-data" style={{ color: "var(--text-primary)" }}>
              Production KDS
            </h1>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {jobs.length} active job{jobs.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Live connection indicator */}
        <div className="flex items-center gap-2 text-xs font-mono-data">
          {connected ? (
            <>
              <span className="w-2 h-2 rounded-full animate-live" style={{ background: "var(--signal-green)" }} />
              <span style={{ color: "var(--signal-green)" }}>LIVE</span>
              <Wifi size={14} style={{ color: "var(--signal-green)" }} />
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--signal-red)" }} />
              <span style={{ color: "var(--signal-red)" }}>OFFLINE</span>
              <WifiOff size={14} style={{ color: "var(--signal-red)" }} />
            </>
          )}
        </div>
      </div>

      {/* Job Grid */}
      {loading ? (
        <KDSSkeleton />
      ) : jobs.length === 0 ? (
        <KDSEmpty />
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          <AnimatePresence>
            {jobs.map((job, i) => (
              <JobCard key={job.id} job={job} index={i} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function JobCard({ job, index }: { job: KDSJob; index: number }) {
  const isInProgress = job.status === "in_progress";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 35, delay: index * 0.04 }}
      className="relative"
      style={{
        border: `1px solid ${isInProgress ? "var(--signal-amber)" : "var(--border-dim)"}`,
        background: "var(--bg-surface)",
      }}
    >
      {/* Status bar */}
      <div
        className="h-1 w-full"
        style={{ background: isInProgress ? "var(--signal-amber)" : "var(--border-dim)" }}
      />

      <div className="p-4 space-y-4">
        {/* Order meta */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono-data text-xs" style={{ color: "var(--text-dim)" }}>
              {job.order?.platform?.toUpperCase() ?? "—"} · {job.order?.platform_order_id ?? "—"}
            </p>
            <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-primary)" }}>
              {job.order?.buyer_name ?? "Unknown Buyer"}
            </p>
          </div>
          <JobStatusChip status={job.status} />
        </div>

        {/* Spec details */}
        {job.spec ? (
          <div
            className="space-y-2 p-3 font-mono-data text-xs"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border-dim)" }}
          >
            <SpecRow label="Letters" value={job.spec.letters_text ?? "—"} highlight />
            <SpecRow label="Font" value={job.spec.font_name ?? "—"} />
            <SpecRow label="Color" value={job.spec.color_name ?? "—"} />
            <SpecRow
              label="Size"
              value={job.spec.size_cm ? `${job.spec.size_cm} cm` : "—"}
            />
            <SpecRow
              label="Case"
              value={job.spec.letter_case === "upper" ? "UPPERCASE" : job.spec.letter_case === "lower" ? "lowercase" : "—"}
            />
            <SpecRow label="Qty" value={String(job.spec.quantity ?? 1)} />
          </div>
        ) : (
          <div
            className="px-3 py-2 text-xs font-mono-data"
            style={{
              background: "color-mix(in srgb, var(--signal-amber) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--signal-amber) 25%, transparent)",
              color: "var(--signal-amber)",
            }}
          >
            ⚠ Awaiting spec collection
          </div>
        )}

        {/* Job footer */}
        <div
          className="flex items-center justify-between text-xs font-mono-data pt-2 border-t"
          style={{ borderColor: "var(--border-dim)", color: "var(--text-dim)" }}
        >
          <span>Job #{job.id.slice(-6).toUpperCase()}</span>
          <span>{formatOrderTime(new Date(job.created_at).getTime() / 1000)}</span>
        </div>
      </div>
    </motion.div>
  );
}

function SpecRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span style={{ color: "var(--text-dim)", minWidth: 48 }}>{label}</span>
      <span
        className={cn("text-right font-medium", highlight && "text-base")}
        style={{ color: highlight ? "var(--signal-amber)" : "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

function JobStatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    queued:      { label: "QUEUED",      color: "var(--text-secondary)" },
    in_progress: { label: "IN PROGRESS", color: "var(--signal-amber)" },
    done:        { label: "DONE",        color: "var(--signal-green)" },
  };
  const config = map[status] ?? { label: status.toUpperCase(), color: "var(--text-dim)" };

  return (
    <span className="font-mono-data text-xs" style={{ color: config.color }}>
      ● {config.label}
    </span>
  );
}

function KDSSkeleton() {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-64 animate-pulse" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-dim)" }} />
      ))}
    </div>
  );
}

function KDSEmpty() {
  return (
    <div
      className="flex flex-col items-center justify-center py-32 gap-3"
      style={{ border: "1px solid var(--border-dim)", background: "var(--bg-surface)" }}
    >
      <Monitor size={40} style={{ color: "var(--text-dim)" }} />
      <p className="font-mono-data text-sm" style={{ color: "var(--text-secondary)" }}>
        No active jobs
      </p>
      <p className="text-xs" style={{ color: "var(--text-dim)" }}>
        Listening for new assignments via Realtime…
      </p>
    </div>
  );
}
