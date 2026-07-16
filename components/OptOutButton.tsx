"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import { optOutThread } from "@/app/(app)/actions";
import { cn } from "@/lib/cn";

// "This is not actually a lead" — manual hard opt-out for a thread, shown on
// handover/escalation surfaces (thread banner + dashboard handover list).
// Flags the contact as opted out, cancels queued sends, stops sequences, and
// closes the conversation so the AI never re-engages.
export function OptOutButton({
  chatGuid,
  name,
  small,
}: {
  chatGuid: string;
  name?: string | null;
  small?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = () => {
    if (
      !window.confirm(
        `Opt out ${name || "this contact"}? This cancels anything queued to them, stops their sequences, closes the thread, and marks them "opted out" so they're never messaged again.`,
      )
    )
      return;
    start(async () => {
      const fd = new FormData();
      fd.set("chat_guid", chatGuid);
      await optOutThread(fd);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      title="Not a lead — opt this contact out and close the thread"
      className={cn(
        "press inline-flex shrink-0 items-center gap-1.5 rounded-full bg-danger/10 font-medium text-danger transition-colors duration-fast ease-ios hover:bg-danger/20 disabled:opacity-50",
        small ? "px-2 py-0.5 text-caption2" : "px-2.5 py-1 text-caption",
      )}
    >
      {pending ? (
        <Loader2 className={small ? "h-3 w-3 animate-spin" : "h-3.5 w-3.5 animate-spin"} />
      ) : (
        <Ban className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />
      )}
      Opt out
    </button>
  );
}
