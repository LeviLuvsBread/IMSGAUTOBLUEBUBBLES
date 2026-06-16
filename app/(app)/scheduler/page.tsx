import { createClient } from "@/lib/supabase/server";
import { ScheduleForm } from "@/components/ScheduleForm";
import { deleteScheduledSend } from "../actions";
import type { Contact, ScheduledSend, Template } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SchedulerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: contacts }, { data: templates }, { data: scheduled }] =
    await Promise.all([
      supabase.from("contacts").select("*").eq("opted_out", false).order("name"),
      supabase.from("templates").select("*").order("name"),
      supabase
        .from("scheduled_sends")
        .select("*")
        .order("run_at", { ascending: true }),
    ]);

  const rows = (scheduled ?? []) as ScheduledSend[];

  return (
    <div className="space-y-6">
      <div className="max-w-xl">
        <h1 className="mb-3 text-lg font-semibold">Schedule a send</h1>
        {sp.error ? (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {sp.error}
          </p>
        ) : null}
        <ScheduleForm
          contacts={(contacts ?? []) as Contact[]}
          templates={(templates ?? []) as Template[]}
        />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-500">
          Upcoming &amp; recurring
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-neutral-400">Nothing scheduled.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {rows.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {new Date(s.run_at).toLocaleString()}{" "}
                    {s.recurrence ? `· ${s.recurrence}` : ""}{" "}
                    <span className="text-xs text-neutral-400">({s.status})</span>
                  </div>
                  <div className="line-clamp-1 text-neutral-500">
                    {s.segment ? "Segment" : "Single contact"} ·{" "}
                    {s.body || "(template)"}
                  </div>
                </div>
                <form action={deleteScheduledSend}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-red-600 dark:border-neutral-700">
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
