"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { enqueueMessage, enqueueBulk, type EnqueueInput } from "@/lib/queue/enqueue";
import { resolveSegment } from "@/lib/segments";
import { renderForContact, extractVariables } from "@/lib/templating";
import { STARTER_TEMPLATES } from "@/lib/starter-templates";
import { TEST_CHAT_GUID } from "@/lib/test-contact";
import { toE164, chatGuidForPhone } from "@/lib/chat";
import { runPump } from "@/lib/queue/pump";
import type { Contact, Segment } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

function parseTags(raw: string | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function segmentFromForm(formData: FormData): Segment {
  const tags = parseTags(String(formData.get("seg_tags") ?? ""));
  const company = String(formData.get("seg_company") ?? "").trim();
  const ids = String(formData.get("seg_contact_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const all = formData.get("seg_all") === "on";
  const seg: Segment = {};
  if (tags.length) seg.tags = tags;
  if (company) seg.company = company;
  if (ids.length) seg.contact_ids = ids;
  if (all) seg.all = true;
  return seg;
}

// ---------------- auth ----------------
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------- contacts ----------------
export async function saveContact(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = String(formData.get("id") ?? "").trim();
  const phone = toE164(String(formData.get("phone") ?? ""));
  const row = {
    owner_id: userId,
    name: String(formData.get("name") ?? "").trim(),
    phone,
    email: (String(formData.get("email") ?? "").trim() || null) as string | null,
    company: (String(formData.get("company") ?? "").trim() || null) as string | null,
    tags: parseTags(String(formData.get("tags") ?? "")),
    notes: (String(formData.get("notes") ?? "").trim() || null) as string | null,
    chat_guid: chatGuidForPhone(phone),
    updated_at: new Date().toISOString(),
  };

  if (id) {
    await supabase.from("contacts").update(row).eq("id", id);
  } else {
    await supabase.from("contacts").insert(row);
  }
  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function deleteContact(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (id) await supabase.from("contacts").delete().eq("id", id);
  revalidatePath("/contacts");
}

export async function toggleOptOut(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const optedOut = formData.get("opted_out") === "true";
  if (id) await supabase.from("contacts").update({ opted_out: optedOut }).eq("id", id);
  revalidatePath("/contacts");
}

export type ImportRow = {
  name: string;
  phone: string;
  email: string;
  company: string;
  tags: string[];
};

export type ImportResult = {
  total: number;
  inserted: number;
  skippedNoPhone: number;
  duplicatesInFile: number;
  alreadyInList: number;
};

// Bulk CSV import. The client maps columns → fields and sends rows; we
// normalize phones to E.164, dedupe, and upsert (ignoring existing duplicates
// by the unique (owner_id, phone) constraint). RLS stamps/validates owner_id.
export async function importContacts(rows: ImportRow[]): Promise<ImportResult> {
  const { supabase, userId } = await requireUser();
  const list = Array.isArray(rows) ? rows : [];
  const seen = new Set<string>();
  let skippedNoPhone = 0;
  let duplicatesInFile = 0;
  const toInsert: Record<string, unknown>[] = [];

  for (const r of list) {
    const phone = toE164(String(r?.phone ?? ""));
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      skippedNoPhone++;
      continue;
    }
    if (seen.has(phone)) {
      duplicatesInFile++;
      continue;
    }
    seen.add(phone);
    const name =
      String(r?.name ?? "").trim() ||
      String(r?.company ?? "").trim() ||
      phone;
    toInsert.push({
      owner_id: userId,
      name,
      phone,
      email: String(r?.email ?? "").trim() || null,
      company: String(r?.company ?? "").trim() || null,
      tags: Array.isArray(r?.tags)
        ? r.tags.map((t) => String(t).trim()).filter(Boolean)
        : [],
      chat_guid: chatGuidForPhone(phone),
    });
  }

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 200) {
    const batch = toInsert.slice(i, i + 200);
    const { data, error } = await supabase
      .from("contacts")
      .upsert(batch, { onConflict: "owner_id,phone", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    inserted += data?.length ?? 0;
  }

  revalidatePath("/contacts");
  return {
    total: list.length,
    inserted,
    skippedNoPhone,
    duplicatesInFile,
    alreadyInList: toInsert.length - inserted,
  };
}

// ---------------- templates ----------------
// Seeds the default outreach template library, skipping any already present
// (matched by name) so it's safe to re-run from "Load starter pack".
export async function seedStarterTemplates(): Promise<{
  added: number;
  skipped: number;
}> {
  const { supabase, userId } = await requireUser();
  const { data: existing } = await supabase.from("templates").select("name");
  const have = new Set(
    (existing ?? []).map((t: { name: string }) => t.name.trim().toLowerCase()),
  );
  const toAdd = STARTER_TEMPLATES.filter(
    (t) => !have.has(t.name.trim().toLowerCase()),
  ).map((t) => ({
    owner_id: userId,
    name: t.name,
    body: t.body,
    variables: extractVariables(t.body),
  }));
  if (toAdd.length) await supabase.from("templates").insert(toAdd);
  revalidatePath("/templates");
  return { added: toAdd.length, skipped: STARTER_TEMPLATES.length - toAdd.length };
}

// Returns the BlueBubbles webhook + pump URLs WITH their secrets. These are
// kept out of the Settings HTML on first load; the client fetches them only
// when the owner explicitly reveals/copies, so the secret never sits in the
// page source or dev-tools view. Guarded by the auth check.
export async function getSetupUrls(): Promise<{
  webhookUrl: string;
  pumpUrl: string;
}> {
  await requireUser();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://your-app.vercel.app";
  const webhookSecret = process.env.WEBHOOK_SECRET ?? "YOUR_WEBHOOK_SECRET";
  const pumpSecret = process.env.PUMP_SECRET ?? "YOUR_PUMP_SECRET";
  return {
    webhookUrl: `${appUrl}/api/webhook?secret=${webhookSecret}`,
    pumpUrl: `curl -fsS "${appUrl}/api/cron/pump?key=${pumpSecret}"`,
  };
}

export async function saveTemplate(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = String(formData.get("id") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const row = {
    owner_id: userId,
    name: String(formData.get("name") ?? "").trim(),
    body,
    variables: extractVariables(body),
    updated_at: new Date().toISOString(),
  };
  if (id) {
    await supabase.from("templates").update(row).eq("id", id);
  } else {
    await supabase.from("templates").insert(row);
  }
  revalidatePath("/templates");
  redirect("/templates");
}

export async function deleteTemplate(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (id) await supabase.from("templates").delete().eq("id", id);
  revalidatePath("/templates");
}

// ---------------- settings ----------------
export async function saveSettings(formData: FormData) {
  const { supabase } = await requireUser();
  const num = (k: string, d: number) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) ? v : d;
  };
  const windowStart = String(formData.get("send_window_start") ?? "");
  const windowEnd = String(formData.get("send_window_end") ?? "");
  await supabase
    .from("app_settings")
    .update({
      min_delay_seconds: num("min_delay_seconds", 45),
      jitter_seconds: num("jitter_seconds", 75),
      daily_cap: num("daily_cap", 40),
      batch_size: num("batch_size", 10),
      send_window_start: windowStart === "" ? null : Number(windowStart),
      send_window_end: windowEnd === "" ? null : Number(windowEnd),
      timezone: String(formData.get("timezone") ?? "America/New_York"),
      bb_url: String(formData.get("bb_url") ?? "").trim() || null,
      paused: formData.get("paused") === "on",
      ai_enabled: formData.get("ai_enabled") === "on",
      ai_autosend: formData.get("ai_autosend") === "on",
      ai_max_turns: num("ai_max_turns", 12),
      ai_persona: String(formData.get("ai_persona") ?? "").trim() || null,
      ai_knowledge: String(formData.get("ai_knowledge") ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  revalidatePath("/settings");
  redirect("/settings");
}

// Quick pause/resume toggle for the send pump. claim_next_send() returns early
// while paused, so nothing leaves the queue until it's resumed.
export async function setQueuePaused(paused: boolean) {
  const { supabase } = await requireUser();
  await supabase
    .from("app_settings")
    .update({ paused, updated_at: new Date().toISOString() })
    .eq("id", true);
  revalidatePath("/");
  revalidatePath("/settings");
}

// ---------------- AI responder: drafts + per-thread autopilot ----------------

// Approve a held AI draft → release it to the pump and count the AI turn.
export async function approveDraft(messageId: string) {
  const { supabase } = await requireUser();
  const { data: msg } = await supabase
    .from("messages")
    .select("chat_guid")
    .eq("id", messageId)
    .maybeSingle();
  await supabase
    .from("messages")
    .update({
      ai_pending_approval: false,
      available_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", messageId)
    .eq("ai_pending_approval", true);
  if (msg?.chat_guid) {
    const { data: cs } = await supabase
      .from("conversation_state")
      .select("ai_turns")
      .eq("chat_guid", msg.chat_guid)
      .maybeSingle();
    await supabase
      .from("conversation_state")
      .update({
        ai_turns: ((cs?.ai_turns as number) ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("chat_guid", msg.chat_guid);
  }
}

// Edit a held AI draft's text before approving.
export async function editDraft(messageId: string, body: string) {
  const { supabase } = await requireUser();
  const text = body.trim();
  if (!text) return;
  await supabase
    .from("messages")
    .update({ body: text, updated_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("ai_pending_approval", true);
}

// Discard a held AI draft (don't send it).
export async function discardDraft(messageId: string) {
  const { supabase } = await requireUser();
  await supabase
    .from("messages")
    .update({
      status: "canceled",
      ai_pending_approval: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", messageId)
    .eq("ai_pending_approval", true);
}

// Toggle the AI responder on/off for one thread.
export async function setAiAutopilot(chatGuid: string, on: boolean) {
  const { supabase } = await requireUser();
  await supabase
    .from("conversation_state")
    .update({ ai_autopilot: on, updated_at: new Date().toISOString() })
    .eq("chat_guid", chatGuid);
}

// TEST ONLY: wipe the test thread (messages + AI state + runs + notifications)
// so the AI treats the next inbound as a brand-new conversation. Hard-scoped to
// the test contact — it can never touch a real lead.
export async function resetTestConversation(chatGuid: string) {
  const { supabase } = await requireUser();
  if (chatGuid !== TEST_CHAT_GUID) return; // safety: test contact only
  await supabase.from("messages").delete().eq("chat_guid", chatGuid);
  await supabase.from("ai_runs").delete().eq("chat_guid", chatGuid);
  await supabase.from("notifications").delete().eq("chat_guid", chatGuid);
  await supabase.from("conversation_state").delete().eq("chat_guid", chatGuid);
  revalidatePath("/inbox");
  revalidatePath("/");
}

// Bulk one-off send: render the message per contact (merge fields) and queue it
// for everyone selected. Skips opted-out / missing. Returns how many queued.
export async function sendBulkNow(
  contactIds: string[],
  body: string,
): Promise<{ queued: number; skipped: number }> {
  const { supabase, userId } = await requireUser();
  const text = (body ?? "").trim();
  const ids = Array.isArray(contactIds) ? [...new Set(contactIds.filter(Boolean))] : [];
  if (!text || ids.length === 0) return { queued: 0, skipped: ids.length };

  const { data } = await supabase
    .from("contacts")
    .select("*")
    .in("id", ids)
    .eq("opted_out", false);
  const contacts = (data ?? []) as Contact[];

  const inputs: EnqueueInput[] = contacts.map((c) => ({
    ownerId: userId,
    chatGuid: c.chat_guid ?? chatGuidForPhone(c.phone),
    contactId: c.id,
    body: renderForContact(text, c),
    source: "bulk",
  }));
  const queued = inputs.length ? await enqueueBulk(supabase, inputs) : 0;
  revalidatePath("/");
  return { queued, skipped: ids.length - contacts.length };
}

// ---------------- one-off send ----------------
export async function sendNow(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const contactId = String(formData.get("contact_id") ?? "").trim() || null;
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) redirect("/compose?error=Message+is+empty");

  let chatGuid = "";
  if (contactId) {
    const { data: c } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .maybeSingle();
    const contact = c as Contact | null;
    if (!contact) redirect("/compose?error=Contact+not+found");
    chatGuid = contact!.chat_guid ?? chatGuidForPhone(contact!.phone);
  } else if (rawPhone) {
    chatGuid = chatGuidForPhone(toE164(rawPhone));
  } else {
    redirect("/compose?error=Pick+a+contact+or+enter+a+number");
  }

  await enqueueMessage(supabase, {
    ownerId: userId,
    contactId,
    chatGuid,
    body,
    source: "manual",
  });

  // Kick the pump so a single one-off goes out immediately (gate permitting).
  try {
    await runPump(1);
  } catch {
    /* the cron will pick it up */
  }

  const chat = encodeURIComponent(chatGuid);
  revalidatePath(`/inbox/${chat}`);
  redirect(`/inbox/${chat}`);
}

// ---------------- bulk campaign ----------------
export async function createCampaign(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const name = String(formData.get("name") ?? "").trim() || "Campaign";
  const templateId = String(formData.get("template_id") ?? "").trim() || null;
  let body = String(formData.get("body") ?? "");

  if (templateId && !body) {
    const { data: t } = await supabase
      .from("templates")
      .select("body")
      .eq("id", templateId)
      .maybeSingle();
    body = (t?.body as string) ?? "";
  }

  const segment = segmentFromForm(formData);
  const contacts = await resolveSegment(supabase, userId, segment);
  if (contacts.length === 0) redirect("/campaigns/new?error=Segment+matched+0+contacts");

  const { data: campaign } = await supabase
    .from("campaigns")
    .insert({
      owner_id: userId,
      name,
      template_id: templateId,
      body,
      segment,
      total: contacts.length,
      status: "active",
    })
    .select("id")
    .single();

  const inputs: EnqueueInput[] = contacts.map((c) => ({
    ownerId: userId,
    contactId: c.id,
    chatGuid: c.chat_guid ?? chatGuidForPhone(c.phone),
    body: renderForContact(body, c),
    source: "bulk",
    campaignId: campaign?.id ?? null,
  }));
  await enqueueBulk(supabase, inputs);

  // Nudge the pump; the rest drips out via cron under the throttle gate.
  try {
    await runPump(1);
  } catch {
    /* cron handles it */
  }

  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaign?.id ?? ""}`);
}

export async function setCampaignStatus(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id) return;
  await supabase.from("campaigns").update({ status }).eq("id", id);
  // Pausing/canceling halts not-yet-sent messages for this campaign.
  if (status === "paused" || status === "canceled") {
    await supabase
      .from("messages")
      .update({ status: "canceled" })
      .eq("campaign_id", id)
      .eq("status", "queued");
  }
  revalidatePath(`/campaigns/${id}`);
}

// ---------------- scheduled sends ----------------
export async function createScheduledSend(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const contactId = String(formData.get("contact_id") ?? "").trim() || null;
  const templateId = String(formData.get("template_id") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim() || null;
  const runAtLocal = String(formData.get("run_at") ?? "");
  const recurrence = String(formData.get("recurrence") ?? "").trim() || null;

  if (!runAtLocal) redirect("/scheduler?error=Pick+a+date/time");
  const runAt = new Date(runAtLocal).toISOString();

  const useSegment = formData.get("use_segment") === "on";
  const segment = useSegment ? segmentFromForm(formData) : null;

  await supabase.from("scheduled_sends").insert({
    owner_id: userId,
    contact_id: useSegment ? null : contactId,
    segment,
    template_id: templateId,
    body,
    run_at: runAt,
    recurrence,
    status: "active",
  });
  revalidatePath("/scheduler");
  redirect("/scheduler");
}

export async function deleteScheduledSend(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (id) await supabase.from("scheduled_sends").delete().eq("id", id);
  revalidatePath("/scheduler");
}

// ---------------- message ops ----------------
export async function requeueMessage(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabase
    .from("messages")
    .update({
      status: "queued",
      attempts: 0,
      available_at: new Date().toISOString(),
      error: null,
      claimed_at: null,
    })
    .eq("id", id);
  try {
    await runPump(1);
  } catch {
    /* cron */
  }
  revalidatePath("/");
}
