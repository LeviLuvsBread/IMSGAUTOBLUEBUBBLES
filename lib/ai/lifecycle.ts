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

const SYSTEM = `You track where a business-funding (MCA) outreach conversation stands and decide ONLY when it's ready to hand to the human closer.
Stages, in order: new → engaged → warming → interested → ready_for_handover → handed_off → closed.
The AI keeps engaging and qualifying on its own. Set ready_for_handover = true ONLY when the lead:
  (a) says they prefer or want to set up a call or meeting, OR
  (b) says they have signed / submitted / completed the application form (or uploaded their documents) via the link.
Just answering qualifying questions (amount, revenue, business type, time in business) is NOT enough — set ready_for_handover = false and keep driving them toward the form or a call. Advance the stage (engaged/warming/interested) to reflect progress, never hand off early.
When ready_for_handover is true, write handover_summary as a tight brief for the human, including:
  - who they are + business type
  - the key facts gathered: amount wanted, monthly revenue, time in business, purpose (use whatever is known)
  - the handoff reason, stated plainly: "Signed the application" or "Prefers a call"
Put any new facts in qualification_updates.
Respond with ONLY a JSON object:
{
  "stage": one of new|engaged|warming|interested|ready_for_handover|handed_off|closed,
  "qualification_updates": { ...any merchant facts learned... },
  "ready_for_handover": boolean,
  "handover_summary": "the brief described above when ready; otherwise empty"
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
