import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BlueBubblesProvider } from "./bluebubbles";
import type { MessageProvider } from "./types";

export type { MessageProvider, ProviderMessage, SendInput, SendResult } from "./types";

// Resolve the live BlueBubbles base URL: prefer the self-healing value stored
// in app_settings (updated via the server-url-change webhook), fall back to the
// BB_URL env var.
export async function resolveBbUrl(): Promise<string> {
  const envUrl = process.env.BB_URL ?? "";
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("bb_url")
      .eq("id", true)
      .single();
    if (data?.bb_url) return data.bb_url as string;
  } catch {
    /* fall back to env */
  }
  return envUrl;
}

// Single swap point. Returns the configured provider with the live URL.
export async function getProvider(): Promise<MessageProvider> {
  const base = await resolveBbUrl();
  return new BlueBubblesProvider(base, process.env.BB_PASSWORD ?? "");
}
