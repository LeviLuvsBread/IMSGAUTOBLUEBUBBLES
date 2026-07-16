// Hand-written row types mirroring supabase/migrations/0001_init.sql.
// Kept simple (no generated Database type) for a single-user app.

export type MessageDirection = "out" | "in";
export type MessageStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "canceled"
  | "received";

export interface Contact {
  id: string;
  owner_id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  tags: string[];
  notes: string | null;
  chat_guid: string | null;
  opted_out: boolean;
  created_at: string;
  updated_at: string;
}

export interface Template {
  id: string;
  owner_id: string;
  name: string;
  body: string;
  variables: string[];
  created_at: string;
  updated_at: string;
}

// One file attached to a message (photo, video, PDF, …), as captured from the
// BlueBubbles webhook. Bytes are streamed on demand via /api/attachment/[guid].
export interface MessageAttachment {
  guid: string;
  mime: string | null;
  name: string | null; // original filename ("IMG_0123.heic")
  size: number | null; // bytes
  width?: number | null;
  height?: number | null;
}

export interface Message {
  id: string;
  owner_id: string;
  contact_id: string | null;
  chat_guid: string;
  direction: MessageDirection;
  body: string;
  status: MessageStatus;
  source: string;
  attachments?: MessageAttachment[] | null;
  campaign_id: string | null;
  scheduled_send_id: string | null;
  bb_temp_guid: string | null;
  bb_message_guid: string | null;
  associated_guid: string | null;
  error: string | null;
  attempts: number;
  max_attempts: number;
  available_at: string;
  claimed_at: string | null;
  bb_date_created: string | null;
  bb_date_delivered: string | null;
  bb_date_read: string | null;
  ai_generated: boolean;
  ai_pending_approval: boolean;
  created_at: string;
  sent_at: string | null;
  updated_at: string;
}

export interface Campaign {
  id: string;
  owner_id: string;
  name: string;
  template_id: string | null;
  body: string | null;
  segment: Segment;
  total: number;
  status: "active" | "paused" | "done" | "canceled";
  created_at: string;
}

export interface ScheduledSend {
  id: string;
  owner_id: string;
  contact_id: string | null;
  segment: Segment | null;
  template_id: string | null;
  body: string | null;
  run_at: string;
  recurrence: string | null;
  status: "active" | "paused" | "done" | "canceled";
  last_run_at: string | null;
  created_at: string;
}

export interface AppSettings {
  id: boolean;
  min_delay_seconds: number;
  jitter_seconds: number;
  daily_cap: number;
  batch_size: number;
  send_window_start: number | null;
  send_window_end: number | null;
  timezone: string;
  next_send_allowed_at: string;
  sends_today: number;
  sends_today_date: string;
  bb_url: string | null;
  paused: boolean;
  ai_enabled: boolean;
  ai_autosend: boolean;
  ai_max_turns: number;
  ai_persona: string | null;
  ai_knowledge: string | null;
  updated_at: string;
}

export interface Segment {
  tags?: string[];
  company?: string;
  contact_ids?: string[];
  all?: boolean;
}

// ---------- AI conversational agent (0002_ai.sql) ----------

export type ConversationStatus =
  | "active"
  | "needs_reply"
  | "generating"
  | "escalated"
  | "opted_out"
  | "done";

export type LifecycleStage =
  | "new"
  | "engaged"
  | "warming"
  | "interested"
  | "ready_for_handover"
  | "handed_off"
  | "closed";

export interface ConversationState {
  owner_id: string;
  chat_guid: string;
  contact_id: string | null;
  status: ConversationStatus;
  lifecycle_stage: LifecycleStage;
  ai_autopilot: boolean;
  ai_turns: number;
  last_inbound_message_id: string | null;
  last_processed_inbound_id: string | null;
  claimed_at: string | null;
  qualification: Record<string, unknown>;
  handover_summary: string | null;
  ready_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AiStageKind = "classify" | "research" | "draft" | "judge" | "finalize";

export interface AiStage {
  id: string;
  owner_id: string;
  position: number;
  name: string;
  kind: AiStageKind;
  model: string;
  prompt: string;
  enabled: boolean;
  can_block: boolean;
  created_at: string;
}

export type AiRunOutcome =
  | "replied"
  | "held"
  | "escalated"
  | "opted_out"
  | "no_reply"
  | "max_turns"
  | "error";

export interface AiRunStage {
  name: string;
  model: string;
  verdict: string;
  analysis: string;
  draft?: string;
  ms?: number;
  tokens?: number;
}

export interface AiRun {
  id: string;
  owner_id: string;
  chat_guid: string;
  inbound_message_id: string | null;
  outcome: AiRunOutcome;
  final_reply: string | null;
  stages: AiRunStage[];
  created_at: string;
}

export type NotificationType = "handover" | "escalation" | "opt_out";

export interface AppNotification {
  id: string;
  owner_id: string;
  type: NotificationType;
  chat_guid: string | null;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}
