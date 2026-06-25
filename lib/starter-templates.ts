// The only conversation starters Blackbridge uses: three cold-outreach openers
// voiced as Ben (direct funder, no broker). Short, casual, no em-dashes, no
// salesy clichés, one easy question. Seeded into Templates and reloadable via
// "Load starter pack". All editable.
//
// Each body uses {a|b|c} "spintax" (see lib/templating.ts): at send time one
// option per group is picked at random, so the SAME template goes out worded
// differently to each person instead of an identical blast — which is what
// trips spam filters. Keep options short and in Ben's voice; don't put merge
// fields inside a {a|b} group.
//
// These are intentionally generic (no merge fields) — they go out cold to a new
// applicant where we only have the app. The AI takes over the back-and-forth
// from the reply onward.
export type StarterTemplate = { name: string; body: string };

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    name: "Cold outreach v1",
    body: "{Ben|Ben here}, owner of BlackBridge. {Got your app|Saw your application come through}, but {there was no amount requested on it|the amount needed was left blank}. How much {are you looking for|do you need}?",
  },
  {
    name: "Cold outreach v2",
    body: "{Ben here|Hey, it's Ben}, owner of BlackBridge. Got your app but {there's no amount requested on it|the amount field came through blank}. {Reaching out direct so we both dodge the broker fees|Going straight to you so neither of us eats a broker cut}. How much {are you looking for|were you trying to raise}?",
  },
  {
    name: "Cold outreach v3",
    body: 'Ben {here|with you} from BlackBridge. Got your app, but the "amount needed" was {blank|left empty}. {Reaching you direct so neither of us pays the broker cut|Coming straight to you so there\'s no broker in the middle}. What {are you looking for|do you need to get done}?',
  },
];
