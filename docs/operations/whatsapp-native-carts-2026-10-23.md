# Native WhatsApp carts

The captured card's four units are two product lines: 1 × six chicken pieces ($145) and 3 × small sides ($20 each). The native product IDs are 8332872696748532 and 7399986960082668.

## Changes

- Read order contents through the authenticated Evolution MEX checkout query instead of the obsolete thrift IQ. The provider checks the connected seller, validates every ID/quantity, and returns no customer token or quoted price.
- Read the public business catalog via the current WhatsApp GraphQL query with bounded pagination when the legacy catalog endpoint is unavailable.
- Created 28 explicit seller-scoped catalog mappings, verified by product identity, description and price. Prices are always read again from the app.
- Added three distinct catalog products with their published prices/options: Tacos dorados de pollo ($58), Vaso de salsa de sabores ($25), Aderezos ($25). Existing product records were preserved. Malteada remains disabled according to the platform.
- Native carts skip optional upsells, ask required choices, then proceed to missing checkout fields. “Uno de cada uno” splits three small sides into individually configured order items. It cannot exceed the requested quantity.
- A later explicit addition retains the checkout and collected fields.
- A native item count inconsistent with returned quantities fails closed rather than accepting a partial cart.

## Evidence

Public catalog read: 28 products across paginated responses; all mappings read back from the database.
Database backup: /private/tmp/pollon-native-links-before.json.
Provider commit: 33891cdfae2ac5e7de42417fc2f30239e33397c4.
242 compiled API tests passed; one existing test skipped. Typecheck, production build and runtime checks passed. 147 regression conversations / 1,317 turns passed.
Live Anthropic: 7 synthetic turns, 14 successful API calls, production menu and saved mappings, four-unit draft total $205. Order-details transport simulated; no real customer messages or production orders.
The isolated checkout test confirms the order through the normal order service exactly once, including duplicate-confirmation protection and all four configured items.
The already staff-held customer chat was not resumed or replayed.

Protocol references:
- https://github.com/WhiskeySockets/Baileys/issues/2717
- https://github.com/WhiskeySockets/Baileys/pull/2799
