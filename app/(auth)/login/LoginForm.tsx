"use client";

import { useActionState, useEffect, useRef } from "react";
import { signInAction } from "./actions";

/** Wraps signInAction to match useActionState's (prevState, formData) signature */
async function loginAction(
  _prev: string | null,
  formData: FormData
): Promise<string | null> {
  const result = await signInAction(formData);
  // signInAction either redirects (never returns) or returns an error string.
  return result ?? null;
}

interface LoginFormProps {
  next?: string;
}

/**
 * Client-side login form with pending state and error display.
 */
export default function LoginForm({ next }: LoginFormProps) {
  const [error, formAction, isPending] = useActionState(loginAction, null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      {error && (
        <div
          className="px-3 py-2 text-xs font-mono-data"
          style={{
            background: "color-mix(in srgb, var(--signal-red) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--signal-red) 30%, transparent)",
            color: "var(--signal-red)",
          }}
        >
          {error}
        </div>
      )}

      <div className="space-y-1">
        <label
          htmlFor="email"
          className="block text-xs font-mono-data uppercase tracking-wide"
          style={{ color: "var(--text-secondary)" }}
        >
          Email
        </label>
        <input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full px-3 py-2 text-sm bg-transparent border outline-none transition-colors font-mono-data"
          style={{
            borderColor: "var(--border-dim)",
            color: "var(--text-primary)",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--signal-amber)")}
          onBlur={(e) =>  (e.target.style.borderColor = "var(--border-dim)")}
          disabled={isPending}
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="password"
          className="block text-xs font-mono-data uppercase tracking-wide"
          style={{ color: "var(--text-secondary)" }}
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full px-3 py-2 text-sm bg-transparent border outline-none transition-colors font-mono-data"
          style={{
            borderColor: "var(--border-dim)",
            color: "var(--text-primary)",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--signal-amber)")}
          onBlur={(e) =>  (e.target.style.borderColor = "var(--border-dim)")}
          disabled={isPending}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-2 text-sm font-mono-data uppercase tracking-wider transition-opacity disabled:opacity-50"
        style={{
          background: "var(--signal-amber)",
          color: "var(--bg-void)",
        }}
      >
        {isPending ? "Authenticating..." : "Sign In →"}
      </button>
    </form>
  );
}
