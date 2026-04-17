"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  MonitorPlay,
  MessageSquareText,
  BarChart3,
  Settings,
  Radio,
  ClipboardList,
} from "lucide-react";
import SignOutButton from "@/components/auth/SignOutButton";

const NAV_ITEMS = [
  { href: "/admin/orders", label: "Orders", icon: LayoutGrid },
  { href: "/admin/kds", label: "KDS", icon: MonitorPlay },
  { href: "/admin/shopee-import", label: "Shopee Import", icon: ClipboardList },
  { href: "/admin/messaging", label: "Messaging", icon: MessageSquareText },
  { href: "/admin/stats", label: "Shadow Stats", icon: BarChart3 },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

/**
 * Fixed sidebar navigation for the Dcrafts ops dashboard.
 * 240px wide, dark surface, sharp geometry.
 */
export default function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{ width: 240, minHeight: "100vh", background: "var(--bg-surface)" }}
      className="flex flex-col border-r"
      role="navigation"
      aria-label="Dashboard navigation"
    >
      {/* Logo / Brand */}
      <div
        className="flex items-center gap-3 px-5 py-4 border-b"
        style={{ borderColor: "var(--border-dim)" }}
      >
        <div
          className="flex items-center justify-center w-8 h-8 text-xs font-bold font-mono-data"
          style={{
            background: "var(--signal-amber)",
            color: "var(--bg-void)",
            minWidth: 32,
          }}
        >
          DC
        </div>
        <div>
          <p className="text-sm font-semibold leading-none" style={{ color: "var(--text-primary)" }}>
            Dcrafts Ops
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Production Dashboard
          </p>
        </div>
      </div>

      {/* Shadow Mode Banner */}
      <ShadowModeBanner />

      {/* Nav Links */}
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2 text-sm transition-colors duration-150 group",
                isActive
                  ? "text-[var(--signal-amber)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-sm"
                  style={{ background: "color-mix(in srgb, var(--signal-amber) 10%, transparent)" }}
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <Icon size={16} className="relative z-10 flex-shrink-0" />
              <span className="relative z-10">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer: sign out + version */}
      <div
        className="border-t"
        style={{ borderColor: "var(--border-dim)" }}
      >
        <div className="px-2 py-1">
          <SignOutButton />
        </div>
        <div
          className="px-5 py-2 text-xs font-mono-data"
          style={{ color: "var(--text-dim)" }}
        >
          v0.1.0-shadow
        </div>
      </div>
    </aside>
  );
}

function ShadowModeBanner() {
  return (
    <div
      className="mx-2 my-2 px-3 py-2 flex items-center gap-2 text-xs"
      style={{
        background: "color-mix(in srgb, var(--signal-gray) 10%, transparent)",
        border: "1px solid color-mix(in srgb, var(--signal-gray) 25%, transparent)",
      }}
    >
      <Radio size={12} className="animate-live flex-shrink-0" style={{ color: "var(--signal-gray)" }} />
      <span style={{ color: "var(--signal-gray)" }}>SHADOW MODE ACTIVE</span>
    </div>
  );
}
