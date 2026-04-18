"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  Bot,
  ShoppingBag,
  Bell,
  Shield,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  RefreshCw,
  Webhook,
  Key,
  Zap,
  MessageSquareText,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TikTokConnection } from "./page";

// ─── TikTok OAuth config ───────────────────────────────────────────────────────
const TIKTOK_AUTH_URL = "https://services.tiktokshop.com/open/authorize?service_id=7628648618510272277";
const TIKTOK_CALLBACK_URL = "https://dcrafts.vercel.app/api/tiktok/callback";

// ─── Auth Result Toast ────────────────────────────────────────────────────────
function AuthToast() {
  const params = useSearchParams();
  const result = params.get("tiktok_auth");
  const shop   = params.get("shop");
  const reason = params.get("reason");
  const [visible, setVisible] = useState(!!result);

  useEffect(() => { if (result) setVisible(true); }, [result]);

  if (!visible || !result) return null;

  const ok = result === "success";
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="fixed top-4 right-4 z-50 flex items-start gap-3 px-4 py-3 rounded shadow-lg text-sm max-w-sm"
        style={{
          background: ok ? "color-mix(in srgb, var(--signal-green) 15%, var(--bg-raised))" : "color-mix(in srgb, var(--signal-red) 15%, var(--bg-raised))",
          border: `1px solid ${ok ? "var(--signal-green)" : "var(--signal-red)"}`,
          color: "var(--text-primary)",
        }}
      >
        {ok
          ? <CheckCircle2 size={16} style={{ color: "var(--signal-green)", flexShrink: 0 }} />
          : <XCircle      size={16} style={{ color: "var(--signal-red)",   flexShrink: 0 }} />
        }
        <div>
          <p className="font-semibold">{ok ? "TikTok Shop connected!" : "Authorization failed"}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {ok ? `Shop ID: ${shop ?? "—"} • Tokens saved to DB` : (reason ?? "Unknown error")}
          </p>
        </div>
        <button onClick={() => setVisible(false)} className="ml-auto text-xs opacity-50 hover:opacity-100">✕</button>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Settings Sections ─────────────────────────────────────────────────────────

type SectionId = "integrations" | "bot" | "notifications" | "security";

const SECTIONS: { id: SectionId; label: string; icon: React.ElementType }[] = [
  { id: "integrations", label: "Integrations",  icon: ShoppingBag },
  { id: "bot",          label: "Assist Mode",   icon: Bot },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security",     label: "Security",       icon: Shield },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionNav({
  active,
  onSelect,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <nav className="space-y-0.5">
      {SECTIONS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          id={`settings-nav-${id}`}
          onClick={() => onSelect(id)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-150 text-left",
            active === id
              ? "text-[var(--signal-amber)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
          style={{
            background: active === id
              ? "color-mix(in srgb, var(--signal-amber) 10%, transparent)"
              : "transparent",
            borderRadius: 4,
          }}
        >
          <Icon size={15} />
          <span>{label}</span>
          {active === id && <ChevronRight size={13} className="ml-auto" />}
        </button>
      ))}
    </nav>
  );
}

function StatusDot({ ok }: { ok: boolean | "partial" }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{
        background: ok === true ? "var(--signal-green)" :
                    ok === "partial" ? "var(--signal-amber)" :
                    "var(--signal-gray)",
      }}
    />
  );
}

function ToggleSwitch({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative flex-shrink-0 transition-all duration-200"
      style={{
        width: 36,
        height: 20,
        background: checked ? "var(--signal-blue)" : "var(--bg-overlay)",
        border: `1px solid ${checked ? "var(--signal-blue)" : "var(--border-dim)"}`,
        borderRadius: 10,
      }}
    >
      <motion.span
        animate={{ x: checked ? 16 : 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
        className="absolute top-0.5 block"
        style={{ width: 16, height: 16, background: "#fff", borderRadius: "50%" }}
      />
    </button>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-4 border-b"
      style={{ borderColor: "var(--border-dim)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label}</p>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function CodeBlock({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{ background: "var(--bg-void)", border: "1px solid var(--border-dim)", borderRadius: 4 }}
    >
      <span className="text-xs font-mono-data flex-1 truncate" style={{ color: "var(--text-secondary)" }}>
        {value}
      </span>
      <button
        onClick={copy}
        className="flex-shrink-0 text-xs flex items-center gap-1 transition-colors"
        style={{ color: copied ? "var(--signal-green)" : "var(--text-dim)" }}
        id={`copy-${label}`}
        aria-label={`Copy ${label}`}
      >
        {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
      </button>
    </div>
  );
}

// ─── Section Panels ────────────────────────────────────────────────────────────

function IntegrationsSection({ tiktokConnection }: { tiktokConnection: TikTokConnection | null }) {
  const isConnected = !!tiktokConnection;
  const accessExpired  = isConnected && new Date(tiktokConnection!.accessExpiry)  < new Date();
  const refreshExpired = isConnected && new Date(tiktokConnection!.refreshExpiry) < new Date();
  const needsReauth    = refreshExpired;
  // connection health: ok if connected and not expired, partial if access expired but refresh ok
  const health: boolean | "partial" = !isConnected ? false
    : needsReauth ? false
    : accessExpired ? "partial"
    : true;
  return (
    <div className="space-y-8">
      {/* TikTok Shop */}
      <div>
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-4"
          style={{ color: "var(--text-dim)" }}
        >
          TikTok Shop
        </h3>
        <div
          className="rounded-sm border"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border-dim)" }}
        >
          {/* Connection Status */}
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShoppingBag size={18} style={{ color: "var(--signal-amber)" }} />
                <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>TikTok Shop API</span>
              </div>
              {/* Live badge from DB */}
              {isConnected && !needsReauth ? (
                <div
                  className="flex items-center gap-1.5 text-xs px-2 py-1"
                  style={{
                    background: "color-mix(in srgb, var(--signal-green) 12%, transparent)",
                    color: "var(--signal-green)",
                    border: "1px solid color-mix(in srgb, var(--signal-green) 25%, transparent)",
                    borderRadius: 4,
                  }}
                >
                  <CheckCircle2 size={11} />
                  Connected
                </div>
              ) : needsReauth ? (
                <div
                  className="flex items-center gap-1.5 text-xs px-2 py-1"
                  style={{
                    background: "color-mix(in srgb, var(--signal-red) 12%, transparent)",
                    color: "var(--signal-red)",
                    border: "1px solid color-mix(in srgb, var(--signal-red) 25%, transparent)",
                    borderRadius: 4,
                  }}
                >
                  <XCircle size={11} />
                  Re-auth Required
                </div>
              ) : (
                <div
                  className="flex items-center gap-1.5 text-xs px-2 py-1"
                  style={{
                    background: "color-mix(in srgb, var(--signal-amber) 12%, transparent)",
                    color: "var(--signal-amber)",
                    border: "1px solid color-mix(in srgb, var(--signal-amber) 25%, transparent)",
                    borderRadius: 4,
                  }}
                >
                  <AlertCircle size={11} />
                  Pending OAuth
                </div>
              )}
            </div>

            {/* Status checklist — live when connected */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {[
                { label: "App Key",      status: true },
                { label: "App Secret",   status: true },
                { label: "Open ID",       status: isConnected },
                { label: "Access Token", status: isConnected && !accessExpired },
              ].map(({ label, status }) => (
                <div key={label} className="flex items-center gap-2">
                  {status
                    ? <CheckCircle2 size={13} style={{ color: "var(--signal-green)" }} />
                    : <XCircle      size={13} style={{ color: "var(--signal-gray)" }} />
                  }
                  <span className="text-xs" style={{ color: status ? "var(--text-primary)" : "var(--text-dim)" }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* Connected details */}
            {isConnected && (
              <div
                className="text-xs p-3 mb-4 space-y-1.5"
                style={{ background: "color-mix(in srgb, var(--signal-green) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--signal-green) 18%, transparent)", borderRadius: 4 }}
              >
                <p style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--text-dim)" }}>Seller: </span>
                  <strong style={{ color: "var(--text-primary)" }}>{tiktokConnection!.sellerName ?? "—"}</strong>
                  {tiktokConnection!.region && <span style={{ color: "var(--text-dim)" }}> · {tiktokConnection!.region}</span>}
                </p>
                <p style={{ color: "var(--text-secondary)" }} className="font-mono-data text-[10px] break-all">
                  <span style={{ color: "var(--text-dim)" }}>Open ID: </span>{tiktokConnection!.shopId}
                </p>
                <p style={{ color: accessExpired ? "var(--signal-amber)" : "var(--text-dim)" }} className="text-[10px]">
                  Access token expires: {new Date(tiktokConnection!.accessExpiry).toLocaleString()}
                  {accessExpired && " ⚠️ expired"}
                </p>
              </div>
            )}

            {/* Callback URL — always shown */}
            <div className="mb-4">
              <p className="text-[11px] mb-1.5 font-semibold" style={{ color: "var(--text-secondary)" }}>OAUTH CALLBACK URL (set in Partner Center)</p>
              <CodeBlock value={TIKTOK_CALLBACK_URL} label="callback-url" />
            </div>

            {/* Connect / Re-authorize button */}
            <a
              id="btn-connect-tiktok"
              href={TIKTOK_AUTH_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{
                background: isConnected ? "var(--bg-overlay)" : "var(--signal-amber)",
                color: isConnected ? "var(--text-primary)" : "var(--bg-void)",
                border: isConnected ? "1px solid var(--border-dim)" : "none",
                borderRadius: 4,
              }}
            >
              {isConnected ? "Re-authorize" : "Connect TikTok Shop"}
              <ExternalLink size={13} />
            </a>
          </div>

          {/* Webhook Config */}
          <div className="px-5 py-4 border-t" style={{ borderColor: "var(--border-dim)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Webhook size={13} style={{ color: "var(--text-secondary)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>WEBHOOK ENDPOINT</span>
              <span
                className="text-[10px] px-1.5 py-0.5 ml-auto"
                style={{ background: "color-mix(in srgb, var(--signal-green) 12%, transparent)", color: "var(--signal-green)", borderRadius: 3 }}
              >
                ACTIVE
              </span>
            </div>
            <CodeBlock
              value="https://dcrafts.vercel.app/api/webhooks/tiktok"
              label="webhook-url"
            />
            <p className="text-[11px] mt-2" style={{ color: "var(--text-dim)" }}>
              Set this URL in TikTok Partner Center → Webhooks. HMAC-SHA256 verification enabled.
            </p>
          </div>

          {/* Polling Job */}
          <div className="px-5 py-4 border-t" style={{ borderColor: "var(--border-dim)" }}>
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw size={13} style={{ color: "var(--text-secondary)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>POLLING FALLBACK</span>
              <span
                className="text-[10px] px-1.5 py-0.5 ml-auto"
                style={{ background: "color-mix(in srgb, var(--signal-blue) 12%, transparent)", color: "var(--signal-blue)", borderRadius: 3 }}
              >
                pg_cron every 15min
              </span>
            </div>
            <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>
              Edge Function fires automatically if webhooks miss orders. Requires <code className="font-mono-data">TIKTOK_SHOP_ID</code>.
            </p>
          </div>
        </div>
      </div>

      {/* CS API */}
      <div>
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-4"
          style={{ color: "var(--text-dim)" }}
        >
          Customer Service API
        </h3>
        <div
          className="rounded-sm border px-5 py-4"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border-dim)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <MessageSquareText size={15} style={{ color: "var(--signal-blue)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>CS Message API</span>
            <span
              className="text-[10px] px-1.5 py-0.5 ml-auto"
              style={{ background: "color-mix(in srgb, var(--signal-amber) 12%, transparent)", color: "var(--signal-amber)", borderRadius: 3 }}
            >
              Approval Pending
            </span>
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
            Required scopes: <code className="font-mono-data text-[11px]">CS.MESSAGE_AND_ROOM.READ</code> · <code className="font-mono-data text-[11px]">CS.MESSAGE_AND_ROOM.WRITE</code>
          </p>
          <div
            className="flex items-start gap-2 text-xs p-3"
            style={{ background: "color-mix(in srgb, var(--signal-amber) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--signal-amber) 20%, transparent)", borderRadius: 4 }}
          >
            <AlertCircle size={12} className="flex-shrink-0 mt-0.5" style={{ color: "var(--signal-amber)" }} />
            <p style={{ color: "var(--text-secondary)" }}>
              Apply for CS API access in TikTok Partner Center → Manage App → Manage API. Select App Category: <strong style={{ color: "var(--text-primary)" }}>TikTok Shop Seller</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Semaphore SMS */}
      <div>
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-4"
          style={{ color: "var(--text-dim)" }}
        >
          SMS (Phase 3)
        </h3>
        <div
          className="rounded-sm border px-5 py-4"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border-dim)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={14} style={{ color: "var(--signal-green)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Semaphore SMS</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <StatusDot ok={true} />
              <span style={{ color: "var(--signal-green)" }}>API Key configured</span>
            </div>
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--text-dim)" }}>
            Ready for Phase 3. Will send buyer notifications on wrong-order flags.
          </p>
        </div>
      </div>
    </div>
  );
}

function BotSection() {
  const [shadowMode, setShadowMode] = useState(true);
  const [suggestMode, setSuggestMode] = useState(true);
  const [autoSend, setAutoSend] = useState(false);
  const [handoffEnabled, setHandoffEnabled] = useState(true);

  return (
    <div className="space-y-8">
      <div>
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-4"
          style={{ color: "var(--text-dim)" }}
        >
          Operation Mode
        </h3>
        <div
          className="rounded-sm border"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border-dim)" }}
        >
          <div className="px-5">
            <SettingRow
              label="Monitor Mode (Shadow)"
              description="All activity logged and reviewed. No messages sent externally. Required during testing phase."
            >
              <ToggleSwitch id="toggle-shadow-mode" checked={shadowMode} onChange={setShadowMode} />
            </SettingRow>
            <SettingRow
              label="Agent Assist Mode"
              description="AI drafts suggested replies for the service agent to review, edit, and approve before sending."
            >
              <ToggleSwitch id="toggle-suggest-mode" checked={suggestMode} onChange={setSuggestMode} />
            </SettingRow>
            <SettingRow
              label="Full-Auto Send"
              description="Agent sends approved replies directly. Only available with shadow mode disabled and manager-level access."
            >
              <ToggleSwitch id="toggle-auto-send" checked={autoSend} onChange={setAutoSend} />
            </SettingRow>
          </div>
        </div>
      </div>

      <div>
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-4"
          style={{ color: "var(--text-dim)" }}
        >
          Intent Detection (GPT-4o-mini)
        </h3>
        <div
          className="rounded-sm border"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border-dim)" }}
        >
          <div className="px-5">
            <SettingRow
              label="Human Handoff Detection"
              description="Escalate to human when buyer frustration or complex complaint is detected."
            >
              <ToggleSwitch id="toggle-handoff" checked={handoffEnabled} onChange={setHandoffEnabled} />
            </SettingRow>
            <SettingRow
              label="Model"
              description="Language model used for intent classification and reply generation."
            >
              <span
                className="text-xs px-2 py-1 font-mono-data"
                style={{ background: "var(--bg-overlay)", color: "var(--signal-blue)", border: "1px solid var(--border-dim)", borderRadius: 4 }}
              >
                gpt-4o-mini
              </span>
            </SettingRow>
          </div>
        </div>
      </div>

      <div>
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-4"
          style={{ color: "var(--text-dim)" }}
        >
          Spec Collector (4-Step Flow)
        </h3>
        <div
          className="rounded-sm border px-5 py-4"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border-dim)" }}
        >
          {[
            { step: 1, label: "Text to print (verbatim)", note: "e.g. \"Lets go GSW\" → 9 pieces" },
            { step: 2, label: "Color",                    note: "Freeform → 23 options" },
            { step: 3, label: "Size",                     note: "S / M / L / XL" },
            { step: 4, label: "Confirm recap",             note: "Buyer says YES → spec written to DB" },
          ].map(({ step, label, note }) => (
            <div
              key={step}
              className="flex items-center gap-3 py-2.5 border-b last:border-0"
              style={{ borderColor: "var(--border-dim)" }}
            >
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{ background: "var(--signal-blue)", color: "#fff" }}
              >
                {step}
              </span>
              <div className="flex-1">
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>{label}</span>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-dim)" }}>{note}</p>
              </div>
              <CheckCircle2 size={13} style={{ color: "var(--signal-green)" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotificationsSection() {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [escalationAlerts, setEscalationAlerts] = useState(true);
  const [newOrderAlerts, setNewOrderAlerts] = useState(false);

  return (
    <div
      className="rounded-sm border"
      style={{ background: "var(--bg-raised)", borderColor: "var(--border-dim)" }}
    >
      <div className="px-5">
        <SettingRow
          label="Email: Escalation Alerts"
          description="Email when a conversation is flagged for human review."
        >
          <ToggleSwitch id="toggle-email-escalation" checked={escalationAlerts} onChange={setEscalationAlerts} />
        </SettingRow>
        <SettingRow
          label="Email: New Order"
          description="Email on every new order ingested from TikTok."
        >
          <ToggleSwitch id="toggle-email-orders" checked={newOrderAlerts} onChange={setNewOrderAlerts} />
        </SettingRow>
        <SettingRow
          label="Email Alerts (Global)"
          description="Master switch for all email notifications."
        >
          <ToggleSwitch id="toggle-email-global" checked={emailAlerts} onChange={setEmailAlerts} />
        </SettingRow>
      </div>
    </div>
  );
}

function SecuritySection() {
  return (
    <div className="space-y-6">
      <div>
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-4"
          style={{ color: "var(--text-dim)" }}
        >
          Access Control
        </h3>
        <div
          className="rounded-sm border"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border-dim)" }}
        >
          {[
            { role: "admin", label: "Admin (You)", email: "robneil@gmail.com", badge: "admin", color: "var(--signal-amber)" },
          ].map(({ role, label, email, badge, color }) => (
            <div
              key={role}
              className="flex items-center gap-3 px-5 py-3.5 border-b last:border-0"
              style={{ borderColor: "var(--border-dim)" }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: "var(--bg-overlay)", color }}
              >
                R
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label}</p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{email}</p>
              </div>
              <span
                className="text-[10px] px-2 py-0.5 font-semibold"
                style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color, borderRadius: 3 }}
              >
                {badge}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-4"
          style={{ color: "var(--text-dim)" }}
        >
          API Keys & Secrets
        </h3>
        <div
          className="rounded-sm border px-5 py-4 space-y-4"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border-dim)" }}
        >
          {[
            { label: "Supabase Anon Key", value: "sb_publishable_advVn•••••••••••••nv0z", icon: Key },
            { label: "TTS App Key", value: "6jmdue6u1vhia", icon: ShoppingBag },
            { label: "Semaphore API Key", value: "f1f28df0•••••••••b7a72", icon: Zap },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon size={11} style={{ color: "var(--text-dim)" }} />
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
              </div>
              <CodeBlock value={value} label={label.toLowerCase().replace(/ /g, "-")} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-4"
          style={{ color: "var(--text-dim)" }}
        >
          Database RLS
        </h3>
        <div
          className="rounded-sm border px-5 py-4"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border-dim)" }}
        >
          {[
            { table: "orders",              admin: "ALL",    anon: "❌" },
            { table: "print_specs",         admin: "ALL",    anon: "❌" },
            { table: "print_jobs",          admin: "ALL",    anon: "❌" },
            { table: "feature_flags",       admin: "SELECT", anon: "❌" },
            { table: "sms_logs",            admin: "SELECT", anon: "❌" },
          ].map(({ table, admin, anon }) => (
            <div
              key={table}
              className="grid grid-cols-3 py-2.5 border-b last:border-0 text-xs"
              style={{ borderColor: "var(--border-dim)" }}
            >
              <span className="font-mono-data" style={{ color: "var(--text-secondary)" }}>{table}</span>
              <span className="text-center" style={{ color: "var(--signal-green)" }}>{admin}</span>
              <span className="text-center" style={{ color: "var(--text-dim)" }}>{anon}</span>
            </div>
          ))}
          <div
            className="grid grid-cols-3 pt-2 text-[10px] font-semibold uppercase"
            style={{ color: "var(--text-dim)" }}
          >
            <span>Table</span>
            <span className="text-center">Admin</span>
            <span className="text-center">Public</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

/**
 * /admin/settings — Platform Settings
 *
 * Integrations, bot config, notifications, and security overview.
 */
export default function SettingsPageClient({ tiktokConnection }: { tiktokConnection: TikTokConnection | null }) {
  const [section, setSection] = useState<SectionId>("integrations");

  const panels: Record<SectionId, React.ReactNode> = {
    integrations:  <IntegrationsSection tiktokConnection={tiktokConnection} />,
    bot:           <BotSection />,
    notifications: <NotificationsSection />,
    security:      <SecuritySection />,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* OAuth result toast — reads ?tiktok_auth= from URL after redirect */}
      <Suspense fallback={null}>
        <AuthToast />
      </Suspense>

      {/* Left nav */}
      <aside
        className="flex-col border-r hidden md:flex"
        style={{ width: 220, background: "var(--bg-surface)", borderColor: "var(--border-dim)" }}
      >
        <div
          className="flex items-center gap-2 px-4 py-3.5 border-b"
          style={{ borderColor: "var(--border-dim)" }}
        >
          <Settings size={15} style={{ color: "var(--signal-amber)" }} />
          <h1 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Settings</h1>
        </div>
        <div className="p-2">
          <SectionNav active={section} onSelect={setSection} />
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8" style={{ background: "var(--bg-void)" }}>
        <div className="max-w-2xl">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <h2
              className="text-lg font-semibold mb-6 capitalize"
              style={{ color: "var(--text-primary)" }}
            >
              {SECTIONS.find((s) => s.id === section)?.label}
            </h2>
            {panels[section]}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
