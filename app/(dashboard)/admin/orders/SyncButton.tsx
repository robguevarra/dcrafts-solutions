"use client";

import { useState } from "react";
import { RefreshCcw, CheckCircle2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

type SyncState = "idle" | "loading" | "ok" | "error";

/**
 * SyncButton — triggers GET /api/tiktok/sync and refreshes the page.
 * Lives in the orders inbox header.
 */
export function SyncButton() {
  const [state, setState] = useState<SyncState>("idle");
  const [meta, setMeta]   = useState<{ ingested?: number; error?: string } | null>(null);
  const router             = useRouter();

  async function handleSync() {
    setState("loading");
    setMeta(null);
    try {
      const res  = await fetch("/api/tiktok/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        setState("error");
        setMeta({ error: json.error ?? "Unknown error" });
      } else {
        setState("ok");
        setMeta({ ingested: json.ingested ?? 0 });
        // Refresh server component data
        router.refresh();
      }
    } catch (err) {
      setState("error");
      setMeta({ error: (err as Error).message });
    } finally {
      // Reset to idle after 4 s
      setTimeout(() => { setState("idle"); setMeta(null); }, 4000);
    }
  }

  const isLoading = state === "loading";

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleSync}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-150"
        style={{
          background: isLoading ? "var(--bg-raised)" : "var(--accent-primary)",
          border: `1px solid ${isLoading ? "var(--border-dim)" : "var(--accent-primary)"}`,
          color: isLoading ? "var(--text-secondary)" : "#fff",
          opacity: isLoading ? 0.7 : 1,
          cursor: isLoading ? "not-allowed" : "pointer",
        }}
      >
        <RefreshCcw
          size={12}
          className={isLoading ? "animate-spin" : ""}
        />
        {isLoading ? "Syncing…" : "Sync Orders"}
      </button>

      {/* Inline result badge */}
      {state === "ok" && meta && (
        <span
          className="inline-flex items-center gap-1 px-2 py-1 text-xs"
          style={{
            background: "color-mix(in srgb, #22c55e 12%, transparent)",
            border: "1px solid color-mix(in srgb, #22c55e 30%, transparent)",
            color: "#22c55e",
          }}
        >
          <CheckCircle2 size={11} />
          {meta.ingested} synced
        </span>
      )}
      {state === "error" && meta && (
        <span
          className="inline-flex items-center gap-1 px-2 py-1 text-xs max-w-[200px] truncate"
          style={{
            background: "color-mix(in srgb, var(--signal-red) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--signal-red) 30%, transparent)",
            color: "var(--signal-red)",
          }}
          title={meta.error}
        >
          <AlertCircle size={11} />
          {meta.error}
        </span>
      )}
    </div>
  );
}
