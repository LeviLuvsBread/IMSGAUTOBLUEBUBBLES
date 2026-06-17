import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { addressFromChatGuid } from "@/lib/chat";
import { InboxRealtime } from "@/components/InboxRealtime";
import type { Message } from "@/lib/types";

export const dynamic = "force-dynamic";

type Row = Message & {
  contacts?: { name: string | null; company: string | null } | null;
};

function initials(s: string) {
  const m = (s || "").replace(/[^a-zA-Z0-9]/g, "");
  return (m.slice(0, 2) || "··").toUpperCase();
}

export default async function InboxPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("*, contacts(name, company)")
    .order("created_at", { ascending: false })
    .limit(300);

  const rows = (data ?? []) as Row[];
  const byChat = new Map<string, Row>();
  for (const m of rows) if (!byChat.has(m.chat_guid)) byChat.set(m.chat_guid, m);
  const conversations = [...byChat.values()];

  return (
    <div className="space-y-4">
      {/* Keeps this list live as replies + receipts arrive. */}
      <InboxRealtime />
      <h1 className="text-h4 font-display">Inbox</h1>

      {conversations.length === 0 ? (
        <div className="rounded-card bg-surface p-8 text-center text-subhead text-label-secondary shadow-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
          No conversations yet. Send one from{" "}
          <Link href="/compose" className="text-accent hover:underline">
            Compose
          </Link>
          .
        </div>
      ) : (
        <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-black/[0.05] dark:divide-white/[0.08] dark:ring-white/[0.08]">
          {conversations.map((m) => {
            const title = m.contacts?.name || addressFromChatGuid(m.chat_guid);
            return (
              <li key={m.chat_guid}>
                <Link
                  href={`/inbox/${encodeURIComponent(m.chat_guid)}`}
                  className="flex items-center gap-3 px-3 py-3 transition-colors duration-fast ease-ios hover:bg-fill-tertiary"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-caption font-semibold text-accent">
                    {initials(title)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-subhead font-medium">{title}</span>
                      <span className="shrink-0 text-caption2 text-label-secondary">
                        {new Date(m.created_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="truncate text-caption text-label-secondary">
                      {m.direction === "out" ? "You: " : ""}
                      {m.body}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-label-tertiary" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
