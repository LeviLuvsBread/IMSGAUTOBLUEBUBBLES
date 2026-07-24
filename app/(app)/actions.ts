"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { enqueueMessage, enqueueOpeners, type EnqueueInput } from "@/lib/queue/enqueue";
import { resolveSegment } from "@/lib/segments";
import { partitionByOpened } from "@/lib/last-contacted";
import { renderForContact, extractVariables } from "@/lib/templating";
import { STARTER_TEMPLATES } from "@/lib/starter-templates";
import { TEST_CHAT_GUID } from "@/lib/test-contact";
import { toE164, chatGuidForPhone } from "@/lib/chat";
import { runPump } from "@/lib/queue/pump";
import { applyOptOut } from "@/lib/queue/opt-out";
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

// Manual hard opt-out for a whole thread — the "this is not actually a lead"
// button on handover/escalation surfaces. Flags the contact (stays marked on
// the Contacts page), cancels queued sends, stops sequences, and closes the
// conversation so it leaves the handover list and the AI never re-engages.
export async function optOutThread(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const chatGuid = String(formData.get("chat_guid") ?? "").trim();
  if (!chatGuid) return;
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("chat_guid", chatGuid)
    .maybeSingle();
  await applyOptOut(supabase, userId, chatGuid, contact?.id ?? null);
  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${encodeURIComponent(chatGuid)}`);
  revalidatePath("/contacts");
}

// Bulk hard opt-out — the inbox multi-select. Same routine as optOutThread,
// applied to every selected thread.
export async function optOutThreads(
  items: { chatGuid: string; contactId: string | null }[],
): Promise<{ optedOut: number }> {
  const { supabase, userId } = await requireUser();
  const list = Array.isArray(items)
    ? items.filter((i) => i && typeof i.chatGuid === "string" && i.chatGuid)
    : [];
  for (const it of list) {
    let contactId = it.contactId ?? null;
    if (!contactId) {
      const { data: c } = await supabase
        .from("contacts")
        .select("id")
        .eq("chat_guid", it.chatGuid)
        .maybeSingle();
      contactId = c?.id ?? null;
    }
    await applyOptOut(supabase, userId, it.chatGuid, contactId);
  }
  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/contacts");
  revalidatePath("/queue");
  return { optedOut: list.length };
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
  updated: number;
}> {
  const { supabase, userId } = await requireUser();
  const { data: existing } = await supabase
    .from("templates")
    .select("id, name, body");
  const byName = new Map(
    (existing ?? []).map((t: { id: string; name: string; body: string }) => [
      t.name.trim().toLowerCase(),
      t,
    ]),
  );

  let added = 0;
  let updated = 0;
  for (const t of STARTER_TEMPLATES) {
    const match = byName.get(t.name.trim().toLowerCase());
    const variables = extractVariables(t.body);
    if (!match) {
      await supabase
        .from("templates")
        .insert({ owner_id: userId, name: t.name, body: t.body, variables });
      added++;
    } else if (match.body !== t.body) {
      // Refresh an existing starter to the latest (spintax) wording. Only
      // when the body differs, so reloading an up-to-date pack is a no-op.
      await supabase
        .from("templates")
        .update({ body: t.body, variables })
        .eq("id", match.id);
      updated++;
    }
  }

  revalidatePath("/templates");
  return { added, updated };
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
      // The AI only writes openers now — ai_knowledge guides those; the
      // responder toggles are gone with the reply pipeline.
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
  revalidatePath("/queue");
}

// Cancel every outbound message currently waiting in the send queue.
// Soft-cancel (status 'canceled') keeps the history instead of deleting.
export async function clearQueue(): Promise<{ canceled: number }> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("messages")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("direction", "out")
    .eq("status", "queued")
    .select("id");
  revalidatePath("/");
  revalidatePath("/queue");
  return { canceled: data?.length ?? 0 };
}

// Set the send order of the queue. `orderedIds` is top-first (index 0 sends
// next). We stamp available_at one second apart, all in the recent past, so
// claim_next_send (which orders by available_at) drains them in exactly this
// order. The throttle gate still paces the actual sends ~2-3 min apart.
export async function reorderQueue(orderedIds: string[]) {
  const { supabase } = await requireUser();
  const base = Date.now();
  const n = orderedIds.length;
  const stamp = new Date().toISOString();
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase
        .from("messages")
        .update({
          available_at: new Date(base - (n - i) * 1000).toISOString(),
          updated_at: stamp,
        })
        .eq("id", id)
        .eq("direction", "out")
        .eq("status", "queued"),
    ),
  );
  revalidatePath("/queue");
}

// The AI responder (drafts, per-thread autopilot, test harness) was removed:
// the AI writes only the initial opener; every conversation is handled by the
// owner. Inbound replies just land in the inbox flagged as needing attention.

// Bulk one-off send: render the message per contact (merge fields) and queue it
// for everyone selected. Skips opted-out / missing AND anyone who has already
// received their opener (partitionByOpened — the hard no-double-opener rule, so
// re-sending to "last batch" / a re-uploaded list never texts the same person
// twice). Returns queued, opted-out skips, and already-texted skips separately.
export async function sendBulkNow(
  contactIds: string[],
  body: string,
): Promise<{ queued: number; skipped: number; alreadyTexted: number }> {
  const { supabase, userId } = await requireUser();
  const text = (body ?? "").trim();
  const ids = Array.isArray(contactIds) ? [...new Set(contactIds.filter(Boolean))] : [];
  if (!text || ids.length === 0)
    return { queued: 0, skipped: ids.length, alreadyTexted: 0 };

  const { data } = await supabase
    .from("contacts")
    .select("*")
    .in("id", ids)
    .eq("opted_out", false);
  const contacts = (data ?? []) as Contact[];
  const optedOutOrMissing = ids.length - contacts.length;

  // Hard rule: drop anyone already opened before we queue anything.
  const { eligible, alreadyOpened } = await partitionByOpened(supabase, contacts);

  const inputs: EnqueueInput[] = eligible.map((c) => ({
    ownerId: userId,
    chatGuid: c.chat_guid ?? chatGuidForPhone(c.phone),
    contactId: c.id,
    body: renderForContact(text, c),
    source: "bulk",
  }));
  const queued = inputs.length ? await enqueueOpeners(supabase, inputs) : 0;
  revalidatePath("/");
  return {
    queued,
    skipped: optedOutOrMissing,
    alreadyTexted: alreadyOpened.length,
  };
}

// Auto outreach: queue an AI-written opener for each selected contact. The text
// is generated just-in-time by the pump (anchored to the user's cold-outreach
// templates), so each person gets a unique, on-message opener. We enqueue a
// spintax-varied template as the body now — it's both the fallback if the AI
// call fails and the style anchor. Skips opted-out / missing.
export async function sendBulkAuto(
  contactIds: string[],
): Promise<{ queued: number; skipped: number; alreadyTexted: number }> {
  const { supabase, userId } = await requireUser();
  const ids = Array.isArray(contactIds)
    ? [...new Set(contactIds.filter(Boolean))]
    : [];
  if (ids.length === 0) return { queued: 0, skipped: 0, alreadyTexted: 0 };

  const { data } = await supabase
    .from("contacts")
    .select("*")
    .in("id", ids)
    .eq("opted_out", false);
  const contacts = (data ?? []) as Contact[];
  const optedOutOrMissing = ids.length - contacts.length;
  if (contacts.length === 0)
    return { queued: 0, skipped: optedOutOrMissing, alreadyTexted: 0 };

  // Hard rule: an AI opener is still an opener — never send one to a contact
  // who has already been reached.
  const { eligible, alreadyOpened } = await partitionByOpened(supabase, contacts);
  if (eligible.length === 0)
    return {
      queued: 0,
      skipped: optedOutOrMissing,
      alreadyTexted: alreadyOpened.length,
    };

  // Anchor templates: the user's cold-outreach templates, else the starters.
  const { data: tpls } = await supabase.from("templates").select("name, body");
  const cold = (tpls ?? [])
    .filter((t: { name: string }) => /cold outreach/i.test(t.name))
    .map((t: { body: string }) => t.body);
  const anchors = cold.length ? cold : STARTER_TEMPLATES.map((t) => t.body);

  const inputs: EnqueueInput[] = eligible.map((c) => {
    const anchor = anchors[Math.floor(Math.random() * anchors.length)];
    return {
      ownerId: userId,
      chatGuid: c.chat_guid ?? chatGuidForPhone(c.phone),
      contactId: c.id,
      body: renderForContact(anchor, c), // spintax-varied fallback + anchor
      source: "auto_outreach",
    };
  });
  const queued = inputs.length ? await enqueueOpeners(supabase, inputs) : 0;
  revalidatePath("/");
  revalidatePath("/queue");
  return {
    queued,
    skipped: optedOutOrMissing,
    alreadyTexted: alreadyOpened.length,
  };
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
  // A segment with no filters resolves to EVERY contact — block a blast to the
  // whole book from an accidentally-empty selection (mirrors createScheduledSend).
  if (!segment.all && !segment.company && !segment.tags?.length && !segment.contact_ids?.length) {
    redirect("/campaigns/new?error=Pick+a+tag,+company,+contacts,+or+All+contacts");
  }
  const contacts = await resolveSegment(supabase, userId, segment);
  if (contacts.length === 0) redirect("/campaigns/new?error=Segment+matched+0+contacts");

  // Hard rule: a campaign is an opener blast — drop anyone already reached so
  // it can't re-text a contact who's had their initial message.
  const { eligible } = await partitionByOpened(supabase, contacts);
  if (eligible.length === 0)
    redirect("/campaigns/new?error=Everyone+in+that+segment+has+already+been+texted");

  const { data: campaign } = await supabase
    .from("campaigns")
    .insert({
      owner_id: userId,
      name,
      template_id: templateId,
      body,
      segment,
      total: eligible.length,
      status: "active",
    })
    .select("id")
    .single();

  const inputs: EnqueueInput[] = eligible.map((c) => ({
    ownerId: userId,
    contactId: c.id,
    chatGuid: c.chat_guid ?? chatGuidForPhone(c.phone),
    body: renderForContact(body, c),
    source: "bulk",
    campaignId: campaign?.id ?? null,
  }));
  await enqueueOpeners(supabase, inputs);

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

  // A segment with no filters resolves to EVERY contact — guard against a
  // recurring "text the whole book daily" send created by leaving the fields
  // blank. Require at least one filter, or the explicit "All contacts" box.
  if (useSegment) {
    const s = segment as Segment;
    const empty =
      !s.all && !s.company && !(s.tags?.length) && !(s.contact_ids?.length);
    if (empty)
      redirect("/scheduler?error=Pick+a+tag,+company,+or+check+All+contacts+for+the+segment");
  } else if (!contactId) {
    redirect("/scheduler?error=Pick+a+contact+or+a+segment+to+send+to");
  }

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
  if (!id) return;
  // A single-contact reminder is exempt from the opener-once rule. Deleting its
  // schedule orphans the reminder's messages (FK is ON DELETE SET NULL), leaving
  // them source='scheduled' — indistinguishable from an opener walk. Re-tag them
  // 'reminder' BEFORE the delete so they can never be mistaken for a duplicate
  // opener later. Segment openers keep 'scheduled'.
  const { data: sched } = await supabase
    .from("scheduled_sends")
    .select("contact_id")
    .eq("id", id)
    .maybeSingle();
  if (sched?.contact_id) {
    await supabase
      .from("messages")
      .update({ source: "reminder" })
      .eq("scheduled_send_id", id)
      .eq("source", "scheduled");
  }
  await supabase.from("scheduled_sends").delete().eq("id", id);
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
