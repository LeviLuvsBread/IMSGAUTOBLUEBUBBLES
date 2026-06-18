import "server-only";
import type { LifecycleStage } from "@/lib/types";
import { callOpenRouter, parseJsonLoose } from "./llm";
import { serializeContext, type PipelineContext } from "./pipeline";

// Separate from the reply pipeline (as the owner asked): a single evaluator that
// decides where the conversation stands and whether it's ready for a human.
const LIFECYCLE_MODEL = "google/gemini-2.5-flash";

const STAGES: LifecycleStage[] = [
  "new",
  "engaged",
  "warming",
  "interested",
  "ready_for_handover",
  "handed_off",
  "closed",
];

export interface LifecycleResult {
  stage: LifecycleStage;
  qualification_updates?: Record<string, unknown>;
  ready_for_handover: boolean;
  handover_summary?: string;
}

const SYSTEM = `You track where a business-funding outreach conversation stands and decide when it's ready to hand to a human closer.
Stages, in order: new → engaged → warming → interested → ready_for_handover → handed_off → closed.
The AI's job is only to re-warm and engage; a HUMAN closes. Mark ready_for_handover when the merchant shows real buying intent — e.g. asks how to get started, willingly shares qualifying details, asks to speak with someone, or is clearly ready to move. Do NOT mark ready just for being polite or replying once.
Respond with ONLY a JSON object:
{
  "stage": one of new|engaged|warming|interested|ready_for_handover|handed_off|closed,
  "qualification_updates": { ...any merchant facts learned... },
  "ready_for_handover": boolean,
  "handover_summary": "1-2 sentence brief for the human: who they are, why they're ready, key facts"
}`;

export async function evaluateLifecycle(
  ctx: PipelineContext,
): Promise<LifecycleResult> {
  try {
    const r = await callOpenRouter(
      LIFECYCLE_MODEL,
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: serializeContext(ctx) },
      ],
      { json: true, temperature: 0.2, maxTokens: 400 },
    );
    const parsed = parseJsonLoose<LifecycleResult>(r.text);
    if (parsed && STAGES.includes(parsed.stage)) {
      return {
        stage: parsed.stage,
        qualification_updates: parsed.qualification_updates,
        ready_for_handover: !!parsed.ready_for_handover,
        handover_summary: parsed.handover_summary,
      };
    }
  } catch {
    /* fall through to a safe default */
  }
  // Safe default: keep current stage, don't force a handover.
  return {
    stage: (ctx.lifecycleStage as LifecycleStage) ?? "engaged",
    ready_for_handover: false,
  };
}
