// Throttle defaults + UI estimates. Actual spacing is enforced at claim time by
// the global gate in app_settings (see claim_next_send in the migration), so
// bulk rows are simply enqueued with available_at = now() and dripped out.

import type { AppSettings } from "./types";

// Spacing is deliberately slow: ~2-3 min between sends (min_delay + up to
// jitter = 120-180s). Bursty, evenly-timed sending is a spam signal, so we
// keep a long, randomized gap to stay under informal limits.
export const THROTTLE_DEFAULTS = {
  min_delay_seconds: 120,
  jitter_seconds: 60,
  daily_cap: 40,
  batch_size: 10,
  send_window_start: 9,
  send_window_end: 18,
  timezone: "America/New_York",
} as const;

// Average seconds between sends given current settings.
export function avgGapSeconds(s: Pick<AppSettings, "min_delay_seconds" | "jitter_seconds">): number {
  return s.min_delay_seconds + s.jitter_seconds / 2;
}

// Human-readable estimate of how long a batch of N messages will take to drain,
// accounting for the per-day cap.
export function estimateDrain(
  count: number,
  s: Pick<AppSettings, "min_delay_seconds" | "jitter_seconds" | "daily_cap">,
): string {
  if (count <= 0) return "nothing to send";
  const perDay = Math.max(1, s.daily_cap);
  const days = Math.ceil(count / perDay);
  const todayCount = Math.min(count, perDay);
  const seconds = Math.round(todayCount * avgGapSeconds(s));
  const human = humanizeSeconds(seconds);
  if (days <= 1) return `≈ ${count} messages over ~${human}`;
  return `≈ ${count} messages over ${days} days (~${human}/day, cap ${perDay})`;
}

export function humanizeSeconds(total: number): string {
  if (total < 60) return `${total}s`;
  const m = Math.round(total / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}
