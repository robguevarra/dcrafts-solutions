"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquareText,
  Search,
  Filter,
  Bot,
  User,
  Clock,
  CheckCheck,
  ChevronRight,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  Send,
  AlertCircle,
  Package,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Mock Data ─────────────────────────────────────────────────────────────────
// Realistic mock conversations for TikTok CS API scope approval screenshots.
// These will be replaced with live CS API data (T2.2).

type MessageRole = "buyer" | "seller" | "bot";
type ConvStatus = "pending" | "bot_active" | "human_review" | "resolved";
type IntentTag = "pre_order" | "spec_question" | "complaint" | "tracking" | "general";

interface Message {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: string;
  suggested?: boolean;
}

interface Conversation {
  id: string;
  buyerName: string;
  buyerHandle: string;
  orderId?: string;
  status: ConvStatus;
  intent: IntentTag;
  lastMessage: string;
  lastAt: string;
  unread: number;
  messages: Message[];
  botDraft?: string;
}

const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "conv_001",
    buyerName: "Maria Santos",
    buyerHandle: "@mariasantos_ph",
    orderId: "TT-20240417-001",
    status: "bot_active",
    intent: "pre_order",
    lastMessage: "What fonts do you have available for the tumbler?",
    lastAt: "2m ago",
    unread: 2,
    botDraft: "Hi Maria! We have 12 font families available 🎨 Our most popular are **Serif Elegant**, **Script Floral**, and **Bold Block**. Which style speaks to you? I can also send photos of each option!",
    messages: [
      { id: "m1", role: "buyer", text: "Hello! I want to order a custom tumbler for my mom's birthday 🎂", timestamp: "10:42 AM" },
      { id: "m2", role: "bot", text: "Hi Maria! 🌸 We'd love to help you create something special for your mom! Our tumblers are 20oz stainless steel with full-wrap UV printing. What name or message would you like on it?", timestamp: "10:42 AM" },
      { id: "m3", role: "buyer", text: "Her name is Nanay Rosa and maybe a floral design?", timestamp: "10:45 AM" },
      { id: "m4", role: "bot", text: "Beautiful choice! 💐 We have gorgeous floral backgrounds — tropical, watercolor, and minimalist line art. For 'Nanay Rosa', what font style do you prefer?", timestamp: "10:45 AM" },
      { id: "m5", role: "buyer", text: "What fonts do you have available for the tumbler?", timestamp: "10:51 AM" },
    ],
  },
  {
    id: "conv_002",
    buyerName: "Joel Reyes",
    buyerHandle: "@joelr_gamer",
    orderId: "TT-20240416-089",
    status: "human_review",
    intent: "complaint",
    lastMessage: "The colors on my order look faded compared to the preview",
    lastAt: "15m ago",
    unread: 1,
    messages: [
      { id: "m1", role: "buyer", text: "Hi, I received my order today but the colors look different from what I saw in the preview during ordering", timestamp: "9:30 AM" },
      { id: "m2", role: "bot", text: "Hi Joel! I'm sorry to hear that — that's definitely not the experience we want for you. Can you send me a photo of the item you received alongside the order preview? This helps our QC team review quickly 📸", timestamp: "9:31 AM" },
      { id: "m3", role: "buyer", text: "The colors on my order look faded compared to the preview", timestamp: "10:35 AM" },
    ],
  },
  {
    id: "conv_003",
    buyerName: "Anna Lim",
    buyerHandle: "@annalim_crafts",
    status: "bot_active",
    intent: "spec_question",
    lastMessage: "Can I put 3 names on one tumbler?",
    lastAt: "31m ago",
    unread: 0,
    botDraft: "Yes, absolutely! You can have up to 4 names or lines of text on one tumbler. Just let me know all the names and your preferred layout (stacked vertically or spread around the tumbler) 😊",
    messages: [
      { id: "m1", role: "buyer", text: "Can I put 3 names on one tumbler?", timestamp: "10:19 AM" },
    ],
  },
  {
    id: "conv_004",
    buyerName: "Carlo Mendoza",
    buyerHandle: "@carlom_ph",
    orderId: "TT-20240415-042",
    status: "pending",
    intent: "tracking",
    lastMessage: "When will my order ship?",
    lastAt: "1h ago",
    unread: 0,
    messages: [
      { id: "m1", role: "buyer", text: "Hi! When will my order ship? I placed it 3 days ago", timestamp: "9:05 AM" },
    ],
  },
  {
    id: "conv_005",
    buyerName: "Grace Tan",
    buyerHandle: "@gracetan_beauty",
    orderId: "TT-20240416-077",
    status: "resolved",
    intent: "general",
    lastMessage: "Thank you so much! It's perfect 🥰",
    lastAt: "3h ago",
    unread: 0,
    messages: [
      { id: "m1", role: "seller", text: "Hi Grace! Your order is now ready and packed. Estimated delivery is tomorrow ✨", timestamp: "7:00 AM" },
      { id: "m2", role: "buyer", text: "Thank you so much! It's perfect 🥰", timestamp: "7:15 AM" },
    ],
  },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ConvStatus, { label: string; color: string }> = {
  pending:      { label: "Pending",     color: "var(--signal-amber)" },
  bot_active:   { label: "Bot Active",  color: "var(--signal-blue)" },
  human_review: { label: "Needs Review", color: "var(--signal-red)" },
  resolved:     { label: "Resolved",   color: "var(--signal-green)" },
};

const INTENT_CONFIG: Record<IntentTag, { label: string }> = {
  pre_order:     { label: "Pre-order" },
  spec_question: { label: "Spec Q" },
  complaint:     { label: "Complaint" },
  tracking:      { label: "Tracking" },
  general:       { label: "General" },
};

function ConvRow({ conv, active, onClick }: { conv: Conversation; active: boolean; onClick: () => void }) {
  const status = STATUS_CONFIG[conv.status];
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 transition-all duration-150 border-b group",
        active ? "bg-[var(--bg-overlay)]" : "hover:bg-[var(--bg-raised)]"
      )}
      style={{ borderColor: "var(--border-dim)" }}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
          style={{ background: "var(--bg-overlay)", color: "var(--signal-amber)" }}
        >
          {conv.buyerName[0]}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {conv.buyerName}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {conv.unread > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "var(--signal-amber)", color: "var(--bg-void)" }}
                >
                  {conv.unread}
                </span>
              )}
              <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>{conv.lastAt}</span>
            </div>
          </div>

          <p className="text-xs truncate mb-1.5" style={{ color: "var(--text-secondary)" }}>
            {conv.lastMessage}
          </p>

          <div className="flex items-center gap-1.5">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-sm font-medium"
              style={{
                background: `color-mix(in srgb, ${status.color} 12%, transparent)`,
                color: status.color,
              }}
            >
              {status.label}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-sm"
              style={{ background: "var(--bg-overlay)", color: "var(--text-secondary)" }}
            >
              {INTENT_CONFIG[conv.intent].label}
            </span>
            {conv.orderId && (
              <span className="text-[10px] font-mono-data" style={{ color: "var(--text-dim)" }}>
                #{conv.orderId.slice(-6)}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isBot = msg.role === "bot";
  const isBuyer = msg.role === "buyer";
  const isSeller = msg.role === "seller";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex gap-2 group", isBuyer ? "flex-row" : "flex-row-reverse")}
    >
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          background: isBuyer ? "var(--bg-overlay)" :
                      isBot   ? "color-mix(in srgb, var(--signal-blue) 20%, transparent)" :
                                "color-mix(in srgb, var(--signal-amber) 20%, transparent)",
        }}
      >
        {isBuyer  && <User size={12} style={{ color: "var(--text-secondary)" }} />}
        {isBot    && <Bot  size={12} style={{ color: "var(--signal-blue)" }} />}
        {isSeller && <User size={12} style={{ color: "var(--signal-amber)" }} />}
      </div>

      <div className={cn("max-w-[72%]", isBuyer ? "" : "items-end flex flex-col")}>
        <div
          className="px-3 py-2 text-sm leading-relaxed"
          style={{
            background: isBuyer ? "var(--bg-overlay)" :
                        isBot   ? "color-mix(in srgb, var(--signal-blue) 12%, transparent)" :
                                  "color-mix(in srgb, var(--signal-amber) 12%, transparent)",
            color: "var(--text-primary)",
            borderRadius: isBuyer ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
            border: `1px solid ${isBuyer ? "var(--border-dim)" :
                                 isBot   ? "color-mix(in srgb, var(--signal-blue) 25%, transparent)" :
                                           "color-mix(in srgb, var(--signal-amber) 25%, transparent)"}`,
          }}
        >
          {msg.text}
        </div>
        <span className="text-[10px] mt-1 px-1" style={{ color: "var(--text-dim)" }}>
          {isBot && <Bot size={9} className="inline mr-1" />}
          {msg.timestamp}
        </span>
      </div>
    </motion.div>
  );
}

function SuggestedReplyPanel({
  draft,
  onApprove,
  onDiscard,
}: {
  draft: string;
  onApprove: (text: string) => void;
  onDiscard: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState(draft);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-t"
      style={{ borderColor: "var(--border-dim)", background: "var(--bg-surface)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2 border-b"
        style={{ borderColor: "var(--border-dim)" }}
      >
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium"
          style={{
            background: "color-mix(in srgb, var(--signal-blue) 12%, transparent)",
            color: "var(--signal-blue)",
            border: "1px solid color-mix(in srgb, var(--signal-blue) 25%, transparent)",
          }}
        >
          <Sparkles size={10} />
          Smart Reply Suggestion
        </div>
        <span className="text-xs ml-auto" style={{ color: "var(--text-dim)" }}>
          Agent review required
        </span>
      </div>

      {/* Draft text */}
      <div className="px-4 py-3">
        {editing ? (
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full text-sm resize-none outline-none p-2"
            rows={3}
            style={{
              background: "var(--bg-overlay)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-bright)",
              borderRadius: 4,
            }}
            autoFocus
          />
        ) : (
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {editedText}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-t"
        style={{ borderColor: "var(--border-dim)" }}
      >
        <button
          onClick={() => onApprove(editedText)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
          style={{
            background: "var(--signal-blue)",
            color: "#fff",
            borderRadius: 4,
          }}
          id="btn-approve-reply"
        >
          <CheckCheck size={12} />
          Approve & Send
        </button>
        <button
          onClick={() => setEditing(!editing)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors hover:text-[var(--text-primary)]"
          style={{ color: "var(--text-secondary)", border: "1px solid var(--border-dim)", borderRadius: 4 }}
          id="btn-edit-reply"
        >
          <Edit3 size={12} />
          Edit
        </button>
        <button
          onClick={onDiscard}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs ml-auto transition-colors hover:text-[var(--signal-red)]"
          style={{ color: "var(--text-secondary)" }}
          id="btn-discard-reply"
        >
          <ThumbsDown size={12} />
          Discard
        </button>
      </div>
    </motion.div>
  );
}

function ManualReplyBox({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div
      className="border-t p-3"
      style={{ borderColor: "var(--border-dim)", background: "var(--bg-surface)" }}
    >
      <div
        className="flex items-end gap-2 p-2"
        style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-dim)", borderRadius: 6 }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 text-sm resize-none outline-none bg-transparent"
          rows={2}
          style={{ color: "var(--text-primary)" }}
          id="reply-input"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) {
              onSend(text);
              setText("");
            }
          }}
        />
        <button
          onClick={() => { if (text.trim()) { onSend(text); setText(""); } }}
          disabled={!text.trim()}
          className="flex items-center justify-center w-8 h-8 flex-shrink-0 transition-opacity disabled:opacity-30"
          style={{ background: "var(--signal-amber)", color: "var(--bg-void)", borderRadius: 4 }}
          id="btn-send-manual"
        >
          <Send size={14} />
        </button>
      </div>
      <p className="text-xs mt-1.5 pl-1" style={{ color: "var(--text-dim)" }}>
        ⌘+Enter to send · Replies go via TikTok CS API
      </p>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

/**
 * /admin/messaging — Messaging Studio
 *
 * Conversation inbox + chat view + AI suggested reply panel.
 * Uses mock data for Phase 1; live data from TikTok CS API in Phase 2.
 */
export default function MessagingPage() {
  const [selected, setSelected] = useState<Conversation>(MOCK_CONVERSATIONS[0]);
  const [messages, setMessages] = useState<Message[]>(selected.messages);
  const [search, setSearch] = useState("");
  const [botDraft, setBotDraft] = useState<string | undefined>(selected.botDraft);

  const filtered = MOCK_CONVERSATIONS.filter((c) =>
    c.buyerName.toLowerCase().includes(search.toLowerCase()) ||
    c.lastMessage.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (conv: Conversation) => {
    setSelected(conv);
    setMessages(conv.messages);
    setBotDraft(conv.botDraft);
  };

  const handleApprove = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `m${Date.now()}`, role: "seller", text, timestamp: "Now" },
    ]);
    setBotDraft(undefined);
  };

  const handleManualSend = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `m${Date.now()}`, role: "seller", text, timestamp: "Now" },
    ]);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Left Panel: Conversation List ────────────────── */}
      <div
        className="flex flex-col border-r"
        style={{ width: 320, background: "var(--bg-surface)", borderColor: "var(--border-dim)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3.5 border-b"
          style={{ borderColor: "var(--border-dim)" }}
        >
          <div className="flex items-center gap-2">
            <MessageSquareText size={16} style={{ color: "var(--signal-amber)" }} />
            <h1 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Messaging Studio
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="text-[10px] px-1.5 py-0.5 ml-auto"
              style={{
                background: "color-mix(in srgb, var(--signal-blue) 15%, transparent)",
                color: "var(--signal-blue)",
                borderRadius: 3,
              }}
            >
              CONNECTED — v0.1 mock
            </span>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border-dim)" }}>
          <div
            className="flex items-center gap-2 px-2.5 py-1.5"
            style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-dim)", borderRadius: 4 }}
          >
            <Search size={13} style={{ color: "var(--text-dim)" }} />
            <input
              type="text"
              placeholder="Search conversations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 text-xs outline-none bg-transparent"
              style={{ color: "var(--text-primary)" }}
              id="search-conversations"
            />
          </div>
        </div>

        {/* Stats bar */}
        <div
          className="grid grid-cols-3 divide-x text-center py-2 border-b"
          style={{ borderColor: "var(--border-dim)", divideBorderColor: "var(--border-dim)" }}
        >
          {[
            { label: "Pending", value: 1, color: "var(--signal-amber)" },
            { label: "Bot Active", value: 2, color: "var(--signal-blue)" },
            { label: "Review", value: 1, color: "var(--signal-red)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="py-1" style={{ borderColor: "var(--border-dim)" }}>
              <p className="text-base font-bold font-mono-data" style={{ color }}>{value}</p>
              <p className="text-[10px]" style={{ color: "var(--text-dim)" }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map((conv) => (
            <ConvRow
              key={conv.id}
              conv={conv}
              active={selected.id === conv.id}
              onClick={() => handleSelect(conv)}
            />
          ))}
        </div>
      </div>

      {/* ── Right Panel: Chat View ─────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: "var(--bg-void)" }}>
        {/* Chat Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--border-dim)", background: "var(--bg-surface)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm"
              style={{ background: "var(--bg-overlay)", color: "var(--signal-amber)" }}
            >
              {selected.buyerName[0]}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {selected.buyerName}
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {selected.buyerHandle}
                {selected.orderId && (
                  <span className="ml-2 font-mono-data">· Order #{selected.orderId.slice(-6)}</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Intent badge */}
            <span
              className="text-[10px] px-2 py-1 font-medium"
              style={{ background: "var(--bg-overlay)", color: "var(--text-secondary)", borderRadius: 4, border: "1px solid var(--border-dim)" }}
            >
              {INTENT_CONFIG[selected.intent].label}
            </span>
            {/* Status badge */}
            <span
              className="text-[10px] px-2 py-1 font-medium"
              style={{
                background: `color-mix(in srgb, ${STATUS_CONFIG[selected.status].color} 12%, transparent)`,
                color: STATUS_CONFIG[selected.status].color,
                borderRadius: 4,
              }}
            >
              {STATUS_CONFIG[selected.status].label}
            </span>
            {/* Flag for human review */}
            {selected.status !== "human_review" && (
              <button
                className="flex items-center gap-1 text-xs px-2 py-1 transition-colors hover:text-[var(--signal-red)]"
                style={{ color: "var(--text-dim)", border: "1px solid var(--border-dim)", borderRadius: 4 }}
                id="btn-escalate"
              >
                <AlertCircle size={11} />
                Escalate
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
          </AnimatePresence>
        </div>

        {/* Bot Draft or Manual Reply */}
        {botDraft ? (
          <SuggestedReplyPanel
            draft={botDraft}
            onApprove={handleApprove}
            onDiscard={() => setBotDraft(undefined)}
          />
        ) : (
          <ManualReplyBox onSend={handleManualSend} />
        )}
      </div>

      {/* ── Context Panel: Order Info ──────────────────────── */}
      <div
        className="flex-col border-l hidden xl:flex"
        style={{ width: 240, background: "var(--bg-surface)", borderColor: "var(--border-dim)" }}
      >
        <div
          className="px-4 py-3.5 border-b text-xs font-semibold"
          style={{ borderColor: "var(--border-dim)", color: "var(--text-secondary)" }}
        >
          ORDER CONTEXT
        </div>

        {selected.orderId ? (
          <div className="px-4 py-3 space-y-4">
            <div>
              <p className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>ORDER ID</p>
              <p className="text-xs font-mono-data" style={{ color: "var(--text-primary)" }}>{selected.orderId}</p>
            </div>
            <div>
              <p className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>STATUS</p>
              <span className="badge-pending text-[10px] px-2 py-0.5 rounded-sm">AWAITING SPEC</span>
            </div>
            <div>
              <p className="text-[10px] mb-1.5" style={{ color: "var(--text-dim)" }}>QUICK ACTIONS</p>
              <div className="space-y-1.5">
                <button
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors hover:text-[var(--text-primary)]"
                  style={{ border: "1px solid var(--border-dim)", borderRadius: 4, color: "var(--text-secondary)" }}
                  id="btn-view-order"
                >
                  <Package size={11} />
                  View Order
                  <ChevronRight size={10} className="ml-auto" />
                </button>
                <button
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors hover:text-[var(--text-primary)]"
                  style={{ border: "1px solid var(--border-dim)", borderRadius: 4, color: "var(--text-secondary)" }}
                  id="btn-collect-spec"
                >
                  <Zap size={11} />
                  Collect Spec
                  <ChevronRight size={10} className="ml-auto" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-6 text-center">
            <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>
              No order linked yet.<br />Bot will prompt buyer for order details.
            </p>
          </div>
        )}

        {/* AI Confidence */}
        <div className="mt-auto p-4 border-t" style={{ borderColor: "var(--border-dim)" }}>
          <p className="text-[10px] mb-2" style={{ color: "var(--text-dim)" }}>BOT CONFIDENCE</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border-dim)" }}>
              <div className="h-full rounded-full" style={{ width: "84%", background: "var(--signal-blue)" }} />
            </div>
            <span className="text-xs font-mono-data" style={{ color: "var(--signal-blue)" }}>84%</span>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "var(--text-dim)" }}>
            Intent: {INTENT_CONFIG[selected.intent].label}
          </p>
        </div>
      </div>
    </div>
  );
}
