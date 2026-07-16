import type {
  AttachmentSendInput,
  HealthResult,
  MessageProvider,
  ProviderAttachment,
  ProviderMessage,
  SendInput,
  SendResult,
} from "./types";

// Convert a BlueBubbles epoch-ms timestamp to ISO (handles seconds/ms/null).
function toIso(ts: unknown): string | undefined {
  if (ts == null) return undefined;
  const n = typeof ts === "number" ? ts : Number(ts);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // BlueBubbles uses epoch milliseconds.
  return new Date(n).toISOString();
}

// HTTP statuses that mean "BB rejected this request" → don't blindly retry.
const HARD_FAIL_STATUSES = new Set([400, 401, 403, 404, 422]);

export class BlueBubblesProvider implements MessageProvider {
  constructor(
    private readonly base: string,
    private readonly password: string,
    private readonly sendTimeoutMs = 5000,
  ) {}

  private url(path: string, extra?: Record<string, string>): string {
    const u = new URL(path, this.base.replace(/\/+$/, "") + "/");
    u.searchParams.set("password", this.password);
    if (extra) for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
    return u.toString();
  }

  async sendMessage({ chatGuid, message, tempGuid }: SendInput): Promise<SendResult> {
    const acceptedAt = new Date().toISOString();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.sendTimeoutMs);
    try {
      const res = await fetch(this.url("api/v1/message/text"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          chatGuid,
          tempGuid,
          message,
          method: "apple-script",
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const hardFail = HARD_FAIL_STATUSES.has(res.status);
        let detail = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j?.error?.message) detail += `: ${j.error.message}`;
          else if (j?.message) detail += `: ${j.message}`;
        } catch {
          /* ignore body parse errors */
        }
        return { ok: false, acceptedAt, hardFail, error: detail };
      }

      const json = await res.json().catch(() => ({}));
      return {
        ok: true,
        acceptedAt,
        providerMessageGuid: json?.data?.guid,
      };
    } catch (e) {
      // Abort/timeout/network error. The AppleScript send routinely succeeds
      // even when the HTTP call never returns, so treat this as an OPTIMISTIC
      // submit (ok:true, not hardFail). Delivery is confirmed later by webhook.
      const isAbort = e instanceof Error && e.name === "AbortError";
      return {
        ok: true,
        acceptedAt,
        error: isAbort ? "timeout-optimistic" : `network: ${String(e)}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // Multipart file send. Attachments upload + AppleScript-send slower than
  // text, so the timeout is generous; like sendMessage, an abort/network error
  // is treated as an optimistic submit (webhook confirms real delivery).
  async sendAttachment({
    chatGuid,
    tempGuid,
    name,
    mime,
    data,
  }: AttachmentSendInput): Promise<SendResult> {
    const acceptedAt = new Date().toISOString();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45_000);
    try {
      const form = new FormData();
      form.set("chatGuid", chatGuid);
      form.set("tempGuid", tempGuid);
      form.set("name", name);
      form.set("method", "apple-script");
      form.set("attachment", new Blob([data], { type: mime }), name);
      const res = await fetch(this.url("api/v1/message/attachment"), {
        method: "POST",
        headers: { "ngrok-skip-browser-warning": "true" },
        body: form,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const hardFail = HARD_FAIL_STATUSES.has(res.status);
        let detail = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j?.error?.message) detail += `: ${j.error.message}`;
          else if (j?.message) detail += `: ${j.message}`;
        } catch {
          /* ignore body parse errors */
        }
        return { ok: false, acceptedAt, hardFail, error: detail };
      }
      const json = await res.json().catch(() => ({}));
      return { ok: true, acceptedAt, providerMessageGuid: json?.data?.guid };
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      return {
        ok: true,
        acceptedAt,
        error: isAbort ? "timeout-optimistic" : `network: ${String(e)}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async getChatMessages(
    chatGuid: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<ProviderMessage[]> {
    const res = await fetch(
      this.url(`api/v1/chat/${encodeURIComponent(chatGuid)}/message`, {
        limit: String(opts?.limit ?? 50),
        offset: String(opts?.offset ?? 0),
        with: "handle",
        sort: "DESC",
      }),
      { method: "GET", headers: { "ngrok-skip-browser-warning": "true" } },
    );
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({}));
    const data = Array.isArray(json?.data) ? json.data : [];
    return data.map((d: unknown) => this.normalize(d));
  }

  normalize(raw: unknown): ProviderMessage {
    const d = (raw ?? {}) as Record<string, any>;
    const chats = Array.isArray(d.chats) ? d.chats : [];
    const handle = d.handle ?? (Array.isArray(d.handles) ? d.handles[0] : undefined);
    const rawAtts = Array.isArray(d.attachments) ? d.attachments : [];
    const attachments: ProviderAttachment[] = rawAtts
      .filter((a: Record<string, any>) => a?.guid && !a?.hideAttachment)
      .map((a: Record<string, any>) => ({
        guid: String(a.guid),
        mime: a.mimeType ?? a.mime_type ?? null,
        name: a.transferName ?? a.transfer_name ?? null,
        size:
          typeof a.totalBytes === "number"
            ? a.totalBytes
            : typeof a.total_bytes === "number"
              ? a.total_bytes
              : null,
        width: typeof a.width === "number" ? a.width : null,
        height: typeof a.height === "number" ? a.height : null,
      }));
    return {
      guid: d.guid,
      // U+FFFC is the invisible placeholder iMessage puts where an attachment
      // sits in the text — strip it so attachment-only texts read as empty.
      text: String(d.text ?? "").replace(/\uFFFC/g, ""),
      isFromMe: Boolean(d.isFromMe),
      chatGuid: chats[0]?.guid ?? d.chatGuid ?? "",
      handleAddress: handle?.address,
      service: handle?.service,
      dateCreated: toIso(d.dateCreated),
      dateDelivered: toIso(d.dateDelivered),
      dateRead: toIso(d.dateRead),
      tempGuid: d.tempGuid ?? undefined,
      errorCode: typeof d.error === "number" ? d.error : undefined,
      associatedMessageGuid: d.associatedMessageGuid ?? undefined,
      attachments,
    };
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(this.url("api/v1/ping"), {
        method: "GET",
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      const j = await res.json().catch(() => ({}));
      return j?.data === "pong";
    } catch {
      return false;
    }
  }

  async getInfo(): Promise<unknown> {
    const res = await fetch(this.url("api/v1/server/info"), {
      method: "GET",
      headers: { "ngrok-skip-browser-warning": "true" },
    });
    return res.json().catch(() => ({}));
  }

  async health(): Promise<HealthResult> {
    try {
      const pong = await this.ping();
      if (!pong) return { ok: false, pong: false, error: "ping did not return pong" };
      const info = await this.getInfo().catch(() => undefined);
      return { ok: true, pong: true, info };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
}
