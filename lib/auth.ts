import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Database } from "@/types/database";

/**
 * Returns the current Supabase user or redirects to /login.
 * Use in server components that require authentication.
 */
export async function requireUser() {
  const cookieStore = await cookies();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Read-only cookie store in Server Components — safe to ignore.
          }
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { user, supabase };
}

/**
 * Returns the role stored in app_metadata.
 * Falls back to 'designer' if no role is set.
 */
export function getUserRole(
  user: Awaited<ReturnType<typeof requireUser>>["user"]
): "admin" | "designer" | "qc_uploader" {
  const role = user.app_metadata?.role as string | undefined;
  if (role === "admin" || role === "qc_uploader") return role;
  return "designer";
}
