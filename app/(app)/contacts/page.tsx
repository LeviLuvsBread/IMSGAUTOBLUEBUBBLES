import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "@/components/ContactForm";
import { deleteContact } from "../actions";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("*")
    .order("name", { ascending: true });
  const contacts = (data ?? []) as Contact[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-3 text-lg font-semibold">Add contact</h1>
        <ContactForm />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-500">
          {contacts.length} contacts
        </h2>
        {contacts.length === 0 ? (
          <p className="text-sm text-neutral-400">No contacts yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {c.name}{" "}
                    {c.opted_out ? (
                      <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                        opted out
                      </span>
                    ) : null}
                  </div>
                  <div className="text-neutral-500">
                    {c.phone}
                    {c.company ? ` · ${c.company}` : ""}
                    {c.tags.length ? ` · ${c.tags.join(", ")}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/inbox/${encodeURIComponent(c.chat_guid ?? "")}`}
                    className="rounded-lg border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
                  >
                    Thread
                  </Link>
                  <Link
                    href={`/contacts/${c.id}`}
                    className="rounded-lg border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
                  >
                    Edit
                  </Link>
                  <form action={deleteContact}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-red-600 dark:border-neutral-700">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
