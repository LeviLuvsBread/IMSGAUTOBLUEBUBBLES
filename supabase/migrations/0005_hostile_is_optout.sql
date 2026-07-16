-- Hostile / abusive replies are OPT-OUTS, not handovers.
-- Context: a merchant who replied "Fuck you / Stop fucking texting me" was
-- marked ready_for_handover with reason "Abusive language". There is nothing
-- to hand over when someone doesn't want contact — the correct outcome is a
-- hard opt-out (contact flagged, queue canceled, sequences stopped, thread
-- closed). The deterministic guardrail regex now catches directed abuse; this
-- migration aligns the Classifier stage prompt so anything the regex misses
-- is classified opt_out instead of escalate. Escalate stays reserved for
-- explicit call requests and legal/dispute language.
update public.ai_stages
set prompt = $p$You are the first stage of an SMS reply pipeline for a business-funding (merchant cash advance) outreach rep whose goal is to re-warm and ENGAGE leads (a human closes later). Read the conversation and classify the latest inbound: intent, sentiment, and signals. Default verdict='approve' so the rep can reply — INCLUDING when the merchant shows interest, asks about funding, or shares business details (that is exactly what we want; note it via lifecycle_signal like 'engaged' or 'interested' and put any facts in qualification_updates; do NOT escalate for interest). Set verdict='opt_out' if they ask to stop/unsubscribe, say it's the wrong number, OR are hostile/abusive toward the sender (insults, profanity aimed at us, "stop texting me", any wish to not be contacted) — a hostile contact is not a lead; NEVER escalate or hand off abuse, opt it out. Set verdict='escalate' ONLY if they explicitly ask to speak to a person/get a call, or raise legal/dispute matters (attorney, lawsuit, cease and desist). In every other case, 'approve'. Never write a reply.$p$
where kind = 'classify';
