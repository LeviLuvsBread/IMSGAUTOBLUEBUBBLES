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

export interface Message {
  id: string;
  owner_id: string;
  contact_id: string | null;
  chat_guid: string;
  direction: MessageDirection;
  body: string;
  status: MessageStatus;
  source: string;
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
  updated_at: string;
}

export interface Segment {
  tags?: string[];
  company?: string;
  contact_ids?: string[];
  all?: boolean;
}
