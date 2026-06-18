import "server-only";
import type { AiStage, AiRunStage, AiRunOutcome } from "@/lib/types";
import { callOpenRouter, parseJsonLoose } from "./llm";
import { looksRisky } from "./guardrails";

export type Verdict =
  | "approve"
  | "revise"
  | "reject"
  | "escalate"
  | "opt_out"
  | "no_reply";

export interface StageOutput {
  verdict: Verdict;
  draft?: string;
  analysis: string;
  confidence?: number;
  qualification_updates?: Record<string, unknown>;
  lifecycle_signal?: string;
  escalation_reason?: string;
}

export interface ConvoTurn {
  role: "merchant" | "rep";
  text: string;
}

export interface PipelineContext {
  conversation: ConvoTurn[];
  contact: { name?: string | null; company?: string | null } | null;
  qualification: Record<string, unknown>;
  lifecycleStage: string;
  persona: string;
  knowledge: string;
  candidateDraft?: string;
  analyses: { stage: string; analysis: string }[];
}

export interface PipelineResult {
  outcome: AiRunOutcome;
  reply: string | null;
  escalationReason?: string;
  qualification: Record<string, unknown>;
  lifecycleSignal?: string;
  trace: AiRunStage[];
}

const MAX_REVISE = 2;

const CONTRACT = `Respond with ONLY a JSON object — no prose, no markdown, no code fences — matching exactly:
{
  "verdict": "approve" | "revise" | "reject" | "escalate" | "opt_out" | "no_reply",
  "draft": "the SMS reply text (required for draft/finalize stages and whenever you revise; otherwise omit)",
  "analysis": "one or two sentences explaining your decision",
  "confidence": 0.0-1.0,
  "qualification_updates": { "revenue"?: "...", "time_in_business"?: "...", "amount"?: "...", "interest"?: "..." },
  "lifecycle_signal": "new|engaged|warming|interested|ready_for_handover",
  "escalation_reason": "required only if verdict is escalate"
}`;

export function serializeContext(ctx: PipelineContext): string {
  const convo = ctx.conversation
    .map((m) => `${m.role === "merchant" ? "Merchant" : "You"}: ${m.text}`)
    .join("\n");
  return [
    ctx.contact
      ? `Contact: ${ctx.contact.name ?? "unknown"}${ctx.contact.company ? ` (${ctx.contact.company})` : ""}`
      : "",
    `Lifecycle stage: ${ctx.lifecycleStage}`,
    Object.keys(ctx.qualification).length
      ? `Known about them: ${JSON.stringify(ctx.qualification)}`
      : "",
    `\nConversation so far:\n${convo || "(no prior messages)"}`,
    ctx.candidateDraft ? `\nCurrent candidate reply:\n${ctx.candidateDraft}` : "",
    ctx.analyses.length
      ? `\nNotes from earlier stages:\n${ctx.analyses.map((a) => `- ${a.stage}: ${a.analysis}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSystem(stage: AiStage, ctx: PipelineContext): string {
  return [
    ctx.persona ? `# Who you are\n${ctx.persona}` : "",
    ctx.knowledge ? `# What you know / rules\n${ctx.knowledge}` : "",
    `# Your job — ${stage.name}\n${stage.prompt}`,
    CONTRACT,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function tempForKind(kind: AiStage["kind"]): number {
  if (kind === "draft") return 0.8;
  if (kind === "judge") return 0.2;
  return 0.3; // classify / research / finalize
}

async function runStage(
  stage: AiStage,
  ctx: PipelineContext,
  trace: AiRunStage[],
): Promise<StageOutput> {
  const t0 = Date.now();
  const messages = [
    { role: "system" as const, content: buildSystem(stage, ctx) },
    { role: "user" as const, content: serializeContext(ctx) },
  ];
  let out: StageOutput | null = null;
  let tokens = 0;
  try {
    const r = await callOpenRouter(stage.model, messages, {
      json: true,
      temperature: tempForKind(stage.kind),
    });
    tokens += r.tokens;
    out = parseJsonLoose<StageOutput>(r.text);
    if (!out || !out.verdict) {
      // one repair retry at temp 0
      const r2 = await callOpenRouter(
        stage.model,
        [
          messages[0],
          {
            role: "user" as const,
            content: serializeContext(ctx) + "\n\nReturn ONLY the JSON object.",
          },
        ],
        { json: true, temperature: 0 },
      );
      tokens += r2.tokens;
      out = parseJsonLoose<StageOutput>(r2.text);
    }
  } catch (e) {
    out = {
      verdict: "escalate",
      analysis: `Stage error: ${String(e)}`,
      escalation_reason: "LLM/stage failure",
    };
  }
  if (!out || !out.verdict) {
    out = {
      verdict: "escalate",
      analysis: "Stage returned unparseable output",
      escalation_reason: "Unparseable stage output",
    };
  }
  trace.push({
    name: stage.name,
    model: stage.model,
    verdict: out.verdict,
    analysis: out.analysis ?? "",
    draft: out.draft,
    ms: Date.now() - t0,
    tokens,
  });
  return out;
}

// Runs the configured stages: context stages (classify/research) → draft →
// judges (revise loops back to the drafter, bounded) → finalize. Returns the
// approved reply or a non-send outcome, plus the full stage trace.
export async function runPipeline(
  ctx: PipelineContext,
  stages: AiStage[],
): Promise<PipelineResult> {
  const trace: AiRunStage[] = [];
  const qualification: Record<string, unknown> = { ...ctx.qualification };
  let lifecycleSignal: string | undefined;
  let candidate = ctx.candidateDraft ?? "";

  const mk = (
    outcome: AiRunOutcome,
    reply: string | null,
    reason?: string,
  ): PipelineResult => ({
    outcome,
    reply,
    escalationReason: reason,
    qualification,
    lifecycleSignal,
    trace,
  });

  const enabled = stages
    .filter((s) => s.enabled)
    .sort((a, b) => a.position - b.position);
  const byKind = (k: AiStage["kind"]) => enabled.filter((s) => s.kind === k);
  const merge = (o: StageOutput) => {
    if (o.qualification_updates) Object.assign(qualification, o.qualification_updates);
    if (o.lifecycle_signal) lifecycleSignal = o.lifecycle_signal;
  };

  // 1. Context stages — may opt-out / escalate / drop before any draft.
  for (const stage of enabled.filter(
    (s) => s.kind === "classify" || s.kind === "research",
  )) {
    const ctxNow = { ...ctx, candidateDraft: candidate, qualification };
    const out = await runStage(stage, ctxNow, trace);
    merge(out);
    if (out.verdict === "opt_out") return mk("opted_out", null);
    if (out.verdict === "no_reply" || out.verdict === "reject")
      return mk("no_reply", null);
    if (out.verdict === "escalate") return mk("escalated", null, out.escalation_reason);
    ctx.analyses.push({ stage: stage.name, analysis: out.analysis });
  }

  const drafter = byKind("draft")[0];
  if (!drafter) return mk("no_reply", null);
  const judges = byKind("judge");
  const finalizer = byKind("finalize")[0];

  const regenerate = async (): Promise<void> => {
    const out = await runStage(
      drafter,
      { ...ctx, candidateDraft: candidate, qualification },
      trace,
    );
    merge(out);
    if (out.draft && out.draft.trim()) candidate = out.draft.trim();
  };

  await regenerate();
  if (!candidate.trim()) return mk("no_reply", null);

  // 2. Judges — revise loops back to the drafter (bounded), reject/escalate stop.
  let revises = 0;
  let ji = 0;
  while (ji < judges.length) {
    const out = await runStage(
      judges[ji],
      { ...ctx, candidateDraft: candidate, qualification },
      trace,
    );
    merge(out);
    if (out.verdict === "opt_out") return mk("opted_out", null);
    if (out.verdict === "escalate") return mk("escalated", null, out.escalation_reason);
    if (out.verdict === "reject") return mk("no_reply", null);
    if (out.verdict === "revise") {
      ctx.analyses.push({
        stage: judges[ji].name,
        analysis: `REVISION NEEDED: ${out.analysis}`,
      });
      if (out.draft && out.draft.trim()) candidate = out.draft.trim();
      if (++revises > MAX_REVISE)
        return mk("escalated", null, "Exceeded revision attempts");
      await regenerate();
      ji = 0; // re-judge from the top with the new draft
      continue;
    }
    // approve — a judge may also hand back a polished draft
    if (out.draft && out.draft.trim()) candidate = out.draft.trim();
    ji++;
  }

  // 3. Finalize (trim/polish).
  if (finalizer) {
    const out = await runStage(
      finalizer,
      { ...ctx, candidateDraft: candidate, qualification },
      trace,
    );
    if (out.draft && out.draft.trim()) candidate = out.draft.trim();
  }

  candidate = candidate.trim();
  if (!candidate) return mk("no_reply", null);
  // Deterministic last line of defense.
  if (looksRisky(candidate))
    return mk("escalated", null, "Draft tripped the rate/approval safety net");

  return mk("replied", candidate);
}
