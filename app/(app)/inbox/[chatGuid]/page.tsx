import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MessageThread } from "@/components/MessageThread";
import { addressFromChatGuid } from "@/lib/chat";
import { sendNow } from "../../actions";
import type { Message } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ chatGuid: string }>;
}) {
  const { chatGuid: raw } = await params;
  const chatGuid = decodeURIComponent(raw);
  const address = addressFromChatGuid(chatGuid);

  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_guid", chatGuid)
    .order("created_at", { ascending: true })
    .limit(500);

  const { data: contact } = await supabase
    .from("contacts")
    .select("name")
    .eq("chat_guid", chatGuid)
    .maybeSingle();

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      <div className="mb-2 flex items-center gap-2">
        <Link href="/inbox" className="text-sm text-imsg-blue hover:underline">
          ← Inbox
        </Link>
        <h1 className="font-semibold">{contact?.name || address}</h1>
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border border-neutral-200 px-3 dark:border-neutral-800">
        <MessageThread chatGuid={chatGuid} initial={(data ?? []) as Message[]} />
      </div>

      <form action={sendNow} className="mt-3 flex items-end gap-2">
        <input type="hidden" name="phone" value={address} />
        <textarea
          name="body"
          rows={1}
          required
          placeholder="iMessage"
          className="flex-1 resize-none rounded-2xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-imsg-blue dark:border-neutral-700 dark:bg-neutral-800"
        />
        <button className="rounded-2xl bg-imsg-blue px-4 py-2 text-sm font-medium text-white">
          Send
        </button>
      </form>
    </div>
  );
}
