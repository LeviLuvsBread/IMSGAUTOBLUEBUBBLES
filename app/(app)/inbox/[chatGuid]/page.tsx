import Link from "next/link";
import { ChevronLeft, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MessageThread } from "@/components/MessageThread";
import { ThreadAiBar } from "@/components/ThreadAiBar";
import { OptOutButton } from "@/components/OptOutButton";
import { addressFromChatGuid } from "@/lib/chat";
import { sendNow } from "../../actions";
import { TEST_CHAT_GUID } from "@/lib/test-contact";
import type { Message, ConversationState } from "@/lib/types";

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
  const [{ data }, { data: contact }, { data: convo }] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("chat_guid", chatGuid)
      .order("created_at", { ascending: true })
      .limit(500),
    supabase.from("contacts").select("name").eq("chat_guid", chatGuid).maybeSingle(),
    supabase
      .from("conversation_state")
      .select("*")
      .eq("chat_guid", chatGuid)
      .maybeSingle(),
  ]);
  const cs = (convo as ConversationState | null) ?? null;
  const isTest = chatGuid === TEST_CHAT_GUID;

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      <div className="mb-2 flex items-center gap-2">
        <Link
          href="/inbox"
          className="press inline-flex items-center gap-0.5 rounded-control px-1.5 py-1 text-subhead text-accent transition-colors duration-fast ease-ios hover:bg-fill-tertiary"
        >
          <ChevronLeft className="h-4 w-4" /> Inbox
        </Link>
        <h1 className="truncate text-callout font-semibold">
          {contact?.name || address}
        </h1>
      </div>

      {cs || isTest ? (
        <ThreadAiBar
          chatGuid={chatGuid}
          autopilot={cs?.ai_autopilot ?? true}
          lifecycleStage={cs?.lifecycle_stage ?? "new"}
          status={cs?.status ?? "active"}
          isTest={isTest}
        />
      ) : null}

      {cs &&
      (cs.lifecycle_stage === "ready_for_handover" || cs.status === "escalated") ? (
        <div className="mb-2 rounded-card border border-warning/30 bg-warning/[0.06] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-caption2 font-semibold uppercase tracking-wide text-warning">
              <Sparkles className="h-3 w-3" />
              {cs.status === "escalated" ? "Needs you" : "Ready for handover"}
            </p>
            <OptOutButton chatGuid={chatGuid} name={contact?.name} />
          </div>
          {cs.handover_summary ? (
            <p className="mt-1 text-subhead text-label">{cs.handover_summary}</p>
          ) : null}
          {cs.qualification && Object.keys(cs.qualification).length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(cs.qualification).map(([k, v]) =>
                v && typeof v !== "object" ? (
                  <span
                    key={k}
                    className="rounded-full bg-surface px-2 py-0.5 text-caption2 text-label-secondary ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
                  >
                    {k.replace(/_/g, " ")}: {String(v)}
                  </span>
                ) : null,
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto rounded-card bg-surface px-3 ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
        <MessageThread chatGuid={chatGuid} initial={(data ?? []) as Message[]} />
      </div>

      <form action={sendNow} className="mt-3 flex items-end gap-2">
        <input type="hidden" name="phone" value={address} />
        <textarea
          name="body"
          rows={1}
          required
          placeholder="iMessage"
          className="flex-1 resize-none rounded-[18px] bg-fill px-3.5 py-2.5 text-callout outline-none transition-colors duration-fast ease-ios focus:bg-fill-secondary"
        />
        <button className="press rounded-[18px] bg-accent px-4 py-2.5 text-subhead font-semibold text-white">
          Send
        </button>
      </form>
    </div>
  );
}
