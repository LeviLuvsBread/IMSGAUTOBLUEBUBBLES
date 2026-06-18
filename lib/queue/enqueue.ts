import type { SupabaseClient } from "@supabase/supabase-js";

export interface EnqueueInput {
  ownerId: string;
  chatGuid: string;
  body: string;
  contactId?: string | null;
  source?: string; // manual | bulk | scheduled | sequence | reply | ai
  campaignId?: string | null;
  scheduledSendId?: string | null;
  availableAt?: string; // ISO; defaults to now
  aiGenerated?: boolean; // produced by the AI pipeline
  aiPendingApproval?: boolean; // held draft — claim_next_send won't send until approved
}

function toRow(input: EnqueueInput) {
  return {
    owner_id: input.ownerId,
    contact_id: input.contactId ?? null,
    chat_guid: input.chatGuid,
    direction: "out" as const,
    body: input.body,
    status: "queued" as const,
    source: input.source ?? "manual",
    campaign_id: input.campaignId ?? null,
    scheduled_send_id: input.scheduledSendId ?? null,
    bb_temp_guid: crypto.randomUUID(),
    available_at: input.availableAt ?? new Date().toISOString(),
    ai_generated: input.aiGenerated ?? false,
    ai_pending_approval: input.aiPendingApproval ?? false,
  };
}

// Enqueue a single outbound message (status 'queued'). The cron pump drips it
// out under the global throttle gate.
export async function enqueueMessage(
  supabase: SupabaseClient,
  input: EnqueueInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("messages")
    .insert(toRow(input))
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

// Bulk enqueue (campaigns / scheduled bulk). Returns the number inserted.
export async function enqueueBulk(
  supabase: SupabaseClient,
  inputs: EnqueueInput[],
): Promise<number> {
  if (inputs.length === 0) return 0;
  const rows = inputs.map(toRow);
  const { error, count } = await supabase
    .from("messages")
    .insert(rows, { count: "exact" });
  if (error) throw error;
  return count ?? rows.length;
}
