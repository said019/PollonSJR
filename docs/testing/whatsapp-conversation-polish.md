# Conversation polish — 2026-10-22

Customer reports: repeated location requests, excess messages during checkout, and internal catalog issues surfaced to customers.

## Changes

- Checkout replies carry a revision checked immediately before provider delivery and before a button fallback. Changed checkout state invalidates obsolete queued prompts, including old summaries. Unchanged informational questions preserve a valid pending summary.
- A bounded 1.2-second send window lets consecutive checkout details replace obsolete questions. It does not apply to handoff acknowledgements or transactional notifications.
- Repeated identical delivery details and native coordinates do not enqueue another question. Bare thanks/acknowledgements do not generate extra checkout messages.
- Written address data beginning with “Mi dirección es” is collected as data. A changed written address retains an existing point pending explicit same-location confirmation, rather than immediately asking to resend it.
- An unresolved off-catalog “orden de …” line retains the original request and hands off once with a neutral message. It does not expose missing prices/catalog configuration or silently accept that item. Human attention remains persistent.
- Three identical unsuccessful clarification responses trigger one handoff instead of continuing the loop.

## Verification

- API typecheck and production build: pass.
- Compiled suite: 218 passed, 0 failed, 1 existing database integration skip (219 total).
- Runtime/source parity: pass, 203 identical routes and matching schedules.
- General synthetic conversation suite: 147 conversations / 1,317 turns, all pass.
- Real Anthropic evaluation: 2 successful model calls, neutral single handoff for a synthetic off-catalog request, no reply to the subsequent pickup message. No real customer messages or orders created.
- Mocked provider delivery tests verify actual send suppression for stale prompts, preserved valid summaries, cancellation invalidation, revision changes during button fallback and the brief send window, duplicate details, and a single internal-review acknowledgement.

## Limits

The send guard cannot retract messages already delivered; pre-release queue jobs without revisions are not retroactively rewritten. The off-catalog rule targets unresolved “orden de …” lines; other ambiguities retain their existing clarification behavior. No staff notification number or catalog price was invented, and existing human holds were not cleared.

## Follow-up: compound-order courtesy messages

A remaining path treated bare thanks/acknowledgements in the bundle step as a product clarification. These messages now stay silent and preserve the pending size/quote without accepting an order. Regression coverage sends five courtesy messages both before size selection and after the quote, verifies no outbound jobs/state changes, then resumes normally. Typecheck, build and runtime parity pass; compiled suite: 219 passed, 0 failed, 1 existing skip. General simulations: 147 conversations / 1,317 turns, all pass. No customer messages sent.
