// The only conversation starters Blackbridge uses: three cold-outreach openers
// voiced as Ben (direct funder, no broker). Short, casual, no em-dashes, no
// salesy clichés, one easy question. Seeded into Templates and reloadable via
// "Load starter pack". All editable.
//
// These are intentionally generic (no merge fields) — they go out cold to a new
// applicant where we only have the app. The AI takes over the back-and-forth
// from the reply onward.
export type StarterTemplate = { name: string; body: string };

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    name: "Cold outreach v1",
    body: "Ben, owner of BlackBridge. Got your app, but no amount requested on it. How much you looking for?",
  },
  {
    name: "Cold outreach v2",
    body: "Ben here, owner of BlackBridge. Got your app but there's no amount requested on it. Reaching out direct so we both dodge the broker fees. How much you looking for?",
  },
  {
    name: "Cold outreach v3",
    body: 'Ben here from BlackBridge. Got your app, but the "amount needed" was blank. Reaching you direct so neither of us pays the broker cut. What are you looking for?',
  },
];
