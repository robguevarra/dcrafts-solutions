import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import DashboardSidebar from "@/components/layout/DashboardSidebar";

/**
 * Admin dashboard shell layout.
 * requireUser() redirects to /login if no valid session is found.
 * Fixed sidebar + fluid main content area.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Throws redirect to /login if unauthenticated — middleware is the first
  // line of defence, this is a belt-and-suspenders server-side check.
  await requireUser();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg-void)" }}>
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
