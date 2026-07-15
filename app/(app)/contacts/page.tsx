import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "@/components/ContactForm";
import { ContactImport } from "@/components/ContactImport";
import { deleteContact } from "../actions";
import { lastContactedMap } from "@/lib/last-contacted";
import { timeAgo, daysSince } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";

const RECENT_DAYS = 7;

function initials(s: string) {
  const m = (s || "").replace(/[^a-zA-Z0-9]/g, "");
  return (m.slice(0, 2) || "··").toUpperCase();
}

export default async function ContactsPage() {
  const supabase = await createClient();
  const [{ data }, lastContacted] = await Promise.all([
    supabase.from("contacts").select("*").order("name", { ascending: true }),
    lastContactedMap(supabase),
  ]);
  const contacts = (data ?? []) as Contact[];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-footnote text-label-secondary tabular-nums">
            {contacts.length} total
          </p>
          <h1 className="text-h4 font-display">Contacts</h1>
        </div>
        <ContactImport />
      </div>

      <details className="overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
        <summary className="cursor-pointer list-none px-4 py-3 text-subhead font-semibold">
          Add a contact manually
        </summary>
        <div className="border-t border-separator p-4">
          <ContactForm />
        </div>
      </details>

      {contacts.length === 0 ? (
        <div className="rounded-card bg-surface p-8 text-center text-subhead text-label-secondary shadow-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
          No contacts yet — import a CSV or add one above.
        </div>
      ) : (
        <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-black/[0.05] dark:divide-white/[0.08] dark:ring-white/[0.08]">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-caption font-semibold text-accent">
                {initials(c.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-subhead font-medium">{c.name}</span>
                  {c.opted_out ? (
                    <span className="shrink-0 rounded-full bg-danger/10 px-1.5 py-0.5 text-caption2 font-medium text-danger">
                      opted out
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-caption text-label-secondary">
                  {c.phone}
                  {c.company ? ` · ${c.company}` : ""}
                  {c.tags.length ? ` · ${c.tags.join(", ")}` : ""}
                </div>
                {c.notes ? (
                  <div className="mt-0.5 truncate text-caption2 text-label-secondary">
                    {c.notes}
                  </div>
                ) : null}
                {(() => {
                  const last = lastContacted[c.id];
                  const d = daysSince(last);
                  const recent = d !== null && d < RECENT_DAYS;
                  return (
                    <div
                      className={cn(
                        "mt-0.5 text-caption2",
                        recent ? "font-medium text-warning" : "text-label-tertiary",
                      )}
                    >
                      {last ? `Last contacted ${timeAgo(last)}` : "Not yet contacted"}
                    </div>
                  );
                })()}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Link
                  href={`/inbox/${encodeURIComponent(c.chat_guid ?? "")}`}
                  className="press rounded-control border border-hairline px-2.5 py-1 text-footnote transition-colors duration-fast ease-ios hover:bg-fill-tertiary"
                >
                  Thread
                </Link>
                <Link
                  href={`/contacts/${c.id}`}
                  className="press rounded-control border border-hairline px-2.5 py-1 text-footnote transition-colors duration-fast ease-ios hover:bg-fill-tertiary"
                >
                  Edit
                </Link>
                <form action={deleteContact}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="press rounded-control border border-hairline px-2.5 py-1 text-footnote text-danger transition-colors duration-fast ease-ios hover:bg-danger/10">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
