import { createClient } from "@/lib/supabase/server";
import { saveSettings } from "../actions";
import { THROTTLE_DEFAULTS } from "@/lib/throttle";
import type { AppSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

function field(
  label: string,
  name: string,
  value: string | number | null,
  type = "number",
) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={value ?? ""}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
      />
    </div>
  );
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  const s = (data as AppSettings | null) ?? null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://your-app.vercel.app";
  const webhookSecret = process.env.WEBHOOK_SECRET ?? "YOUR_WEBHOOK_SECRET";
  const pumpSecret = process.env.PUMP_SECRET ?? "YOUR_PUMP_SECRET";
  const webhookUrl = `${appUrl}/api/webhook?secret=${webhookSecret}`;
  const pumpUrl = `${appUrl}/api/cron/pump?key=${pumpSecret}`;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="mb-3 text-lg font-semibold">Throttle &amp; sending</h1>
        <form
          action={saveSettings}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {field(
            "Min delay (seconds)",
            "min_delay_seconds",
            s?.min_delay_seconds ?? THROTTLE_DEFAULTS.min_delay_seconds,
          )}
          {field(
            "Jitter (seconds)",
            "jitter_seconds",
            s?.jitter_seconds ?? THROTTLE_DEFAULTS.jitter_seconds,
          )}
          {field("Daily cap", "daily_cap", s?.daily_cap ?? THROTTLE_DEFAULTS.daily_cap)}
          {field("Batch size / tick", "batch_size", s?.batch_size ?? THROTTLE_DEFAULTS.batch_size)}
          {field(
            "Send window start (local hour, blank = anytime)",
            "send_window_start",
            s?.send_window_start ?? "",
          )}
          {field(
            "Send window end (local hour)",
            "send_window_end",
            s?.send_window_end ?? "",
          )}
          {field("Timezone (IANA)", "timezone", s?.timezone ?? THROTTLE_DEFAULTS.timezone, "text")}
          {field("BlueBubbles URL override (optional)", "bb_url", s?.bb_url ?? "", "text")}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="paused" defaultChecked={s?.paused ?? false} />
            Pause all sending
          </label>
          <div className="sm:col-span-2">
            <button className="rounded-lg bg-imsg-blue px-4 py-2 text-sm font-medium text-white">
              Save settings
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-500">
          Wire up BlueBubbles &amp; the pump
        </h2>
        <div className="rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <p className="mb-1 font-medium">Webhook URL</p>
          <p className="mb-2 text-xs text-neutral-500">
            BlueBubbles → API &amp; Webhooks → Add Webhook → paste this and select
            new-message + updated-message (and server-url-change if available).
          </p>
          <code className="block overflow-x-auto rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-800">
            {webhookUrl}
          </code>
        </div>
        <div className="rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <p className="mb-1 font-medium">Pump URL (external pinger)</p>
          <p className="mb-2 text-xs text-neutral-500">
            Hit this every ~minute from the always-on Mac (launchd) or
            cron-job.org to drip the queue. Vercel Cron also calls{" "}
            <code>/api/cron/pump</code> using CRON_SECRET.
          </p>
          <code className="block overflow-x-auto rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-800">
            curl -fsS &quot;{pumpUrl}&quot;
          </code>
        </div>
        {s ? (
          <p className="text-xs text-neutral-400">
            Sent today: {s.sends_today}/{s.daily_cap} · Next slot:{" "}
            {new Date(s.next_send_allowed_at).toLocaleTimeString()} ·{" "}
            {s.paused ? "PAUSED" : "active"}
          </p>
        ) : (
          <p className="text-xs text-red-500">
            No app_settings row found — run the migration (0001_init.sql).
          </p>
        )}
      </div>
    </div>
  );
}
