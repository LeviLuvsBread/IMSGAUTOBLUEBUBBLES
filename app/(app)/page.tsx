import { createClient } from "@/lib/supabase/server";
import { requeueMessage } from "./actions";
import { Dashboard } from "@/components/dashboard/Dashboard";
import type { AppSettings, Message } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: settingsRow }, queued, failed, recentInbound, recentFailed] =
    await Promise.all([
      supabase.from("app_settings").select("*").eq("id", true).maybeSingle(),
      supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("direction", "out")
        .eq("status", "queued"),
      supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("status", "failed"),
      supabase
        .from("messages")
        .select("*")
        .eq("direction", "in")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("messages")
        .select("*")
        .eq("status", "failed")
        .order("updated_at", { ascending: false })
        .limit(5),
    ]);

  const settings = settingsRow as AppSettings | null;
  const failedRows = (recentFailed.data ?? []) as Message[];
  const inboundRows = (recentInbound.data ?? []) as Message[];

  const minDelay = settings?.min_delay_seconds ?? 0;

  return (
    <Dashboard
      sentToday={settings?.sends_today ?? 0}
      dailyCap={settings?.daily_cap ?? 0}
      queued={queued.count ?? 0}
      failed={failed.count ?? 0}
      paused={settings?.paused ?? false}
      minDelay={minDelay}
      maxDelay={minDelay + (settings?.jitter_seconds ?? 0)}
      replies={inboundRows.map((m) => ({
        id: m.id,
        chatGuid: m.chat_guid,
        body: m.body ?? "",
      }))}
      failedRows={failedRows.map((m) => ({
        id: m.id,
        chatGuid: m.chat_guid,
        body: m.body ?? "",
        error: m.error ?? null,
      }))}
      requeue={requeueMessage}
    />
  );
}
