// Provider abstraction so the BlueBubbles bridge can be swapped later (e.g. a
// dedicated Mac mini or a hosted iMessage gateway) without touching app logic.

export interface SendInput {
  chatGuid: string; // "iMessage;-;+14155551234"
  message: string;
  tempGuid: string; // our durable idempotency key
}

export interface SendResult {
  /**
   * true means "submitted" — NOT "delivered". Because AppleScript sends are
   * async and often stall past our HTTP timeout, a timeout is treated as an
   * optimistic submit, not a failure. Real delivery is confirmed by webhook.
   */
  ok: boolean;
  acceptedAt: string; // ISO timestamp when we issued the call
  providerMessageGuid?: string; // data.guid if the (unreliable) response returned one
  /** true only for definitive rejections (4xx like bad recipient/auth). */
  hardFail?: boolean;
  error?: string;
}

// One attachment on a BlueBubbles message, normalized.
export interface ProviderAttachment {
  guid: string;
  mime: string | null;
  name: string | null;
  size: number | null;
  width?: number | null;
  height?: number | null;
}

// Normalized form of a BlueBubbles "Message" object (from webhook or polling).
export interface ProviderMessage {
  guid: string;
  text: string;
  isFromMe: boolean;
  chatGuid: string;
  handleAddress?: string;
  service?: string;
  dateCreated?: string; // ISO
  dateDelivered?: string; // ISO
  dateRead?: string; // ISO
  tempGuid?: string; // present only if a future BB version echoes it
  errorCode?: number;
  associatedMessageGuid?: string;
  attachments?: ProviderAttachment[];
}

export interface HealthResult {
  ok: boolean;
  pong?: boolean;
  info?: unknown;
  error?: string;
}

export interface MessageProvider {
  /** Fire-and-forget with a short timeout. Never blocks on AppleScript. */
  sendMessage(input: SendInput): Promise<SendResult>;
  /** Read recent messages in a chat (reconciliation / backfill). */
  getChatMessages(
    chatGuid: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<ProviderMessage[]>;
  /** Normalize a raw BlueBubbles Message `data` object. */
  normalize(raw: unknown): ProviderMessage;
  ping(): Promise<boolean>;
  getInfo(): Promise<unknown>;
  health(): Promise<HealthResult>;
}
