"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { deleteContact } from "@/app/(app)/actions";
import { timeAgo, daysSince } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Contact } from "@/lib/types";

const RECENT_DAYS = 7;

function initials(s: string) {
  const m = (s || "").replace(/[^a-zA-Z0-9]/g, "");
  return (m.slice(0, 2) || "··").toUpperCase();
}

export function ContactsList({
  contacts,
  lastContacted,
}: {
  contacts: Contact[];
  lastContacted: Record<string, string>;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      const hay = [
        c.name,
        c.phone,
        c.company,
        c.notes,
        ...(c.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [contacts, query]);

  if (contacts.length === 0) {
    return (
      <div className="rounded-card bg-surface p-8 text-center text-subhead text-label-secondary shadow-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
        No contacts yet — import a CSV or add one above.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-label-secondary" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, company, tag, note…"
          className="w-full rounded-control bg-surface px-3 py-2.5 pl-9 pr-9 text-subhead shadow-card outline-none ring-1 ring-black/[0.05] transition-shadow duration-fast ease-ios placeholder:text-label-secondary focus:ring-2 focus:ring-accent/40 dark:ring-white/[0.08]"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-label-secondary transition-colors hover:bg-fill-tertiary hover:text-label"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {query ? (
        <p className="px-1 text-footnote text-label-secondary tabular-nums">
          {filtered.length} of {contacts.length} match “{query.trim()}”
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-card bg-surface p-8 text-center text-subhead text-label-secondary shadow-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
          No contacts match “{query.trim()}”.
        </div>
      ) : (
        <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-black/[0.05] dark:divide-white/[0.08] dark:ring-white/[0.08]">
          {filtered.map((c) => {
            const last = lastContacted[c.id];
            const d = daysSince(last);
            const recent = d !== null && d < RECENT_DAYS;
            return (
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
                  <div
                    className={cn(
                      "mt-0.5 text-caption2",
                      recent ? "font-medium text-warning" : "text-label-tertiary",
                    )}
                  >
                    {last ? `Last contacted ${timeAgo(last)}` : "Not yet contacted"}
                  </div>
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
            );
          })}
        </ul>
      )}
    </div>
  );
}
