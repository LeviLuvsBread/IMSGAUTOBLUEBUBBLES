import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addressFromChatGuid } from "@/lib/chat";
import type { Message } from "@/lib/types";

export const dynamic = "force-dynamic";

type Row = Message & { contacts?: { name: string | null; company: string | null } | null };

export default async function InboxPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("*, contacts(name, company)")
    .order("created_at", { ascending: false })
    .limit(300);

  const rows = (data ?? []) as Row[];

  // Reduce to the latest message per chat_guid.
  const byChat = new Map<string, Row>();
  for (const m of rows) {
    if (!byChat.has(m.chat_guid)) byChat.set(m.chat_guid, m);
  }
  const conversations = [...byChat.values()];

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold">Inbox</h1>
      {conversations.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No conversations yet. Send a message from{" "}
          <Link href="/compose" className="text-imsg-blue hover:underline">
            Compose
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {conversations.map((m) => {
            const title =
              m.contacts?.name || addressFromChatGuid(m.chat_guid);
            return (
              <li key={m.chat_guid}>
                <Link
                  href={`/inbox/${encodeURIComponent(m.chat_guid)}`}
                  className="flex items-center justify-between gap-3 p-3 transition hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{title}</div>
                    <div className="line-clamp-1 text-sm text-neutral-500">
                      {m.direction === "out" ? "You: " : ""}
                      {m.body}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-400">
                    {new Date(m.created_at).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
