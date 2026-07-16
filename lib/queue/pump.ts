import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, appOwnerId } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/provider";
import { renderTemplate, contactVars } from "@/lib/templating";
import { resolveSegment } from "@/lib/segments";
import { enqueueMessage, enqueueBulk, type EnqueueInput } from "@/lib/queue/enqueue";
import { chatGuidForPhone } from "@/lib/chat";
import { generateOpener, type OpenerContext } from "@/lib/ai/generate-opener";
import { STARTER_TEMPLATES } from "@/lib/starter-templates";
import { UPLOAD_BUCKET } from "@/lib/storage";
import type { Contact, Message } from "@/lib/types";

export interface PumpResult {
  sent: number;
  failed: number;
  materialized: number;
  reclaimed: number;
}

const nowIso = () => new Date().toISOString();

// Main pump: reclaim stragglers, materialize due schedules/sequences into the
// queue, then drain the queue under the global throttle gate. Safe to call
// concurrently — claim_next_send serializes sends via a row lock.
export async function runPump(maxBatch = 10): Promise<PumpResult> {
  const admin = createAdminClient();
  const ownerId = appOwnerId();

  // 1. Reclaim rows stuck in 'sending' (crashed mid-send).
  let reclaimed = 0;
  try {
    const { data } = await admin.rpc("reclaim_stale_sending", { stale_seconds: 120 });
    if (typeof data === "number") reclaimed = data;
  } catch {
    /* non-fatal */
  }

  // 2. Materialize due scheduled sends + advance sequences into the queue.
  const materialized =
    (await materializeScheduled(admin, ownerId)) +
    (await advanceSequences(admin, ownerId));

  // 3. Drain the queue. Each claim advances the gate, so spacing holds even
  //    within one tick; the loop normally sends 0–1 per call.
  const provider = await getProvider();
  let sent = 0;
  let failed = 0;

  // Lazily-loaded context for "auto_outreach" rows — the user's opener
  // templates + compliance knowledge. Fetched once per tick, only if needed.
  let openerCtx: OpenerContext | null = null;
  const getOpenerCtx = async (): Promise<OpenerContext> => {
    if (openerCtx) return openerCtx;
    const { data: tpls } = await admin
      .from("templates")
      .select("name, body")
      .eq("owner_id", ownerId);
    const cold = (tpls ?? [])
      .filter((t: { name: string }) => /cold outreach/i.test(t.name))
      .map((t: { body: string }) => t.body);
    const anchors = cold.length ? cold : STARTER_TEMPLATES.map((t) => t.body);
    const { data: s } = await admin
      .from("app_settings")
      .select("ai_knowledge")
      .eq("id", true)
      .maybeSingle();
    openerCtx = { knowledge: (s?.ai_knowledge as string) ?? null, anchors };
    return openerCtx;
  };

  for (let i = 0; i < maxBatch; i++) {
    const { data, error } = await admin.rpc("claim_next_send");
    if (error) break;
    const rows = (data ?? []) as Message[];
    if (rows.length === 0) break; // gate/cap/window closed or queue empty
    const row = rows[0];

    // Auto-outreach: generate a unique, on-message opener just-in-time. On any
    // failure we fall back to the row's body (a spintax-varied template) and
    // leave ai_generated=false so a later retry can try generating again.
    let body = row.body;
    if (row.source === "auto_outreach" && !row.ai_generated) {
      const ctx = await getOpenerCtx();
      let contact: { name: string | null; company: string | null } | null = null;
      if (row.contact_id) {
        const { data: c } = await admin
          .from("contacts")
          .select("name, company")
          .eq("id", row.contact_id)
          .maybeSingle();
        contact = (c as { name: string | null; company: string | null } | null) ?? null;
      }
      const gen = await generateOpener(
        { name: contact?.name ?? "", company: contact?.company ?? null },
        ctx,
      );
      if (gen) {
        body = gen;
        await admin
          .from("messages")
          .update({ body: gen, ai_generated: true, updated_at: nowIso() })
          .eq("id", row.id);
      }
    }

    // Outbound files: stream each stored attachment to BlueBubbles, then send
    // any caption text. Fails the row if an attachment can't be fetched/sent.
    const stored = (row.attachments ?? []).filter((a) => a.storage_path);
    let res;
    if (stored.length > 0) {
      res = { ok: true } as Awaited<ReturnType<typeof provider.sendMessage>>;
      for (const [ai, att] of stored.entries()) {
        const { data: blob, error: dlErr } = await admin.storage
          .from(UPLOAD_BUCKET)
          .download(att.storage_path!);
        if (dlErr || !blob) {
          res = {
            ok: false,
            acceptedAt: nowIso(),
            hardFail: true,
            error: `attachment missing from storage: ${att.storage_path}`,
          };
          break;
        }
        res = await provider.sendAttachment({
          chatGuid: row.chat_guid,
          tempGuid: `${row.bb_temp_guid ?? row.id}-att${ai}`,
          name: att.name ?? "file",
          mime: att.mime ?? "application/octet-stream",
          data: await blob.arrayBuffer(),
        });
        if (!res.ok) break;
      }
      if (res.ok && body.trim()) {
        res = await provider.sendMessage({
          chatGuid: row.chat_guid,
          message: body,
          tempGuid: row.bb_temp_guid ?? crypto.randomUUID(),
        });
      }
    } else {
      res = await provider.sendMessage({
        chatGuid: row.chat_guid,
        message: body,
        tempGuid: row.bb_temp_guid ?? crypto.randomUUID(),
      });
    }

    if (res.ok) {
      await admin
        .from("messages")
        .update({
          status: "sent",
          sent_at: nowIso(),
          bb_message_guid: res.providerMessageGuid ?? null,
          error: res.error ?? null,
          updated_at: nowIso(),
        })
        .eq("id", row.id);
      sent++;
    } else {
      await failOrRetry(admin, row, res.error ?? "send failed");
      failed++;
    }
  }

  return { sent, failed, materialized, reclaimed };
}

async function failOrRetry(admin: SupabaseClient, row: Message, errMsg: string) {
  if (row.attempts >= row.max_attempts) {
    await admin
      .from("messages")
      .update({ status: "failed", error: errMsg, updated_at: nowIso() })
      .eq("id", row.id);
    return;
  }
  const backoffSec =
    Math.min(3600, Math.pow(2, Math.max(row.attempts, 1) - 1) * 60) +
    Math.floor(Math.random() * 30);
  await admin
    .from("messages")
    .update({
      status: "queued",
      available_at: new Date(Date.now() + backoffSec * 1000).toISOString(),
      claimed_at: null,
      error: errMsg,
      updated_at: nowIso(),
    })
    .eq("id", row.id);
}

async function templateBody(
  admin: SupabaseClient,
  templateId: string | null,
): Promise<string | null> {
  if (!templateId) return null;
  const { data } = await admin
    .from("templates")
    .select("body")
    .eq("id", templateId)
    .maybeSingle();
  return (data?.body as string) ?? null;
}

function nextOccurrence(runAt: string, recurrence: string): string {
  const d = new Date(runAt);
  if (recurrence === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (recurrence === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (recurrence === "hourly") d.setUTCHours(d.getUTCHours() + 1);
  else d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

// Materialize due scheduled_sends. Uses optimistic claims (update guarded by the
// original run_at / status) so overlapping pumps don't double-fire.
async function materializeScheduled(
  admin: SupabaseClient,
  ownerId: string,
): Promise<number> {
  const { data: due } = await admin
    .from("scheduled_sends")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .lte("run_at", nowIso());

  let count = 0;
  for (const s of due ?? []) {
    // claim the row atomically
    let claimed = false;
    if (s.recurrence) {
      const { data: upd } = await admin
        .from("scheduled_sends")
        .update({ run_at: nextOccurrence(s.run_at, s.recurrence), last_run_at: nowIso() })
        .eq("id", s.id)
        .eq("run_at", s.run_at)
        .select("id");
      claimed = !!(upd && upd.length);
    } else {
      const { data: upd } = await admin
        .from("scheduled_sends")
        .update({ status: "done", last_run_at: nowIso() })
        .eq("id", s.id)
        .eq("status", "active")
        .select("id");
      claimed = !!(upd && upd.length);
    }
    if (!claimed) continue;

    const tBody = await templateBody(admin, s.template_id);

    if (s.segment) {
      const contacts = await resolveSegment(admin, ownerId, s.segment);
      const inputs: EnqueueInput[] = contacts.map((c) => ({
        ownerId,
        contactId: c.id,
        chatGuid: c.chat_guid ?? chatGuidForPhone(c.phone),
        body: renderTemplate(s.body ?? tBody ?? "", contactVars(c)),
        source: "scheduled",
        scheduledSendId: s.id,
      }));
      count += await enqueueBulk(admin, inputs);
    } else if (s.contact_id) {
      const { data: c } = await admin
        .from("contacts")
        .select("*")
        .eq("id", s.contact_id)
        .maybeSingle();
      const contact = c as Contact | null;
      if (contact) {
        await enqueueMessage(admin, {
          ownerId,
          contactId: contact.id,
          chatGuid: contact.chat_guid ?? chatGuidForPhone(contact.phone),
          body: renderTemplate(s.body ?? tBody ?? "", contactVars(contact)),
          source: "scheduled",
          scheduledSendId: s.id,
        });
        count++;
      }
    }
  }
  return count;
}

// Advance due sequence enrollments by one step. Optimistically claims each
// enrollment via current_step guard so overlapping pumps don't double-step.
async function advanceSequences(
  admin: SupabaseClient,
  ownerId: string,
): Promise<number> {
  const { data: due } = await admin
    .from("sequence_enrollments")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .lte("next_step_at", nowIso());

  let count = 0;
  for (const e of due ?? []) {
    const { data: seq } = await admin
      .from("sequences")
      .select("steps")
      .eq("id", e.sequence_id)
      .maybeSingle();
    const steps: Array<{ offset_hours?: number; template_id?: string; body?: string }> =
      (seq?.steps as []) ?? [];
    const step = steps[e.current_step];
    if (!step) {
      await admin
        .from("sequence_enrollments")
        .update({ status: "completed" })
        .eq("id", e.id)
        .eq("current_step", e.current_step);
      continue;
    }

    const hasNext = e.current_step + 1 < steps.length;
    const nextStepAt = hasNext
      ? new Date(
          Date.now() + (steps[e.current_step + 1].offset_hours ?? 24) * 3600 * 1000,
        ).toISOString()
      : e.next_step_at;

    // claim this step
    const { data: upd } = await admin
      .from("sequence_enrollments")
      .update({
        current_step: e.current_step + 1,
        next_step_at: nextStepAt,
        status: hasNext ? "active" : "completed",
      })
      .eq("id", e.id)
      .eq("current_step", e.current_step)
      .eq("status", "active")
      .select("id");
    if (!(upd && upd.length)) continue;

    const tBody = await templateBody(admin, step.template_id ?? null);
    const { data: c } = await admin
      .from("contacts")
      .select("*")
      .eq("id", e.contact_id)
      .maybeSingle();
    const contact = c as Contact | null;

    await enqueueMessage(admin, {
      ownerId,
      contactId: e.contact_id,
      chatGuid: e.chat_guid,
      body: renderTemplate(step.body ?? tBody ?? "", contact ? contactVars(contact) : {}),
      source: "sequence",
    });
    count++;
  }
  return count;
}
