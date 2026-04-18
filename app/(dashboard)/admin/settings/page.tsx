import { createServiceClient } from "@/lib/supabase/server";
import SettingsPageClient from "./SettingsClient";

/**
 * /admin/settings — Server Component
 *
 * Fetches live TikTok connection state from shop_tokens at request time
 * and passes it down to the client component as a prop.
 * Tokens are never exposed to the browser bundle.
 */
export default async function SettingsPage() {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: token } = await (supabase as any)
    .from("shop_tokens")
    .select("shop_id, seller_name, seller_base_region, access_expires_at, refresh_expires_at, authorized_at")
    .order("authorized_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const tiktokConnection: TikTokConnection | null = token
    ? {
        shopId:        token.shop_id,
        sellerName:    token.seller_name    ?? null,
        region:        token.seller_base_region ?? null,
        accessExpiry:  token.access_expires_at,
        refreshExpiry: token.refresh_expires_at,
        authorizedAt:  token.authorized_at,
      }
    : null;

  return <SettingsPageClient tiktokConnection={tiktokConnection} />;
}

export interface TikTokConnection {
  shopId:        string;
  sellerName:    string | null;
  region:        string | null;
  accessExpiry:  string;
  refreshExpiry: string;
  authorizedAt:  string;
}
