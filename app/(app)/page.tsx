import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requeueMessage } from "./actions";
import type { AppSettings, Message } from "@/lib/types";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-neutral-500">{label}</div>
      {hint ? <div className="mt-1 text-xs text-neutral-400">{hint}</div> : null}
    </div>
  );
}

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Sent today"
          value={`${settings?.sends_today ?? 0} / ${settings?.daily_cap ?? "—"}`}
          hint="daily cap"
        />
        <Stat label="Queued" value={queued.count ?? 0} hint="waiting to send" />
        <Stat label="Failed" value={failed.count ?? 0} hint="needs attention" />
        <Stat
          label="Spacing"
          value={
            settings
              ? `${settings.min_delay_seconds}–${settings.min_delay_seconds + settings.jitter_seconds}s`
              : "—"
          }
          hint={settings?.paused ? "PAUSED" : "min–max delay"}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/compose"
          className="rounded-lg bg-imsg-blue px-4 py-2 text-sm font-medium text-white"
        >
          New message
        </Link>
        <Link
          href="/campaigns/new"
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700"
        >
          New campaign
        </Link>
        <Link
          href="/inbox"
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700"
        >
          Open inbox
        </Link>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-500">
          Recent replies
        </h2>
        {inboundRows.length === 0 ? (
          <p className="text-sm text-neutral-400">No replies yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {inboundRows.map((m) => (
              <li key={m.id} className="p-3 text-sm">
                <Link
                  href={`/inbox/${encodeURIComponent(m.chat_guid)}`}
                  className="line-clamp-1 hover:underline"
                >
                  <span className="text-neutral-400">{m.chat_guid}</span> — {m.body}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {failedRows.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-red-600">
            Failed sends
          </h2>
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {failedRows.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 p-3 text-sm"
              >
                <span className="line-clamp-1">
                  <span className="text-neutral-400">{m.chat_guid}</span> — {m.body}
                  {m.error ? (
                    <span className="text-red-500"> ({m.error})</span>
                  ) : null}
                </span>
                <form action={requeueMessage}>
                  <input type="hidden" name="id" value={m.id} />
                  <button className="whitespace-nowrap rounded-lg border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">
                    Requeue
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
