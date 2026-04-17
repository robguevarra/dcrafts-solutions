"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseShopeeOrders, type ParsedShopeeOrder } from "@/lib/shopee/parser";
import { importShopeeOrders, type ImportResult } from "./actions";
import { ClipboardPaste, Upload, AlertTriangle, CheckCircle2, X, ArrowRight } from "lucide-react";

/**
 * T1.10 — Shopee Manual Paste Ingestion Tool
 *
 * Flow: Paste raw data → Preview parsed rows → Confirm → Import to DB
 */
export default function ShopeeImportPage() {
  const router = useRouter();
  const [rawPaste, setRawPaste] = useState("");
  const [preview, setPreview] = useState<ParsedShopeeOrder[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isParsing, startParse] = useTransition();
  const [isImporting, startImport] = useTransition();

  function handleParse() {
    if (!rawPaste.trim()) return;
    startParse(() => {
      const parsed = parseShopeeOrders(rawPaste);
      setPreview(parsed.orders);
      setSkipped(parsed.skipped);
      setResult(null);
    });
  }

  function handleImport() {
    if (!preview || preview.length === 0) return;
    startImport(async () => {
      const res = await importShopeeOrders(rawPaste);
      setResult(res);
    });
  }

  function handleReset() {
    setRawPaste("");
    setPreview(null);
    setResult(null);
    setSkipped(0);
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Shopee Import
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Copy rows from Shopee Seller Center → paste below → preview → import
        </p>
      </div>

      {/* Result banner */}
      {result && <ResultBanner result={result} onDone={() => router.push("/admin/orders")} onImportMore={handleReset} />}

      {/* Step 1: Paste */}
      {!result && (
        <div
          className="p-4 space-y-3"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-dim)" }}
        >
          <SectionHeader icon={<ClipboardPaste size={12} />} label="Step 1 — Paste Order Data" />
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Select order rows in Shopee Seller Center → Ctrl+C → paste here. Tab-separated and comma-separated are both supported.
          </p>
          <textarea
            value={rawPaste}
            onChange={(e) => {
              setRawPaste(e.target.value);
              setPreview(null);
              setResult(null);
            }}
            placeholder={"220918162034XXX\tJuan dela Cruz\t09171234567\t…\n220918162035XXX\tMaria Santos\t09182345678\t…"}
            rows={8}
            className="w-full text-xs font-mono resize-y p-3 outline-none transition-colors"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dim)",
              color: "var(--text-primary)",
              fontFamily: "DM Mono, monospace",
              lineHeight: "1.8",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "var(--signal-amber)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--border-dim)")
            }
            id="shopee-paste-input"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--text-dim)" }}>
              {rawPaste.split("\n").filter(Boolean).length} lines pasted
            </span>
            <button
              onClick={handleParse}
              disabled={!rawPaste.trim() || isParsing}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium transition-opacity disabled:opacity-40"
              style={{
                background: "var(--signal-amber)",
                color: "#000",
              }}
            >
              <ArrowRight size={12} />
              {isParsing ? "Parsing…" : "Preview Orders"}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {preview && !result && (
        <div
          className="p-4 space-y-3"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-dim)" }}
        >
          <div className="flex items-center justify-between">
            <SectionHeader icon={<CheckCircle2 size={12} />} label="Step 2 — Preview" />
            {skipped > 0 && (
              <span
                className="text-xs flex items-center gap-1"
                style={{ color: "var(--signal-amber)" }}
              >
                <AlertTriangle size={11} />
                {skipped} line{skipped !== 1 ? "s" : ""} skipped
              </span>
            )}
          </div>

          {preview.length === 0 ? (
            <div
              className="py-8 text-center text-sm"
              style={{ color: "var(--text-dim)" }}
            >
              No valid Shopee orders found in the pasted text.
              <br />
              <span className="text-xs">
                Make sure the data includes Shopee order IDs (12–20 digit numbers).
              </span>
            </div>
          ) : (
            <>
              {/* Preview table */}
              <div style={{ border: "1px solid var(--border-dim)" }}>
                <div
                  className="grid text-xs uppercase tracking-wide font-mono-data px-3 py-2 border-b"
                  style={{
                    gridTemplateColumns: "200px 180px 140px 1fr 100px",
                    color: "var(--text-dim)",
                    background: "var(--bg-raised)",
                    borderColor: "var(--border-dim)",
                  }}
                >
                  <span>Order ID</span>
                  <span>Buyer Name</span>
                  <span>Phone</span>
                  <span>Items</span>
                  <span>Warnings</span>
                </div>
                <div className="divide-y" style={{ maxHeight: "320px", overflowY: "auto" }}>
                  {preview.map((order) => (
                    <PreviewRow key={order.platform_order_id} order={order} />
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-1">
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    {preview.length}
                  </span>{" "}
                  orders ready to import
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleReset}
                    className="px-3 py-1.5 text-xs transition-colors"
                    style={{
                      background: "transparent",
                      border: "1px solid var(--border-dim)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={isImporting}
                    className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium transition-opacity disabled:opacity-40"
                    style={{
                      background: "var(--signal-green)",
                      color: "#000",
                    }}
                  >
                    <Upload size={12} />
                    {isImporting ? "Importing…" : `Import ${preview.length} Orders`}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      className="flex items-center gap-2 text-xs uppercase tracking-wide font-mono-data"
      style={{ color: "var(--text-dim)" }}
    >
      {icon}
      {label}
    </div>
  );
}

function PreviewRow({ order }: { order: ParsedShopeeOrder }) {
  const hasWarnings = order.warnings.length > 0;
  return (
    <div
      className="grid items-start px-3 py-2 text-xs"
      style={{
        gridTemplateColumns: "200px 180px 140px 1fr 100px",
        borderColor: "var(--border-dim)",
        background: hasWarnings
          ? "color-mix(in srgb, var(--signal-amber) 4%, transparent)"
          : "transparent",
      }}
    >
      <span className="font-mono-data" style={{ color: "var(--text-secondary)" }}>
        {order.platform_order_id}
      </span>
      <span style={{ color: order.buyer_name ? "var(--text-primary)" : "var(--text-dim)" }}>
        {order.buyer_name ?? "—"}
      </span>
      <span className="font-mono-data" style={{ color: order.buyer_phone ? "var(--text-primary)" : "var(--text-dim)" }}>
        {order.buyer_phone ?? "—"}
      </span>
      <span
        className="truncate"
        style={{ color: "var(--text-dim)" }}
        title={order.items_raw ?? ""}
      >
        {order.items_raw ? order.items_raw.substring(0, 60) + "…" : "—"}
      </span>
      <span>
        {hasWarnings ? (
          <span
            className="inline-flex items-center gap-1"
            style={{ color: "var(--signal-amber)" }}
            title={order.warnings.join(", ")}
          >
            <AlertTriangle size={10} />
            {order.warnings.length}
          </span>
        ) : (
          <span style={{ color: "var(--signal-green)" }}>
            <CheckCircle2 size={12} />
          </span>
        )}
      </span>
    </div>
  );
}

function ResultBanner({
  result,
  onDone,
  onImportMore,
}: {
  result: ImportResult;
  onDone: () => void;
  onImportMore: () => void;
}) {
  const allGood = result.failed === 0;
  return (
    <div
      className="p-4 space-y-3"
      style={{
        background: allGood
          ? "color-mix(in srgb, var(--signal-green) 8%, transparent)"
          : "color-mix(in srgb, var(--signal-amber) 8%, transparent)",
        border: `1px solid ${allGood ? "color-mix(in srgb, var(--signal-green) 30%, transparent)" : "color-mix(in srgb, var(--signal-amber) 30%, transparent)"}`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {allGood ? (
            <CheckCircle2 size={16} style={{ color: "var(--signal-green)" }} />
          ) : (
            <AlertTriangle size={16} style={{ color: "var(--signal-amber)" }} />
          )}
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {result.inserted} orders imported successfully
            {result.failed > 0 && `, ${result.failed} failed`}
          </span>
        </div>
        <button onClick={onImportMore}>
          <X size={14} style={{ color: "var(--text-secondary)" }} />
        </button>
      </div>

      {result.errors.length > 0 && (
        <ul className="space-y-1">
          {result.errors.map((e, i) => (
            <li key={i} className="text-xs font-mono-data" style={{ color: "var(--signal-red)" }}>
              {e}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onImportMore}
          className="px-3 py-1.5 text-xs"
          style={{
            background: "transparent",
            border: "1px solid var(--border-dim)",
            color: "var(--text-secondary)",
          }}
        >
          Import More
        </button>
        <button
          onClick={onDone}
          className="px-4 py-1.5 text-xs font-medium"
          style={{ background: "var(--signal-amber)", color: "#000" }}
        >
          View Orders →
        </button>
      </div>
    </div>
  );
}
