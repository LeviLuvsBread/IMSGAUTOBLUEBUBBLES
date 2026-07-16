import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addressFromChatGuid } from "@/lib/chat";
import { InboxRealtime } from "@/components/InboxRealtime";
import { InboxList, type InboxConvo } from "@/components/InboxList";
import type { Message } from "@/lib/types";

export const dynamic = "force-dynamic";

type Row = Message & {
  contacts?: { name: string | null; company: string | null; opted_out: boolean | null } | null;
};

export default async function InboxPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("*, contacts(name, company, opted_out)")
    .order("created_at", { ascending: false })
    .limit(300);

  const rows = (data ?? []) as Row[];
  const byChat = new Map<string, Row>();
  for (const m of rows) if (!byChat.has(m.chat_guid)) byChat.set(m.chat_guid, m);

  const conversations: InboxConvo[] = [...byChat.values()].map((m) => {
    const body = (m.body ?? "").replace(/\uFFFC/g, "").trim();
    const hasAttachment = (m.attachments?.length ?? 0) > 0;
    return {
      chatGuid: m.chat_guid,
      contactId: m.contact_id,
      title: m.contacts?.name || addressFromChatGuid(m.chat_guid),
      preview: body || (hasAttachment ? "📎 Attachment" : ""),
      fromMe: m.direction === "out",
      dateIso: m.created_at,
      optedOut: Boolean(m.contacts?.opted_out),
    };
  });

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
        <InboxList conversations={conversations} />
      )}
    </div>
  );
}
