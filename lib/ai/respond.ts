import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiStage,
  AiRunStage,
  AiRunOutcome,
  AppSettings,
  ConversationState,
  LifecycleStage,
  Message,
} from "@/lib/types";
import { enqueueMessage } from "@/lib/queue/enqueue";
import { applyOptOut } from "@/lib/queue/opt-out";
import { isOptOut, needsHuman } from "./guardrails";
import { runPipeline, type ConvoTurn, type PipelineContext } from "./pipeline";
import { evaluateLifecycle } from "./lifecycle";

// Used until the owner sets their own in Settings → AI. Goal: text like a human.
const DEFAULT_PERSONA = `You are a friendly, sharp funding specialist who helps small business owners get working capital. You're texting merchants you've been in contact with before. You talk like a real person over text — casual, warm, concise, never salesy or robotic. Your job is to re-warm the relationship, find out if they need capital right now, and keep them talking. You do NOT close deals or quote numbers — a human takes over for that.`;

const DEFAULT_KNOWLEDGE = `We help business owners access fast, flexible working capital (merchant cash advance / business funding) with minimal paperwork — often same-day decisions and funding in 24–48 hours. Funds can be used for payroll, inventory, equipment, expansion, or cash-flow gaps. NEVER quote specific rates, factor rates, fees, terms, or approval amounts — those depend on underwriting. NEVER guarantee approval. If asked for specifics you can't give, offer a quick call. Keep replies to 1–2 short sentences.`;

const HISTORY_LIMIT = 24;
const nowIso = () => new Date().toISOString();

async function writeRun(
  admin: SupabaseClient,
  ownerId: string,
  chatGuid: string,
  inboundId: string | null,
  outcome: AiRunOutcome,
  reply: string | null,
  trace: AiRunStage[],
) {
  await admin.from("ai_runs").insert({
    owner_id: ownerId,
    chat_guid: chatGuid,
    inbound_message_id: inboundId,
    outcome,
    final_reply: reply,
    stages: trace,
  });
}

async function notify(
  admin: SupabaseClient,
  ownerId: string,
  type: "handover" | "escalation" | "opt_out",
  chatGuid: string,
  title: string,
  body: string,
) {
  await admin.from("notifications").insert({
    owner_id: ownerId,
    type,
    chat_guid: chatGuid,
    title,
    body,
  });
}

async function patchState(
  admin: SupabaseClient,
  ownerId: string,
  chatGuid: string,
  patch: Partial<ConversationState>,
) {
  await admin
    .from("conversation_state")
    .update({ ...patch, claimed_at: null, updated_at: nowIso() })
    .eq("owner_id", ownerId)
    .eq("chat_guid", chatGuid);
}

// Run one AI turn for a claimed ('generating') thread: pre-gate → reply pipeline
// → lifecycle → enqueue/hold/escalate → persist state + audit. Releases the
// generating lock on every path.
export async function runConversationTurn(
  admin: SupabaseClient,
  ownerId: string,
  chatGuid: string,
): Promise<{ outcome: string }> {
  const { data: sRow } = await admin
    .from("app_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  const s = sRow as AppSettings | null;
  if (!s || !s.ai_enabled) {
    await patchState(admin, ownerId, chatGuid, { status: "active" });
    return { outcome: "disabled" };
  }

  const { data: cRow } = await admin
    .from("conversation_state")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("chat_guid", chatGuid)
    .maybeSingle();
  const cs = cRow as ConversationState | null;
  if (!cs) return { outcome: "no_state" };

  // History (oldest → newest).
  const { data: msgs } = await admin
    .from("messages")
    .select("*")
    .eq("chat_guid", chatGuid)
    .order("created_at", { ascending: true })
    .limit(200);
  const all = (msgs ?? []) as Message[];

  const convo: ConvoTurn[] = [];
  for (const m of all) {
    if (m.direction === "in") convo.push({ role: "merchant", text: m.body });
    else if (
      m.direction === "out" &&
      !m.ai_pending_approval &&
      (m.status === "sent" || m.status === "delivered" || m.status === "read")
    )
      convo.push({ role: "rep", text: m.body });
  }
  const lastInbound = [...all].reverse().find((m) => m.direction === "in") ?? null;
  const inboundId = lastInbound?.id ?? null;
  const latestInboundText = lastInbound?.body ?? "";

  // Idempotency: we've already replied to this inbound.
  if (inboundId && cs.last_processed_inbound_id === inboundId) {
    await patchState(admin, ownerId, chatGuid, { status: "active" });
    return { outcome: "already_processed" };
  }

  // Contact (and an early opt-out check).
  let contact: { name?: string | null; company?: string | null } | null = null;
  if (cs.contact_id) {
    const { data: c } = await admin
      .from("contacts")
      .select("name, company, opted_out")
      .eq("id", cs.contact_id)
      .maybeSingle();
    if (c) {
      contact = { name: c.name, company: c.company };
      if (c.opted_out) {
        await patchState(admin, ownerId, chatGuid, {
          status: "opted_out",
          ai_autopilot: false,
          last_processed_inbound_id: inboundId,
        });
        return { outcome: "opted_out" };
      }
    }
  }

  // Deterministic opt-out pre-gate (TCPA: no reply after STOP). Full hard
  // opt-out: contact flag + queued sends canceled + sequences stopped.
  if (isOptOut(latestInboundText)) {
    await applyOptOut(admin, ownerId, chatGuid, cs.contact_id ?? null);
    await patchState(admin, ownerId, chatGuid, {
      status: "opted_out",
      ai_autopilot: false,
      lifecycle_stage: "closed",
      last_processed_inbound_id: inboundId,
    });
    await notify(
      admin,
      ownerId,
      "opt_out",
      chatGuid,
      "Lead opted out",
      `${contact?.name ?? "A contact"} replied with a stop/opt-out keyword. Auto-replies are off for this thread.`,
    );
    await writeRun(admin, ownerId, chatGuid, inboundId, "opted_out", null, []);
    return { outcome: "opted_out" };
  }

  // Deterministic "needs human" pre-gate: attorney / lawsuit / dispute / cease →
  // hand to a person, never let the AI reply (from the handoff spec).
  if (needsHuman(latestInboundText)) {
    await patchState(admin, ownerId, chatGuid, {
      status: "escalated",
      last_processed_inbound_id: inboundId,
    });
    await notify(
      admin,
      ownerId,
      "escalation",
      chatGuid,
      `${contact?.company || contact?.name || "A conversation"} needs you`,
      "The merchant used legal/dispute language. Handed to you — no AI reply was sent.",
    );
    await writeRun(admin, ownerId, chatGuid, inboundId, "escalated", null, []);
    return { outcome: "escalated" };
  }

  // Optional turn cap (0 = no limit; the default). When set and hit, force a
  // handover. Otherwise the AI keeps engaging until it's genuinely ready.
  if (s.ai_max_turns > 0 && cs.ai_turns >= s.ai_max_turns) {
    await patchState(admin, ownerId, chatGuid, {
      status: "active",
      lifecycle_stage: "ready_for_handover",
      ai_autopilot: false,
      ready_at: nowIso(),
      handover_summary:
        cs.handover_summary ??
        "Reached the AI reply limit for this thread — time for a human to take over.",
      last_processed_inbound_id: inboundId,
    });
    await notify(
      admin,
      ownerId,
      "handover",
      chatGuid,
      `${contact?.company || contact?.name || "A lead"} — ready for you`,
      "This thread hit the AI reply limit. Take it from here.",
    );
    await writeRun(admin, ownerId, chatGuid, inboundId, "max_turns", null, []);
    return { outcome: "max_turns" };
  }

  // Stages.
  const { data: stRows } = await admin
    .from("ai_stages")
    .select("*")
    .eq("owner_id", ownerId)
    .order("position", { ascending: true });
  const stages = (stRows ?? []) as AiStage[];
  if (stages.length === 0) {
    await patchState(admin, ownerId, chatGuid, { status: "active" });
    return { outcome: "no_stages" };
  }

  const ctx: PipelineContext = {
    conversation: convo.slice(-HISTORY_LIMIT),
    contact,
    qualification: (cs.qualification as Record<string, unknown>) ?? {},
    lifecycleStage: cs.lifecycle_stage,
    persona: s.ai_persona?.trim() || DEFAULT_PERSONA,
    knowledge: s.ai_knowledge?.trim() || DEFAULT_KNOWLEDGE,
    analyses: [],
  };

  const result = await runPipeline(ctx, stages);
  const qualification = result.qualification;

  // Lifecycle evaluator (independent of the reply stages).
  const life = await evaluateLifecycle({ ...ctx, qualification });
  if (life.qualification_updates)
    Object.assign(qualification, life.qualification_updates);

  // Opt-out surfaced by the pipeline. Same full hard opt-out as the pre-gate
  // (also cancels queued sends and stops sequences for this thread).
  if (result.outcome === "opted_out") {
    await applyOptOut(admin, ownerId, chatGuid, cs.contact_id ?? null);
    await patchState(admin, ownerId, chatGuid, {
      status: "opted_out",
      ai_autopilot: false,
      lifecycle_stage: "closed",
      qualification,
      last_processed_inbound_id: inboundId,
    });
    await notify(
      admin,
      ownerId,
      "opt_out",
      chatGuid,
      "Lead opted out",
      "The AI detected an opt-out. Auto-replies are off for this thread.",
    );
    await writeRun(admin, ownerId, chatGuid, inboundId, "opted_out", null, result.trace);
    return { outcome: "opted_out" };
  }

  let nextStatus: ConversationState["status"] = "active";
  let turnsInc = 0;

  if (result.outcome === "escalated") {
    nextStatus = "escalated";
    await notify(
      admin,
      ownerId,
      "escalation",
      chatGuid,
      `${contact?.company || contact?.name || "A conversation"} needs you`,
      result.escalationReason ?? "The AI flagged this thread for a human.",
    );
  } else if (result.outcome === "replied" && result.reply) {
    await enqueueMessage(admin, {
      ownerId,
      chatGuid,
      contactId: cs.contact_id,
      body: result.reply,
      source: "ai",
      aiGenerated: true,
      aiPendingApproval: !s.ai_autosend, // held for approval unless auto-send is on
    });
    if (s.ai_autosend) turnsInc = 1; // held drafts count on approval, not now
  }
  // "no_reply" → nothing to enqueue.

  // Lifecycle stage + handover.
  let lifecycleStage: LifecycleStage = (life.stage ??
    cs.lifecycle_stage) as LifecycleStage;
  let aiAutopilot = cs.ai_autopilot;
  let readyAt = cs.ready_at;
  let handoverSummary = cs.handover_summary;
  const becameReady =
    life.ready_for_handover &&
    cs.lifecycle_stage !== "ready_for_handover" &&
    cs.lifecycle_stage !== "handed_off";
  if (becameReady) {
    lifecycleStage = "ready_for_handover";
    aiAutopilot = false; // AI pauses; the human takes over cleanly
    readyAt = nowIso();
    handoverSummary = life.handover_summary ?? "This lead looks ready for a human.";
    await notify(
      admin,
      ownerId,
      "handover",
      chatGuid,
      `${contact?.company || contact?.name || "A lead"} — ready for you`,
      handoverSummary,
    );
  }

  await patchState(admin, ownerId, chatGuid, {
    status: nextStatus,
    lifecycle_stage: lifecycleStage,
    ai_autopilot: aiAutopilot,
    ai_turns: cs.ai_turns + turnsInc,
    qualification,
    handover_summary: handoverSummary,
    ready_at: readyAt,
    last_processed_inbound_id: inboundId,
  });

  await writeRun(
    admin,
    ownerId,
    chatGuid,
    inboundId,
    result.outcome,
    result.reply,
    result.trace,
  );

  return { outcome: result.outcome };
}
