# Natural question routing regression — 2026-10-22

The screenshot's “Buenas tardes tienes servicio el día de hoy” was excluded by the pre-classifier regex. The live classifier understood it, but the handler routed it to product selection instead. General conversational text now reaches semantic classification; explicit choices, security/manual handling, personal checkout fields and confirmation keep their existing precedence. Common current-service questions have a deterministic path that works without AI and does not consume the model budget.

Responses answer the requested topic without an unsolicited menu or claiming an existing order. Open-service replies are short; schedule details appear when asked. Product prices no longer carry unrelated disclaimers. Unknown ingredients remain unconfirmed. The writer still cannot alter protected facts, money or commands; duplicate greetings and stacked courtesy lines are rejected.

Regression coverage includes the original wording across open/paused/closed states and checkout stages; unpunctuated queries missed by regex; ordinary checkout and final confirmation; first-message ambiguity; and staff takeover through a synthetic delivery/location/transfer conversation based on the supplied screenshots. No real customer chats were messaged and no production orders were created.

Validation: TypeScript passed; production build passed; 186 compiled tests passed, 1 existing skip; source/compiled runtime parity passed; 147 simulated conversations / 1,299 turns passed. Ten synthetic cases used the configured production Anthropic model, with all assertions passing (see accompanying JSON). These are regression checks, not a guarantee against every possible phrasing.
