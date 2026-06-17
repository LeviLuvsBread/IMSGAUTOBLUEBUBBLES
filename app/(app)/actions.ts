"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { enqueueMessage, enqueueBulk, type EnqueueInput } from "@/lib/queue/enqueue";
import { resolveSegment } from "@/lib/segments";
import { renderForContact, extractVariables } from "@/lib/templating";
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  revalidatePath("/settings");
  redirect("/settings");
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
