// Default outreach templates — MCA / business-funding focused, SMS-length,
// conversational, and compliance-minded (no rate/term/approval promises, easy
// opt-out tone). Seeded into the Templates page by default and reloadable any
// time via "Load starter pack". All are fully editable + deletable.
//
// Merge fields available (see lib/templating.ts): {{first_name}}, {{name}},
// {{company}}, {{email}}, {{phone}}. Swap "[Name]"/"[Company]" for your own
// once and they're yours.
export type StarterTemplate = { name: string; body: string };

export const STARTER_TEMPLATES: StarterTemplate[] = [
  // ── Warm-up / first touch ────────────────────────────────────────────────
  {
    name: "Warm-up · First touch",
    body: "Hi {{first_name}}, this is [Name] with [Company]. We help business owners get quick, flexible working capital with minimal paperwork. Worth a 2-min chat to see what {{company}} could line up for?",
  },
  {
    name: "Warm-up · Casual opener",
    body: "Hey {{first_name}}! Quick one — is {{company}} looking for any working capital right now, or are you all set?",
  },
  {
    name: "Warm-up · Question hook",
    body: "Hey {{first_name}} — if you could get {{company}} a chunk of working capital this week with almost no paperwork, would that be useful right now?",
  },
  {
    name: "Warm-up · Value (speed)",
    body: "Hi {{first_name}}, the best part of what we do: most decisions come back same day and funding can land in 24–48 hrs. Want me to see what {{company}} could qualify for?",
  },
  {
    name: "Warm-up · Value (flexible use)",
    body: "Hey {{first_name}} — payroll, inventory, equipment, or just a cushion: the funds can be used however {{company}} needs them. Worth a quick look?",
  },

  // ── Re-warm / re-engage cold leads ───────────────────────────────────────
  {
    name: "Re-warm · Reconnect",
    body: "Hi {{first_name}}, it's [Name] following back up. We talked a while back about funding for {{company}}. Timing is everything — is now any better to revisit it?",
  },
  {
    name: "Re-warm · Check-in",
    body: "Hey {{first_name}}, circling back — our programs have changed a lot since we last spoke. Still open to exploring options for {{company}}?",
  },
  {
    name: "Re-warm · Win-back (declined before)",
    body: "Hi {{first_name}}, we've added new lenders since we last talked, so {{company}} may qualify now even if it didn't before. Worth a 2-min recheck?",
  },
  {
    name: "Re-warm · Long gap",
    body: "Hey {{first_name}}, been a minute! Hope {{company}} is doing great. If working capital is on your radar this quarter, I'd love to help — just say the word.",
  },

  // ── Follow-ups (no response) ─────────────────────────────────────────────
  {
    name: "Follow-up · Bump 1",
    body: "Hi {{first_name}}, just floating this back to the top of your inbox. Happy to send a couple quick details on funding for {{company}} whenever you've got a sec.",
  },
  {
    name: "Follow-up · Bump 2",
    body: "Hey {{first_name}}, did you get a chance to think it over? No pressure — just let me know if now's a good time to look at options for {{company}}.",
  },
  {
    name: "Follow-up · Final (break-up)",
    body: "Hey {{first_name}}, I'll stop reaching out after this so I'm not a bother. If funding for {{company}} is ever useful down the road, just reply and I'm here. 👍",
  },

  // ── Qualification ────────────────────────────────────────────────────────
  {
    name: "Qualify · Quick qualify",
    body: "{{first_name}}, so I can point you to the right option — roughly what does {{company}} do in monthly revenue, and how long have you been in business?",
  },
  {
    name: "Qualify · Amount needed",
    body: "Got it {{first_name}} — ballpark, how much working capital would actually move the needle for {{company}} right now?",
  },
  {
    name: "Qualify · Timing",
    body: "Makes sense {{first_name}}. Is this something you'd want to move on this week, or more just exploring for {{company}} down the line?",
  },

  // ── Objection handling ───────────────────────────────────────────────────
  {
    name: "Objection · Send me info",
    body: "Absolutely {{first_name}} — fastest way is a quick 5-min call so I only send what's actually relevant to {{company}}. Mornings or afternoons better for you?",
  },
  {
    name: "Objection · What are the rates?",
    body: "Good question {{first_name}} — it really depends on a few things specific to {{company}}, so I don't want to quote you something off. A quick call gets you real numbers. Got 5 min today?",
  },
  {
    name: "Objection · Too busy",
    body: "Totally get it {{first_name}} — that's exactly why we keep it simple. Want me to text you the 2–3 things we'd need so you can glance when {{company}} slows down?",
  },
  {
    name: "Objection · Not interested",
    body: "Totally understand, {{first_name}} — appreciate you letting me know. If anything changes for {{company}}, you've got my number. Wishing you a great one!",
  },
  {
    name: "Objection · Already have funding",
    body: "Love that {{first_name}}. A lot of owners still like having a backup option ready for {{company}} so they're never stuck. Want me to keep one on file for you, no obligation?",
  },

  // ── Booking the call ─────────────────────────────────────────────────────
  {
    name: "Booking · Offer times",
    body: "Great {{first_name}}! What works better for a quick call — later today or sometime tomorrow? I'll keep it to 5–10 minutes.",
  },
  {
    name: "Booking · Confirm",
    body: "Perfect, {{first_name}} — you're set. I'll call you then. If anything comes up, just text me right here. Talk soon!",
  },
  {
    name: "Booking · Reschedule",
    body: "No worries {{first_name}} — life happens. When's a better time for you and {{company}} this week?",
  },

  // ── Re-engage / renewal / referral / goodwill ────────────────────────────
  {
    name: "Re-engage · Seasonal push",
    body: "Hi {{first_name}}, a lot of owners are getting {{company}} set up with capital before the busy season hits. Want me to check what's available for you right now?",
  },
  {
    name: "Renewal · Existing client",
    body: "Hey {{first_name}}, you've been paying down nicely — that usually opens the door to renew or increase funding for {{company}}. Want me to take a look?",
  },
  {
    name: "Referral · Ask",
    body: "{{first_name}}, glad we could help {{company}}! Quick favor — know any other owners who could use fast funding? Happy to take great care of them too.",
  },
  {
    name: "Goodwill · Holiday",
    body: "Happy holidays from our team, {{first_name}}! Wishing you and everyone at {{company}} a strong finish to the year. 🎉 Here whenever you need us.",
  },
  {
    name: "Thanks · After call",
    body: "Thanks for the time today, {{first_name}}! Great chatting. I'll follow up with the next steps for {{company}} shortly — reach out anytime in the meantime.",
  },
];
