import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ComposeForm } from "@/components/ComposeForm";
import type { Contact, Template } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: contacts }, { data: templates }, { data: settings }] =
    await Promise.all([
      supabase.from("contacts").select("*").eq("opted_out", false).order("name"),
      supabase.from("templates").select("*").order("name"),
      supabase
        .from("app_settings")
        .select("min_delay_seconds,jitter_seconds,daily_cap,sends_today")
        .eq("id", true)
        .maybeSingle(),
    ]);
  const list = (contacts ?? []) as Contact[];
  const s = settings as {
    min_delay_seconds: number;
    jitter_seconds: number;
    daily_cap: number;
    sends_today: number;
  } | null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <p className="text-footnote text-label-secondary tabular-nums">
          {list.length} contacts available
        </p>
        <h1 className="text-h4 font-display">Compose</h1>
      </div>

      {sp.error ? (
        <div className="rounded-control bg-danger/10 px-3 py-2 text-footnote text-danger">
          {sp.error}
        </div>
      ) : null}

      {list.length === 0 ? (
        <div className="rounded-card bg-surface p-8 text-center text-subhead text-label-secondary shadow-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
          Add a contact first on the{" "}
          <Link href="/contacts" className="text-accent hover:underline">
            Contacts
          </Link>{" "}
          page.
        </div>
      ) : (
        <ComposeForm
          contacts={list}
          templates={(templates ?? []) as Template[]}
          minDelay={s?.min_delay_seconds ?? 0}
          jitter={s?.jitter_seconds ?? 0}
          dailyCap={s?.daily_cap ?? 100}
          sentToday={s?.sends_today ?? 0}
        />
      )}
    </div>
  );
}
