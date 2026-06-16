# IMSGAUTOBLUEBUBBLES

A **private, single-user** iMessage outreach dashboard. Send one-off, templated,
scheduled, and bulk-with-throttling iMessages from **your own phone number**, and
watch replies arrive in a **live inbox** — all from a phone-installable web app.

It speaks iMessage through a self-hosted **BlueBubbles** server (REST API) and
stores everything in **Supabase**. It deploys to **Vercel**.

```
[ Mac running BlueBubbles ]  ──REST send──▶  iMessage
        ▲   │ webhook (incoming + receipts)
        │   ▼
[ Vercel: Next.js dashboard + API routes + Cron ]
        │  read/write
        ▼
[ Supabase: Postgres + Auth (just you) + Realtime (live inbox) ]
```

---

## How it works (the important bits)

- **Sending is fire-and-forget.** AppleScript sends through BlueBubbles can stall
  for many seconds. We POST with a short timeout, optimistically mark the message
  `sent`, and confirm real delivery later from the BlueBubbles **webhook**.
- **Throttling is enforced by a global "gate."** `app_settings.next_send_allowed_at`
  plus a daily cap mean spacing holds no matter how often the pump runs. Bulk
  sends are just rows that drip out under the gate.
- **The queue is the `messages` table.** One table is both your conversation
  history and the outbound work queue (status state machine:
  `queued → sending → sent → delivered → read`, plus `failed`/`canceled`).
  `claim_next_send()` claims one due row atomically (`FOR UPDATE SKIP LOCKED`),
  so overlapping pump runs never double-send.
- **The pump** (`/api/cron/pump`) reclaims stragglers, materializes due
  scheduled sends/sequences, then drains the queue. Drive it every minute (see
  [Driving the pump](#driving-the-pump)).
- **Provider abstraction.** All iMessage I/O goes through `lib/provider`
  (`MessageProvider`). Swap BlueBubbles for another bridge later without touching
  the app.

---

## Setup

### 0. Prerequisites
- A working **BlueBubbles** server (signed into iMessage, REST API + password,
  Full Disk Access). Private API off is fine — we use `method: "apple-script"`.
- A public HTTPS URL for it (Cloudflare tunnel). See [BB_URL stability](#bb_url-stability).
- A **Supabase** project and a **Vercel** account. Node 18+ locally.

### 1. Supabase
1. Create a project. In **SQL Editor**, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   It creates all tables, RLS, the realtime publication on `messages`, and the
   `claim_next_send` / `reclaim_stale_sending` RPCs, and seeds the singleton
   `app_settings` row.
2. **Auth → Users → Add user** → create *your* email + password (this is the
   only login). Copy that user's **UUID** — it's your `APP_OWNER_ID`.
3. **Project Settings → API**: copy the Project URL, the `anon` key, and the
   `service_role` key.

### 2. Environment variables
Copy [`.env.example`](.env.example) → `.env.local` for dev, and set the same
vars in **Vercel → Settings → Environment Variables**:

| Var | Where it's used | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | safe to expose |
| `SUPABASE_SERVICE_ROLE` | server only | bypasses RLS; never expose |
| `APP_OWNER_ID` | webhook + cron | your auth user UUID |
| `BB_URL` | server only | BlueBubbles base URL (fallback if not stored in DB) |
| `BB_PASSWORD` | server only | BlueBubbles password |
| `WEBHOOK_SECRET` | webhook | random string; appended to the webhook URL |
| `CRON_SECRET` | Vercel cron | random string; Vercel sends it as a Bearer token |
| `PUMP_SECRET` | external pinger | random string for the launchd/cron-job.org pinger |
| `NEXT_PUBLIC_APP_URL` | UI | your deployed URL, for the copy-paste boxes on Settings |

Generate secrets with: `openssl rand -hex 32`.

### 3. Deploy
- Push to GitHub (this repo) and **Import** into Vercel, or `vercel` from the CLI.
- After the first deploy, set `NEXT_PUBLIC_APP_URL` to the real URL and redeploy.

### 4. Local dev
```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # optional
```

### 5. Wire up BlueBubbles webhook
Open the app → **Settings**. It shows the exact **Webhook URL** (with your
`WEBHOOK_SECRET`). In the BlueBubbles app: **API & Webhooks → Add Webhook**,
paste it, and enable at least `new-message` and `updated-message` (and
`server-url-change` if listed). Incoming texts and delivery/read receipts will
now flow into the live inbox.

### 6. Driving the pump
Vercel **Hobby** cron only runs **once per day**, which is fine as a safety
backstop (`vercel.json` is set to a daily run) but not for throttled drip. Pick one:

- **Free (recommended): ping from the always-on Mac.** It already runs 24/7 for
  BlueBubbles, so it adds no new failure domain. On the Mac:
  ```bash
  ./ops/install-pinger.sh your-app.vercel.app "$PUMP_SECRET"
  ```
  This installs a launchd agent that curls `/api/cron/pump` every 60s.
  (Or use a free service like cron-job.org with the same URL — see Settings.)
- **Pro: per-minute Vercel cron.** Upgrade to Vercel Pro and change
  `vercel.json` schedule to `"* * * * *"`, then redeploy. No pinger needed.

Both paths are safe to run simultaneously — sends are serialized in the DB.

---

## BB_URL stability

The free `trycloudflare.com` quick-tunnel URL changes on every BlueBubbles
restart. Two ways to handle it:

1. **Cloudflare *named* tunnel** (best, needs a domain on Cloudflare): map a
   stable hostname (e.g. `bb.yourdomain.com`) to the Mac's `localhost:1234` and
   set `BB_URL` to it once.
2. **Self-healing (no domain):** enable the `server-url-change` webhook. When the
   tunnel URL changes, BlueBubbles posts the new URL to us and we store it in
   `app_settings.bb_url`, which every send reads. `BB_URL` env is just the
   initial/fallback value.

The app supports both; if you have a Cloudflare domain, option 1 is simplest.

---

## Throttle defaults (anti-flag)

Conservative defaults for a real personal number doing partner outreach (edit on
**Settings**):

| Setting | Default | Why |
| --- | --- | --- |
| min delay | 45s | human-ish cadence |
| jitter | 75s | gaps land ~45–120s |
| daily cap | 40 | well under informal personal-number thresholds; ramp slowly |
| send window | 9–18 local | don't text at 3am |

Start lower (cap ~20/day) for the first week on a number, then raise.

---

## Project layout

```
app/
  (app)/            authenticated dashboard (dashboard, inbox, compose,
                    contacts, templates, campaigns, scheduler, settings)
  (app)/actions.ts  all server-action mutations
  api/webhook/      BlueBubbles → upsert (public, secret-gated)
  api/cron/pump/    the throttled send pump (Vercel cron + external pinger)
  api/health/       BlueBubbles ping for the health badge
  login/            single-user auth
lib/
  provider/         MessageProvider interface + BlueBubbles implementation
  queue/            enqueue, pump (drain + materialize), reconcile (match receipts)
  supabase/         browser / server / middleware / admin clients
  chat, templating, throttle, segments, types
supabase/migrations/0001_init.sql
ops/                launchd pinger for the free pump strategy
```

---

## Security notes
- The whole dashboard is behind Supabase Auth (single user) via `middleware.ts`.
- `/api/webhook` and `/api/cron` are public but gated by their own secrets and
  excluded from the auth middleware.
- `SUPABASE_SERVICE_ROLE`, `BB_PASSWORD`, `WEBHOOK_SECRET`, `CRON_SECRET`,
  `PUMP_SECRET` are server-only — never shipped to the browser.

---

## Roadmap / not yet built
- AI-drafted replies (Claude) with a human-approve step before send.
- CSV contact import; richer sequence UI (the engine + `stop_on_reply` exist).
- Offline service worker (manifest/installability already work).
