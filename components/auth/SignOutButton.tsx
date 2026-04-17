"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/(auth)/login/actions";

/**
 * Triggers server-side sign-out and redirects to /login.
 * Must be a Client Component so the form can be embedded in
 * the Server Component sidebar without event handler issues.
 */
export default function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-mono-data uppercase tracking-wide transition-colors"
        style={{ color: "var(--text-dim)" }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.color =
            "var(--signal-red)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.color =
            "var(--text-dim)")
        }
      >
        <LogOut size={13} />
        Sign Out
      </button>
    </form>
  );
}
