import { createClient } from "@/lib/supabase/server";
import { requeueMessage } from "./actions";
import { Dashboard } from "@/components/dashboard/Dashboard";
import type { AppSettings, Message } from "@/lib/types";

export const dynamic = "force-dynamic";

type HandoverRow = {
  chat_guid: string;
  handover_summary: string | null;
  contact: { name: string | null } | { name: string | null }[] | null;
};

function contactName(c: HandoverRow["contact"]): string {
  if (!c) return "";
  const obj = Array.isArray(c) ? c[0] : c;
  return obj?.name ?? "";
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { data: settingsRow },
    queued,
    failed,
    recentInbound,
    recentFailed,
    handoverRes,
  ] = await Promise.all([
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
    supabase
      .from("conversation_state")
      .select("chat_guid, handover_summary, contact:contacts(name)")
      .eq("lifecycle_stage", "ready_for_handover")
      .order("ready_at", { ascending: false })
      .limit(8),
  ]);

  const settings = settingsRow as AppSettings | null;
  const failedRows = (recentFailed.data ?? []) as Message[];
  const inboundRows = (recentInbound.data ?? []) as Message[];
  const handoverRows = (handoverRes.data ?? []) as HandoverRow[];

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
      handovers={handoverRows.map((h) => ({
        chatGuid: h.chat_guid,
        name: contactName(h.contact),
        summary: h.handover_summary,
      }))}
      requeue={requeueMessage}
    />
  );
}
