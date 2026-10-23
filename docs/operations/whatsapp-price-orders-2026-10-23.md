# Natural package requests and complement changes

Requests such as “el paquete de pollo de 135 al Oxxo de la gasolinera servifácil” resolve against current, fixed-price combo/package products. A unique match starts a draft; multiple matches require a choice, revalidated against the current catalog. The customer's amount never sets a product price.

The written destination stays in the same checkout. Coordinates, coverage, delivery cost, facade reference and contact details remain required by the existing delivery flow. Required complement selections accept “2 purés en lugar de la ensalada” and equivalent phrases. The catalog's options, quotas and prices remain authoritative; partial substitutions preserve other selections. Changes at confirmation invalidate the old confirmation. Confirmed orders require staff review; staff-held conversations stay silent.

Validation:
- 236 compiled tests passed, one existing test skipped, zero failures.
- 147 existing simulated conversations / 1,317 turns passed.
- Added eight tests covering captured wording, full delivery checkout, complement changes, stale confirmations, ambiguous prices, changed catalog, quotas and human hold.
- Live Anthropic evaluation with production's public catalog: 10 synthetic turns, 20 successful API calls, final draft Combo Pareja $135 + simulated $60 delivery = $195.
- No real customer messages or production orders created by tests.
- API typecheck, production build, runtime checks passed.
