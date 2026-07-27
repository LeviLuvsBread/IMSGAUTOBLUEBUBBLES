"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { syncThreadHistory } from "@/app/(app)/actions";
import { cn } from "@/lib/cn";

// Pulls this conversation's history from iMessage and fills in any messages the
// app never stored — mainly replies the owner sent from their own phone. Shows a
// brief result, then refreshes the thread so the newly-surfaced bubbles appear.
export function SyncHistoryButton({ chatGuid }: { chatGuid: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [added, setAdded] = useState<number | null>(null);

  const run = () =>
    start(async () => {
      const res = await syncThreadHistory(chatGuid);
      setAdded(res.added);
      router.refresh();
      setTimeout(() => setAdded(null), 4000);
    });

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      title="Pull this conversation's history from iMessage — fills in messages you sent from your phone"
      className={cn(
        "press inline-flex items-center gap-1 rounded-control px-2 py-1 text-caption font-medium transition-colors duration-fast ease-ios disabled:opacity-50",
        added !== null
          ? "text-success"
          : "text-label-secondary hover:bg-fill-tertiary hover:text-label",
      )}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      {added !== null
        ? added > 0
          ? `Filled in ${added}`
          : "Up to date"
        : "Sync"}
    </button>
  );
}
