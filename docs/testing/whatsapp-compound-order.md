# Compound order and early location regression — 2026-10-22

Previously, a counted multi-product message went through the one-selection interpreter, and a native location before the delivery step could be ignored. The new draft stage retains the whole request. Counted product names, chicken piece totals and side flavors/sizes are resolved against the live application catalog. Unknown clauses remain unresolved; no partial basket is silently applied.

For 18 pieces, the server proposes actual package combinations (12 + 6 with the tested catalog); it does not confuse 18 pieces with 18 packages. Side sizes must be supplied. The proposal shows quantities, flavors and current prices before acceptance. Required modifiers still need resolution. Unrequested optional paid extras are omitted. The ordinary final confirmation remains mandatory and server-side order validation is unchanged.

Native locations arriving during product selection, size clarification or name collection are checked by DeliveryService and retained in the same checkout. The bot asks only for missing name/address/reference fields and does not request the location again. Invalid coverage and disabled delivery cannot become approved shipment. Human takeover, cancellation, store pauses and cutoff retain their precedence.

Tests cover early and later location, mixed side sizes, duplicate webhook IDs, a repeated order while collecting the name, correcting “puedes” to “purés” without losing later items, invalid coverage, changed price/availability, cutoff, human intervention, injection, and final-confirmation idempotency. A synthetic checkout reached $577 with the fixture's $60 zone and the 18-piece/four-large-side selection; that shipping fee is not production configuration.

Validation: production build and TypeScript passed; 195 compiled tests passed with one existing skip; source/compiled runtime parity passed; 147 prior simulated conversations / 1,299 turns passed. An additional nine-turn synthetic conversation used the current public production catalog and live Anthropic writer, reaching the final summary with all items and coordinates intact. No production orders or customer messages were created. See the adjacent JSON for that transcript.

This deliberately does not guess an unrecognized product, preparation requirement or package. It preserves the request and asks for clarification; arbitrary phrasing is not guaranteed to be understood.
