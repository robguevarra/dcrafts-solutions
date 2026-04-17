import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign In — Dcrafts Ops",
  description: "Sign in to the Dcrafts Operations Dashboard.",
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

/**
 * Login page — displayed to unauthenticated users.
 * Middleware handles redirect logic (both directions).
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--bg-void)" }}
    >
      <div
        className="w-full max-w-sm space-y-6"
        style={{ padding: "2rem" }}
      >
        {/* Brand mark */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 text-sm font-bold font-mono-data"
            style={{
              background: "var(--signal-amber)",
              color: "var(--bg-void)",
            }}
          >
            DC
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Dcrafts Ops
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Production Dashboard
            </p>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--border-dim)" }} />

        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Sign In
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            Authorized personnel only
          </p>
        </div>

        {/* Form */}
        <LoginForm next={next} />
      </div>
    </div>
  );
}
