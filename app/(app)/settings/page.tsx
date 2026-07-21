import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { saveSettings } from "../actions";
import { SecretCodeCard } from "@/components/SecretCodeCard";
import { TwoFactorSetup } from "@/components/TwoFactorSetup";
import { WallpaperPicker } from "@/components/WallpaperPicker";
import { THROTTLE_DEFAULTS } from "@/lib/throttle";
import type { AppSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

function Section({
  title,
  footnote,
  children,
}: {
  title: string;
  footnote?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 px-4 text-footnote font-medium uppercase tracking-[0.06em] text-label-secondary">
        {title}
      </h2>
      {children}
      {footnote ? (
        <p className="mt-2 px-4 text-caption text-label-secondary">{footnote}</p>
      ) : null}
    </section>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-black/[0.06] overflow-hidden rounded-card bg-surface ring-1 ring-black/[0.04] dark:divide-white/[0.08] dark:ring-white/[0.06]">
      {children}
    </div>
  );
}

function FieldRow({
  label,
  name,
  defaultValue,
  help,
  unit,
  placeholder,
  type = "number",
  wide,
}: {
  label: string;
  name: string;
  defaultValue: string | number;
  help?: string;
  unit?: string;
  placeholder?: string;
  type?: string;
  wide?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0">
        <label htmlFor={name} className="block text-body">
          {label}
        </label>
        {help ? (
          <span className="block text-caption text-label-secondary">{help}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          id={name}
          name={name}
          type={type}
          defaultValue={defaultValue}
          placeholder={placeholder}
          inputMode={type === "number" ? "numeric" : undefined}
          className={cnInput(wide)}
        />
        {unit ? (
          <span className="text-footnote text-label-secondary">{unit}</span>
        ) : null}
      </div>
    </div>
  );
}

function cnInput(wide?: boolean) {
  return [
    "rounded-control bg-fill px-2.5 py-2 text-right text-body tabular-nums outline-none",
    "placeholder:text-label-secondary focus:bg-fill-secondary",
    wide ? "w-44 text-left" : "w-24",
  ].join(" ");
}

function ToggleRow({
  label,
  name,
  defaultChecked,
  help,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  help?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0">
        <span className="block text-body">{label}</span>
        {help ? (
          <span className="block text-caption text-label-secondary">{help}</span>
        ) : null}
      </div>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="peer sr-only"
        />
        <span className="block h-[31px] w-[51px] rounded-full bg-[#e5e5ea] transition-colors duration-base ease-ios peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 dark:bg-[#39393d]" />
        <span className="absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-switch transition-transform duration-base ease-ios peer-checked:translate-x-[20px]" />
      </span>
    </label>
  );
}

function TextAreaRow({
  label,
  name,
  defaultValue,
  placeholder,
  help,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  help?: string;
}) {
  return (
    <div className="px-4 py-3">
      <label htmlFor={name} className="block text-body">
        {label}
      </label>
      {help ? (
        <span className="mt-0.5 block text-caption text-label-secondary">
          {help}
        </span>
      ) : null}
      <textarea
        id={name}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        rows={4}
        className="mt-2 w-full resize-y rounded-control bg-fill px-3 py-2 text-subhead outline-none transition-colors duration-fast ease-ios placeholder:text-label-secondary focus:bg-fill-secondary"
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

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://your-app.vercel.app";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <p className="text-footnote text-label-secondary">Configuration</p>
        <h1 className="text-h4 font-display">Settings</h1>
      </header>

      <form action={saveSettings} className="space-y-7">
        <Section
          title="Throttle"
          footnote="Slow, randomized spacing keeps a real personal number under informal limits. Recommended: 120s min delay + 60s jitter (≈2–3 min between sends). Raise the daily cap slowly over the first week."
        >
          <Group>
            <FieldRow
              label="Min delay"
              name="min_delay_seconds"
              unit="sec"
              help="Shortest pause before the next send. 120s recommended."
              defaultValue={s?.min_delay_seconds ?? THROTTLE_DEFAULTS.min_delay_seconds}
            />
            <FieldRow
              label="Jitter"
              name="jitter_seconds"
              unit="sec"
              help="Random extra delay added on top, so timing looks human. 60s recommended."
              defaultValue={s?.jitter_seconds ?? THROTTLE_DEFAULTS.jitter_seconds}
            />
            <FieldRow
              label="Daily cap"
              name="daily_cap"
              help="Maximum messages sent per day."
              defaultValue={s?.daily_cap ?? THROTTLE_DEFAULTS.daily_cap}
            />
            <FieldRow
              label="Batch size"
              name="batch_size"
              unit="/ tick"
              help="Messages released each time the pump runs."
              defaultValue={s?.batch_size ?? THROTTLE_DEFAULTS.batch_size}
            />
          </Group>
        </Section>

        <Section
          title="Send window"
          footnote="Outside these hours sending pauses automatically. Leave blank to send anytime."
        >
          <Group>
            <FieldRow
              label="Start hour"
              name="send_window_start"
              help="Local hour, 0–23."
              placeholder="anytime"
              defaultValue={s?.send_window_start ?? ""}
            />
            <FieldRow
              label="End hour"
              name="send_window_end"
              help="Local hour, 0–23."
              placeholder="anytime"
              defaultValue={s?.send_window_end ?? ""}
            />
            <FieldRow
              label="Timezone"
              name="timezone"
              type="text"
              wide
              help="IANA name, e.g. America/New_York."
              defaultValue={s?.timezone ?? THROTTLE_DEFAULTS.timezone}
            />
          </Group>
        </Section>

        <Section
          title="Bridge & status"
          footnote="Only override the BlueBubbles URL if you’re not using the env value or self-healing URL."
        >
          <Group>
            <FieldRow
              label="BlueBubbles URL"
              name="bb_url"
              type="text"
              wide
              placeholder="use env value"
              help="Optional override."
              defaultValue={s?.bb_url ?? ""}
            />
            <ToggleRow
              label="Pause all sending"
              name="paused"
              defaultChecked={s?.paused ?? false}
              help="Stops every outgoing message until you turn it back off."
            />
          </Group>
        </Section>

        <Section
          title="AI opener"
          footnote="The AI only writes the FIRST message to each lead (the “Auto” option in Compose) — it never replies to conversations; those are all yours. These rules guide what it writes. Leave blank for sensible defaults."
        >
          <Group>
            <TextAreaRow
              label="Knowledge & rules"
              name="ai_knowledge"
              help="What you offer + what it must never say in an opener."
              placeholder="e.g. We help businesses get working capital fast. Never quote rates, fees, or approval amounts. Never guarantee funding."
              defaultValue={s?.ai_knowledge ?? ""}
            />
          </Group>
        </Section>

        <button className="press w-full rounded-control bg-accent px-6 py-3 text-body font-semibold text-white sm:w-auto">
          Save settings
        </button>
      </form>

      <Section
        title="Appearance"
        footnote="Pick a wallpaper for the background. The interface stays frosted glass over it; if anything is hard to read, bump the dimming slider."
      >
        <WallpaperPicker />
      </Section>

      <Section
        title="Security"
        footnote="Add a second factor for sign-in. Changing your password signs you out so you re-enter it on the next login."
      >
        <div className="space-y-3">
          <TwoFactorSetup />
          <Link
            href="/reset"
            className="press inline-flex items-center gap-2 rounded-control border border-hairline px-4 py-2 text-subhead font-medium transition-colors duration-fast ease-ios hover:bg-fill-tertiary"
          >
            Change password
          </Link>
        </div>
      </Section>

      <Section
        title="Wire up BlueBubbles & the pump"
        footnote={
          s ? (
            <>
              Sent today: {s.sends_today}/{s.daily_cap} · Next slot:{" "}
              {new Date(s.next_send_allowed_at).toLocaleTimeString()} ·{" "}
              {s.paused ? "Paused" : "Active"}
            </>
          ) : (
            <span className="text-danger">
              No app_settings row found — run the migration (0001_init.sql).
            </span>
          )
        }
      >
        <div className="space-y-3">
          <SecretCodeCard
            kind="webhook"
            appUrl={appUrl}
            label="Webhook URL"
            desc="BlueBubbles → API & Webhooks → Add Webhook → paste this, and enable New Messages (plus New Server URL if available). Tap the eye to reveal or the copy button to grab it."
          />
          <SecretCodeCard
            kind="pump"
            appUrl={appUrl}
            label="Pump URL (external pinger)"
            desc="Hit this every ~minute from the always-on Mac (launchd) or cron-job.org to drip the queue. Vercel Cron also calls /api/cron/pump with CRON_SECRET."
          />
        </div>
      </Section>
    </div>
  );
}
