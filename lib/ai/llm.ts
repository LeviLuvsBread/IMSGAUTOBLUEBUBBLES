import "server-only";

// Thin OpenRouter (OpenAI-compatible) client. No SDK — one POST, full control
// over JSON parsing/repair. Used by every pipeline stage + the lifecycle eval.
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 30_000;

// OpenAI-style content parts — lets a user message carry images (vision).
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

export type LlmResult = { text: string; tokens: number };

export class LlmError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "LlmError";
    this.status = status;
  }
}

export async function callOpenRouter(
  model: string,
  messages: ChatMessage[],
  opts: {
    json?: boolean;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  } = {},
): Promise<LlmResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new LlmError("OPENROUTER_API_KEY is not set");

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 800,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    let msg = `OpenRouter ${res.status}`;
    try {
      const e = (await res.json()) as { error?: { message?: string } };
      if (e?.error?.message) msg = `OpenRouter ${res.status}: ${e.error.message}`;
    } catch {
      /* non-JSON error body */
    }
    throw new LlmError(msg, res.status);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { total_tokens?: number };
    error?: unknown;
  };
  const choice = data.choices?.[0];
  // Provider/mid-stream errors come back HTTP 200 with finish_reason 'error'.
  if (choice?.finish_reason === "error") {
    throw new LlmError(
      `OpenRouter provider error: ${JSON.stringify(data.error ?? {})}`,
    );
  }
  return {
    text: choice?.message?.content ?? "",
    tokens: data.usage?.total_tokens ?? 0,
  };
}

// Parse a JSON object from a model response, tolerating code fences / stray prose.
export function parseJsonLoose<T = Record<string, unknown>>(
  text: string,
): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    /* try harder below */
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]) as T;
    } catch {
      /* fall through */
    }
  }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1)) as T;
    } catch {
      /* give up */
    }
  }
  return null;
}
