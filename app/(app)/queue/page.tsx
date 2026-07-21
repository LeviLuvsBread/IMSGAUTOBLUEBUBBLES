import { createClient } from "@/lib/supabase/server";
import { clearQueue, reorderQueue, requeueMessage } from "../actions";
import { QueueManager } from "@/components/QueueManager";
import type { AppSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

type QueueRow = {
  id: string;
  body: string | null;
  chat_guid: string;
  source: string;
  available_at: string;
  contact: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null;
};

// "iMessage;-;+13055551234" -> "+13055551234"
function phoneFromGuid(guid: string): string {
  return guid.split(";").pop() || guid;
}

export default async function QueuePage() {
  const supabase = await createClient();
  const [{ data: settingsRow }, { data }, { data: failedData }] = await Promise.all([
    supabase.from("app_settings").select("paused, min_delay_seconds, jitter_seconds").eq("id", true).maybeSingle(),
    supabase
      .from("messages")
      .select("id, body, chat_guid, source, available_at, contact:contacts(name, phone)")
      .eq("direction", "out")
      .eq("status", "queued")
      .order("available_at", { ascending: true }),
    supabase
      .from("messages")
      .select("id, body, chat_guid, error, contact:contacts(name, phone)")
      .eq("direction", "out")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  const settings = settingsRow as Pick<
    AppSettings,
    "paused" | "min_delay_seconds" | "jitter_seconds"
  > | null;

  const rows = (data ?? []) as QueueRow[];
  const items = rows.map((r) => {
    const c = Array.isArray(r.contact) ? r.contact[0] : r.contact;
    return {
      id: r.id,
      name: (c?.name ?? "").trim(),
      phone: c?.phone || phoneFromGuid(r.chat_guid),
      body: r.body ?? "",
      source: r.source,
    };
  });

  const failedRows = (failedData ?? []) as Array<
    Omit<QueueRow, "source" | "available_at"> & { error: string | null }
  >;
  const failed = failedRows.map((r) => {
    const c = Array.isArray(r.contact) ? r.contact[0] : r.contact;
    return {
      id: r.id,
      name: (c?.name ?? "").trim(),
      phone: c?.phone || phoneFromGuid(r.chat_guid),
      body: r.body ?? "",
      error: r.error ?? null,
    };
  });

  return (
    <QueueManager
      initial={items}
      failed={failed}
      paused={settings?.paused ?? false}
      minDelay={settings?.min_delay_seconds ?? 0}
      maxDelay={(settings?.min_delay_seconds ?? 0) + (settings?.jitter_seconds ?? 0)}
      clearQueue={clearQueue}
      reorderQueue={reorderQueue}
      requeue={requeueMessage}
    />
  );
}
