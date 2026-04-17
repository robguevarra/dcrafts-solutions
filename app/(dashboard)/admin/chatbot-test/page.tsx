"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  User,
  Send,
  RefreshCw,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Zap,
  Hash,
  Palette,
  Ruler,
  ClipboardCheck,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "buyer" | "bot";
  text: string;
  timestamp: string;
}

interface SpecDraft {
  lettersText?: string;
  colorName?: string;
  sizeCm?: number;
  quantity?: number;
}

interface ApiResponse {
  suggestedReply: string;
  nextState: string;
  nextSpecStep: string;
  shouldEscalate: boolean;
  specDraft: SpecDraft;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SPEC_STEPS = [
  { key: "letters_text", label: "Text", icon: Hash, hint: "What letters/word?" },
  { key: "color",        label: "Color", icon: Palette, hint: "Which of 23 colors?" },
  { key: "size",         label: "Size", icon: Ruler, hint: "S / M / L / XL?" },
  { key: "confirm",      label: "Confirm", icon: ClipboardCheck, hint: "Buyer says YES" },
] as const;

type SpecStep = (typeof SPEC_STEPS)[number]["key"];

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatTime() {
  return new Date().toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stepIndex(step: string): number {
  return SPEC_STEPS.findIndex((s) => s.key === step);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SpecStepProgress({
  currentStep,
  specDraft,
}: {
  currentStep: string;
  specDraft: SpecDraft;
}) {
  const currentIdx = stepIndex(currentStep);

  return (
    <div className="space-y-2">
      {SPEC_STEPS.map(({ key, label, icon: Icon, hint }, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <div key={key} className="flex items-start gap-3">
            <div
              className="flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 mt-0.5"
              style={{
                background: isDone
                  ? "var(--signal-green)"
                  : isCurrent
                  ? "color-mix(in srgb, var(--signal-amber) 20%, transparent)"
                  : "var(--bg-overlay)",
                border: isCurrent ? "1px solid var(--signal-amber)" : "none",
              }}
            >
              {isDone ? (
                <CheckCircle2 size={12} style={{ color: "var(--bg-void)" }} />
              ) : (
                <Icon
                  size={11}
                  style={{
                    color: isCurrent ? "var(--signal-amber)" : "var(--text-dim)",
                  }}
                />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-medium"
                style={{
                  color: isDone
                    ? "var(--signal-green)"
                    : isCurrent
                    ? "var(--signal-amber)"
                    : "var(--text-dim)",
                }}
              >
                {label}
                {isDone && key === "letters_text" && specDraft.lettersText && (
                  <span
                    className="ml-2 font-mono-data text-[10px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    &quot;{specDraft.lettersText}&quot; × {specDraft.quantity}
                  </span>
                )}
                {isDone && key === "color" && specDraft.colorName && (
                  <span
                    className="ml-2 font-mono-data text-[10px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {specDraft.colorName}
                  </span>
                )}
                {isDone && key === "size" && specDraft.sizeCm && (
                  <span
                    className="ml-2 font-mono-data text-[10px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {specDraft.sizeCm}cm
                  </span>
                )}
              </p>
              {isCurrent && (
                <p className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                  {hint}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SpecDraftCard({ draft }: { draft: SpecDraft }) {
  const fields = [
    { label: "Letters text", value: draft.lettersText },
    { label: "Quantity", value: draft.quantity?.toString() },
    { label: "Color", value: draft.colorName },
    { label: "Size (cm)", value: draft.sizeCm?.toString() },
  ];

  return (
    <div className="space-y-1.5">
      {fields.map(({ label, value }) => (
        <div key={label} className="flex items-center justify-between gap-2">
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            {label}
          </span>
          <span
            className="text-[11px] font-mono-data"
            style={{ color: value ? "var(--text-primary)" : "var(--text-dim)" }}
          >
            {value ?? "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function RawJsonPanel({ data }: { data: ApiResponse | null }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[10px] w-full py-1"
        style={{ color: "var(--text-dim)" }}
      >
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        Raw API Response
      </button>
      {open && (
        <pre
          className="text-[10px] p-2 rounded overflow-x-auto leading-relaxed"
          style={{
            background: "var(--bg-void)",
            color: "var(--signal-green)",
            border: "1px solid var(--border-dim)",
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

/**
 * /admin/chatbot-test — Bot Playground
 *
 * Live test environment for the chatbot pipeline.
 * Creates a real DB conversation, sends messages through POST /api/chatbot/process,
 * and shows spec_draft accumulation, step progress, and raw API output in real time.
 * No TikTok account required.
 */
export default function ChatbotTestPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("letters_text");
  const [specDraft, setSpecDraft] = useState<SpecDraft>({});
  const [lastResponse, setLastResponse] = useState<ApiResponse | null>(null);
  const [escalated, setEscalated] = useState(false);
  const [currentState, setCurrentState] = useState<string>("new");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Create a new test session
  const startNewSession = useCallback(async () => {
    setSeeding(true);
    setMessages([]);
    setSpecDraft({});
    setCurrentStep("letters_text");
    setLastResponse(null);
    setEscalated(false);
    setCurrentState("new");

    try {
      const res = await fetch("/api/chatbot/playground-proxy", {
        method: "GET",
      });
      const data = await res.json() as { conversationId?: string; error?: string };

      if (!res.ok || !data.conversationId) {
        throw new Error(data.error ?? "Failed to create session");
      }

      setConversationId(data.conversationId);
      setMessages([
        {
          id: "sys-0",
          role: "bot",
          text: `👋 Kamusta po! I'm the Dcrafts AI assistant. I'll help collect the print details for your paper cut letter order!\n\nWhat exact text would you like printed? (e.g. "Grace", "ROB@25", "HAPPY BIRTHDAY")`,
          timestamp: formatTime(),
        },
      ]);
    } catch (err) {
      console.error("[Playground] Session creation failed:", err);
    } finally {
      setSeeding(false);
      inputRef.current?.focus();
    }
  }, []);

  // Send a message through the chatbot pipeline
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || !conversationId || loading) return;

    setInput("");
    const buyerMsg: ChatMessage = {
      id: `buyer-${Date.now()}`,
      role: "buyer",
      text,
      timestamp: formatTime(),
    };
    setMessages((prev) => [...prev, buyerMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/chatbot/playground-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, buyerMessage: text }),
      });

      // Always parse JSON — both success and error responses have JSON bodies
      const data = await res.json() as ApiResponse & { error?: string; message?: string };

      if (!res.ok) {
        // Show the actual server error in the chat instead of a generic message
        const errText = data.message ?? data.error ?? `HTTP ${res.status}`;
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "bot" as const,
            text: `⚠️ Pipeline error: ${errText}`,
            timestamp: formatTime(),
          },
        ]);
        return;
      }

      setLastResponse(data);
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: "bot",
        text: data.suggestedReply ?? "(empty reply)",
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, botMsg]);
      setCurrentStep(data.nextSpecStep ?? "letters_text");
      setSpecDraft(data.specDraft ?? {});
      setCurrentState(data.nextState);
      setEscalated(data.shouldEscalate);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "bot" as const,
          text: `⚠️ ${msg}`,
          timestamp: formatTime(),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, conversationId, loading]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-void)" }}>
      {/* ── Left Panel: Chat ──────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0"
          style={{ borderColor: "var(--border-dim)", background: "var(--bg-surface)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-8 h-8"
              style={{
                background: "color-mix(in srgb, var(--signal-blue) 15%, transparent)",
                border: "1px solid color-mix(in srgb, var(--signal-blue) 30%, transparent)",
              }}
            >
              <FlaskConical size={16} style={{ color: "var(--signal-blue)" }} />
            </div>
            <div>
              <h1 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Bot Playground
              </h1>
              <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                {conversationId
                  ? `Session · ${conversationId.slice(0, 8)}…`
                  : "No active session"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {escalated && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs"
                style={{
                  background: "color-mix(in srgb, var(--signal-red) 15%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--signal-red) 30%, transparent)",
                  color: "var(--signal-red)",
                }}
              >
                <AlertTriangle size={12} />
                Escalated to Human
              </motion.div>
            )}

            {conversationId && (
              <span
                className="text-[10px] px-2 py-1 font-mono-data"
                style={{
                  background: "color-mix(in srgb, var(--signal-green) 12%, transparent)",
                  color: "var(--signal-green)",
                  border: "1px solid color-mix(in srgb, var(--signal-green) 25%, transparent)",
                }}
              >
                {currentState?.toUpperCase() || "UNKNOWN"}
              </span>
            )}

            <button
              onClick={startNewSession}
              disabled={seeding}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
              style={{
                background: "var(--signal-amber)",
                color: "var(--bg-void)",
              }}
              id="btn-new-session"
            >
              {seeding ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              New Session
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 py-5 space-y-4"
        >
          {!conversationId ? (
            // Empty state
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div
                className="w-16 h-16 flex items-center justify-center"
                style={{
                  background: "color-mix(in srgb, var(--signal-blue) 10%, transparent)",
                  border: "1px dashed color-mix(in srgb, var(--signal-blue) 30%, transparent)",
                }}
              >
                <FlaskConical size={28} style={{ color: "var(--signal-blue)" }} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Start a test session
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
                  Creates a real DB conversation and runs the full chatbot pipeline
                </p>
              </div>
              <button
                onClick={startNewSession}
                disabled={seeding}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: "var(--signal-amber)", color: "var(--bg-void)" }}
                id="btn-start-session"
              >
                {seeding ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Start New Session
              </button>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg) => {
                const isBot = msg.role === "bot";
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn("flex gap-3", isBot ? "flex-row" : "flex-row-reverse")}
                  >
                    {/* Avatar */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{
                        background: isBot
                          ? "color-mix(in srgb, var(--signal-blue) 20%, transparent)"
                          : "var(--bg-overlay)",
                        border: isBot
                          ? "1px solid color-mix(in srgb, var(--signal-blue) 30%, transparent)"
                          : "1px solid var(--border-dim)",
                      }}
                    >
                      {isBot ? (
                        <Bot size={14} style={{ color: "var(--signal-blue)" }} />
                      ) : (
                        <User size={14} style={{ color: "var(--signal-amber)" }} />
                      )}
                    </div>

                    {/* Bubble */}
                    <div className={cn("max-w-[70%]", !isBot && "items-end flex flex-col")}>
                      <div
                        className="px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                        style={{
                          background: isBot
                            ? "color-mix(in srgb, var(--signal-blue) 8%, var(--bg-surface))"
                            : "var(--bg-overlay)",
                          color: "var(--text-primary)",
                          borderRadius: isBot ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
                          border: isBot
                            ? "1px solid color-mix(in srgb, var(--signal-blue) 20%, transparent)"
                            : "1px solid var(--border-dim)",
                        }}
                      >
                        {msg.text}
                      </div>
                      <span
                        className="flex items-center gap-1 text-[10px] mt-1 px-1"
                        style={{ color: "var(--text-dim)" }}
                      >
                        {isBot && <Bot size={9} />}
                        {msg.timestamp}
                      </span>
                    </div>
                  </motion.div>
                );
              })}

              {/* Typing indicator */}
              {loading && (
                <motion.div
                  key="typing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-3"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      background: "color-mix(in srgb, var(--signal-blue) 20%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--signal-blue) 30%, transparent)",
                    }}
                  >
                    <Bot size={14} style={{ color: "var(--signal-blue)" }} />
                  </div>
                  <div
                    className="flex items-center gap-1.5 px-4 py-3"
                    style={{
                      background: "color-mix(in srgb, var(--signal-blue) 8%, var(--bg-surface))",
                      border: "1px solid color-mix(in srgb, var(--signal-blue) 20%, transparent)",
                      borderRadius: "4px 14px 14px 14px",
                    }}
                  >
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: "var(--signal-blue)" }}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Input */}
        {conversationId && !escalated && (
          <div
            className="border-t p-3 flex-shrink-0"
            style={{ borderColor: "var(--border-dim)", background: "var(--bg-surface)" }}
          >
            <div
              className="flex items-end gap-2 px-3 py-2"
              style={{
                background: "var(--bg-overlay)",
                border: "1px solid var(--border-bright)",
                borderRadius: 6,
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type as the buyer… (⌘+Enter to send)"
                className="flex-1 text-sm resize-none outline-none bg-transparent"
                rows={2}
                style={{ color: "var(--text-primary)" }}
                id="playground-input"
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && input.trim()) {
                    sendMessage();
                  }
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="flex items-center justify-center w-8 h-8 flex-shrink-0 transition-opacity disabled:opacity-30"
                style={{
                  background: "var(--signal-amber)",
                  color: "var(--bg-void)",
                  borderRadius: 4,
                }}
                id="btn-send"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
              </button>
            </div>
            <p className="text-[10px] mt-1.5 pl-1" style={{ color: "var(--text-dim)" }}>
              Typing as buyer · Pipeline: intent → handoff → spec → reply → DB persist
            </p>
          </div>
        )}

        {escalated && (
          <div
            className="border-t p-4 text-center flex-shrink-0"
            style={{ borderColor: "var(--border-dim)", background: "var(--bg-surface)" }}
          >
            <p className="text-sm" style={{ color: "var(--signal-red)" }}>
              🚨 Conversation escalated to human agent
            </p>
            <button
              onClick={startNewSession}
              className="mt-2 text-xs px-3 py-1.5"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border-dim)" }}
            >
              Start new session
            </button>
          </div>
        )}
      </div>

      {/* ── Right Panel: Debug ─────────────────────────────────── */}
      <div
        className="flex-col border-l hidden lg:flex"
        style={{ width: 300, background: "var(--bg-surface)", borderColor: "var(--border-dim)" }}
      >
        {/* Panel header */}
        <div
          className="px-4 py-3.5 border-b text-xs font-semibold flex items-center gap-2"
          style={{ borderColor: "var(--border-dim)", color: "var(--text-secondary)" }}
        >
          <Circle size={8} style={{ color: conversationId ? "var(--signal-green)" : "var(--text-dim)" }} />
          LIVE DEBUG
        </div>

        <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: "var(--border-dim)" }}>
          {/* Spec step progress */}
          <div className="p-4 space-y-3">
            <p className="text-[10px] font-semibold" style={{ color: "var(--text-dim)" }}>
              SPEC PROGRESS
            </p>
            <SpecStepProgress currentStep={currentStep} specDraft={specDraft} />
          </div>

          {/* Spec draft values */}
          <div className="p-4 space-y-3">
            <p className="text-[10px] font-semibold" style={{ color: "var(--text-dim)" }}>
              SPEC DRAFT
            </p>
            <SpecDraftCard draft={specDraft} />
          </div>

          {/* Pipeline state */}
          <div className="p-4 space-y-2">
            <p className="text-[10px] font-semibold" style={{ color: "var(--text-dim)" }}>
              PIPELINE STATE
            </p>
            {[
              { label: "DB State", value: currentState || "—" },
              { label: "Spec Step", value: currentStep || "—" },
              {
                label: "Escalate",
                value: escalated ? "⚠️ YES" : "✅ NO",
              },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                  {label}
                </span>
                <span
                  className="text-[11px] font-mono-data"
                  style={{ color: "var(--text-primary)" }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* Quick test prompts */}
          <div className="p-4 space-y-2">
            <p className="text-[10px] font-semibold" style={{ color: "var(--text-dim)" }}>
              QUICK PROMPTS
            </p>
            {[
              { label: "Give text", msg: "Grace po" },
              { label: "Color (tangent)", msg: "Pano mag-track? Rose gold sana" },
              { label: "Size", msg: "M po" },
              { label: "Confirm YES", msg: "YES" },
              { label: "Trigger escalation", msg: "I want a refund, this is wrong!" },
              { label: "Ask human", msg: "Talk to a real person please" },
            ].map(({ label, msg }) => (
              <button
                key={label}
                onClick={() => {
                  setInput(msg);
                  inputRef.current?.focus();
                }}
                disabled={!conversationId || loading}
                className="w-full text-left px-2.5 py-1.5 text-[11px] transition-colors hover:text-[var(--text-primary)] disabled:opacity-30"
                style={{
                  border: "1px solid var(--border-dim)",
                  borderRadius: 4,
                  color: "var(--text-secondary)",
                }}
              >
                {label}
                <span
                  className="ml-1.5 font-mono-data text-[10px] truncate"
                  style={{ color: "var(--text-dim)" }}
                >
                  → &quot;{msg.length > 20 ? msg.slice(0, 20) + "…" : msg}&quot;
                </span>
              </button>
            ))}
          </div>

          {/* Raw JSON */}
          <div className="p-4">
            <p className="text-[10px] font-semibold mb-2" style={{ color: "var(--text-dim)" }}>
              API RESPONSE
            </p>
            <RawJsonPanel data={lastResponse} />
          </div>
        </div>

        {/* Session ID footer */}
        <div
          className="px-4 py-3 border-t"
          style={{ borderColor: "var(--border-dim)" }}
        >
          <p className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            Session ID
          </p>
          <p
            className="text-[10px] font-mono-data truncate mt-0.5"
            style={{ color: "var(--text-secondary)" }}
          >
            {conversationId ?? "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
