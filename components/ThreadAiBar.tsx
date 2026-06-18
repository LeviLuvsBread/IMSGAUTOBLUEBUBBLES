"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { setAiAutopilot } from "@/app/(app)/actions";
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

// Per-thread AI strip: lifecycle chip + escalation/handover badge + autopilot toggle.
export function ThreadAiBar({
  chatGuid,
  autopilot,
  lifecycleStage,
  status,
}: {
  chatGuid: string;
  autopilot: boolean;
  lifecycleStage: LifecycleStage;
  status: ConversationStatus;
}) {
  const [on, setOn] = useState(autopilot);
  const [pending, start] = useTransition();

  const toggle = () =>
    start(async () => {
      const next = !on;
      setOn(next);
      await setAiAutopilot(chatGuid, next);
    });

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

      <button
        onClick={toggle}
        disabled={pending || optedOut}
        title={on ? "AI is replying on this thread" : "AI is off for this thread"}
        className={cn(
          "press ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium transition-colors duration-fast ease-ios disabled:opacity-50",
          on
            ? "bg-accent/10 text-accent"
            : "bg-fill-secondary text-label-secondary",
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
  );
}
