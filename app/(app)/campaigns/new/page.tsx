import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CampaignBuilder } from "@/components/CampaignBuilder";
import { THROTTLE_DEFAULTS } from "@/lib/throttle";
import type { AppSettings, Contact, Template } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: contacts }, { data: templates }, { data: settingsRow }] =
    await Promise.all([
      supabase.from("contacts").select("*").order("name"),
      supabase.from("templates").select("*").order("name"),
      supabase.from("app_settings").select("*").eq("id", true).maybeSingle(),
    ]);

  const settings = (settingsRow as AppSettings | null) ?? {
    min_delay_seconds: THROTTLE_DEFAULTS.min_delay_seconds,
    jitter_seconds: THROTTLE_DEFAULTS.jitter_seconds,
    daily_cap: THROTTLE_DEFAULTS.daily_cap,
  };

  return (
    <div className="max-w-xl space-y-4">
      <Link href="/campaigns" className="text-sm text-imsg-blue hover:underline">
        ← Campaigns
      </Link>
      <h1 className="text-lg font-semibold">New campaign</h1>
      {sp.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {sp.error}
        </p>
      ) : null}
      <CampaignBuilder
        contacts={(contacts ?? []) as Contact[]}
        templates={(templates ?? []) as Template[]}
        settings={{
          min_delay_seconds: settings.min_delay_seconds,
          jitter_seconds: settings.jitter_seconds,
          daily_cap: settings.daily_cap,
        }}
      />
    </div>
  );
}
