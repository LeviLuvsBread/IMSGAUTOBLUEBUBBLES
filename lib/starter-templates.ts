// Outreach templates for Blackbridge Management, voiced as Gabriel — written to
// read like a real person texting, NOT a marketing blast: short, casual, no
// em-dashes, no salesy clichés, one easy question. Seeded into Templates and
// reloadable via "Load starter pack". All editable.
//
// Merge fields resolve to the RECIPIENT: {{first_name}}, {{name}}, {{company}},
// {{email}}, {{phone}}. Sender identity (Gabriel / Blackbridge) is baked in.
export type StarterTemplate = { name: string; body: string };

export const STARTER_TEMPLATES: StarterTemplate[] = [
  // ── Warm-up / first touch ────────────────────────────────────────────────
  {
    name: "Warm-up · First touch",
    body: "Hey {{first_name}}, it's Gabriel with Blackbridge. We help business owners get working capital fast, not a ton of paperwork. You guys looking for any funding right now?",
  },
  {
    name: "Warm-up · Casual opener",
    body: "Hey {{first_name}}, Gabriel here with Blackbridge. You currently looking for any working capital, or all good for now?",
  },
  {
    name: "Warm-up · Question hook",
    body: "Hey {{first_name}}, it's Gabriel at Blackbridge. If you could get some working capital this week without much hassle, would that help right now?",
  },
  {
    name: "Warm-up · Value (speed)",
    body: "Hey {{first_name}}, Gabriel with Blackbridge. We can usually get a decision same day and funding in a day or two. Want me to see what you'd qualify for?",
  },
  {
    name: "Warm-up · Value (flexible use)",
    body: "Hey {{first_name}}, it's Gabriel at Blackbridge. Funds can go toward payroll, inventory, equipment, whatever you need. Worth a quick look?",
  },

  // ── Re-warm / re-engage cold leads ───────────────────────────────────────
  {
    name: "Re-warm · Reconnect",
    body: "Hey {{first_name}}, it's Gabriel from Blackbridge. We talked a while back about funding. Is now a better time to take another look?",
  },
  {
    name: "Re-warm · Check-in",
    body: "Hey {{first_name}}, Gabriel from Blackbridge. Our programs have changed a lot since we last talked. Still want to explore options?",
  },
  {
    name: "Re-warm · Win-back (declined before)",
    body: "Hey {{first_name}}, it's Gabriel at Blackbridge. We added some new lenders since we last spoke, so you might qualify now even if you didn't before. Worth a quick recheck?",
  },
  {
    name: "Re-warm · Long gap",
    body: "Hey {{first_name}}, Gabriel from Blackbridge. Been a while! You still looking into funding for the business, or all set for now?",
  },

  // ── Follow-ups (within an ongoing thread) ────────────────────────────────
  {
    name: "Follow-up · Bump 1",
    body: "Hey {{first_name}}, just bumping this back up. Want me to send over a couple quick details on funding?",
  },
  {
    name: "Follow-up · Bump 2",
    body: "Hey {{first_name}}, did you get a chance to think it over? No rush, just lmk if now's a good time.",
  },
  {
    name: "Follow-up · Final (break-up)",
    body: "Hey {{first_name}}, I'll leave it here so I'm not bugging you. If funding ever comes up down the road just text me. Gabriel",
  },

  // ── Qualification (mid-conversation) ─────────────────────────────────────
  {
    name: "Qualify · Quick qualify",
    body: "Got it. Roughly how much do you do in monthly revenue, and how long have you been in business?",
  },
  {
    name: "Qualify · Amount needed",
    body: "Got it. Ballpark, how much were you looking to get?",
  },
  {
    name: "Qualify · Timing",
    body: "Makes sense. You trying to move on this soon, or more just feeling it out?",
  },

  // ── Objection handling ───────────────────────────────────────────────────
  {
    name: "Objection · Send me info",
    body: "Yeah for sure. Easiest is a quick 5 min call so I only send what actually fits. Mornings or afternoons better for you?",
  },
  {
    name: "Objection · What are the rates?",
    body: "Good question. It really depends on a few things specific to your business, so I don't want to throw out a wrong number. Quick call and I'll get you real ones. Got 5 min today?",
  },
  {
    name: "Objection · Too busy",
    body: "Totally get it. Want me to just text you the 2-3 things we'd need so you can glance at it when things slow down?",
  },
  {
    name: "Objection · Not interested",
    body: "All good, appreciate you letting me know. If anything changes down the road you've got my number. Gabriel",
  },
  {
    name: "Objection · Already have funding",
    body: "Nice. A lot of owners still like having a backup lined up so they're never stuck. Want me to keep one on file just in case? No pressure.",
  },

  // ── Booking the call ─────────────────────────────────────────────────────
  {
    name: "Booking · Offer times",
    body: "Cool. What's better for a quick call, later today or tomorrow? Won't take more than 5-10 min.",
  },
  {
    name: "Booking · Confirm",
    body: "Perfect, you're set. I'll call you then. Anything comes up just text me here.",
  },
  {
    name: "Booking · Reschedule",
    body: "No worries, stuff happens. When's better for you this week?",
  },

  // ── Re-engage / renewal / referral / goodwill ────────────────────────────
  {
    name: "Re-engage · Seasonal push",
    body: "Hey {{first_name}}, Gabriel from Blackbridge. A lot of owners are getting set up with capital before things get busy. Want me to check what's available for you?",
  },
  {
    name: "Renewal · Existing client",
    body: "Hey {{first_name}}, it's Gabriel at Blackbridge. You've been paying down nicely, which usually means you can renew or bump up the funding. Want me to take a look?",
  },
  {
    name: "Referral · Ask",
    body: "Hey {{first_name}}, glad we could help you out! Quick favor, know any other owners who could use quick funding? Happy to take good care of them too.",
  },
  {
    name: "Goodwill · Holiday",
    body: "Happy holidays {{first_name}}! Hope you and the team have a great one. Here whenever you need us. Gabriel",
  },
  {
    name: "Thanks · After call",
    body: "Thanks for the time today {{first_name}}, good talking. I'll get you the next steps shortly. Text me anytime.",
  },
];
