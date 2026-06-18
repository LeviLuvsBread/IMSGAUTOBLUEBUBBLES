"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, RotateCcw } from "lucide-react";
import { setAiAutopilot, resetTestConversation } from "@/app/(app)/actions";
import type { ConversationStatus, LifecycleStage } from "@/lib/types";
import { cn } from "@/lib/cn";

const STAGE_LABEL: Record<LifecycleStage, string> = {
  new: "New",
  engaged: "Engaged",
  warming: "Warming",
  interested: "Interested",
  ready_for_handover: "Ready for handover",
  handed_off: "Handed off",
  closed: "Closed",
};

// Per-thread AI strip: lifecycle chip + escalation/handover badge + autopilot
// toggle. For the test contact only, also a "Reset" button that wipes the
// thread so the AI starts a brand-new conversation.
export function ThreadAiBar({
  chatGuid,
  autopilot,
  lifecycleStage,
  status,
  isTest,
}: {
  chatGuid: string;
  autopilot: boolean;
  lifecycleStage: LifecycleStage;
  status: ConversationStatus;
  isTest: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(autopilot);
  const [pending, start] = useTransition();

  const toggle = () =>
    start(async () => {
      const next = !on;
      setOn(next);
      await setAiAutopilot(chatGuid, next);
    });

  const reset = () => {
    if (
      !window.confirm(
        "Reset this TEST conversation? This wipes the thread and the AI's memory so it starts fresh. (Test contact only.)",
      )
    )
      return;
    start(async () => {
      await resetTestConversation(chatGuid);
      router.push("/inbox");
      router.refresh();
    });
  };

  const ready = lifecycleStage === "ready_for_handover";
  const escalated = status === "escalated";
  const optedOut = status === "opted_out";

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-fill-secondary px-2 py-0.5 text-caption2 font-medium text-label-secondary">
        {STAGE_LABEL[lifecycleStage] ?? lifecycleStage}
      </span>
      {escalated ? (
        <span className="rounded-full bg-danger/10 px-2 py-0.5 text-caption2 font-medium text-danger">
          Needs you
        </span>
      ) : null}
      {ready ? (
        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-caption2 font-medium text-warning">
          Ready for handover
        </span>
      ) : null}
      {optedOut ? (
        <span className="rounded-full bg-fill-secondary px-2 py-0.5 text-caption2 font-medium text-label-secondary">
          Opted out
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {isTest ? (
          <button
            onClick={reset}
            disabled={pending}
            title="Wipe this test thread so the AI starts a brand-new conversation"
            className="press inline-flex items-center gap-1.5 rounded-full bg-fill-secondary px-2.5 py-1 text-caption font-medium text-label-secondary transition-colors duration-fast ease-ios hover:text-danger disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset test
          </button>
        ) : null}
        <button
          onClick={toggle}
          disabled={pending || optedOut}
          title={on ? "AI is replying on this thread" : "AI is off for this thread"}
          className={cn(
            "press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium transition-colors duration-fast ease-ios disabled:opacity-50",
            on ? "bg-accent/10 text-accent" : "bg-fill-secondary text-label-secondary",
          )}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          AI {on ? "on" : "off"}
        </button>
      </div>
    </div>
  );
}
