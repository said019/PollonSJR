# Compiled API runtime

From the repository root, run `npm ci`, `npm run build:api:production`,
`npm run typecheck --workspace=apps/api`, `npm run test:api:compiled` and
`npm run test:api:runtime`.

The source stays unchanged. esbuild compiles the local TypeScript graph before
deployment. Node loads vendor packages and Prisma normally; no runtime transpiler
is required. Wallet PNGs are copied byte-for-byte beside the bundled module,
preserving its `__dirname/pass-assets` lookup. Uploads still use the existing
UPLOADS_DIR/cwd policy, and Drive mode/secrets are untouched.

Configure only the Railway API service's config path as `/railway-api.json`.
The API service root stays at the monorepo root. This file intentionally is not
the default railway.json, so the web service does not inherit the API commands.
The migration command remains before startup and must be checked for pending or
changed migrations before publishing. This change adds no migrations or seed.

The runtime test starts original TypeScript and the compiled artifact with the
same synthetic database, Redis and cron substitutes. It compares all registered
route methods/paths and six scheduler registrations, checks HTTP liveness,
synthetic database/Redis health, unauthenticated admin rejection, protected
upload rejection, and notification-worker startup. No task callbacks execute.
The 37 existing unit tests also run from compiled JavaScript. This is not a live
payment, WhatsApp, Drive upload or signed Wallet end-to-end test.

The fixture's RSS numbers exclude launcher processes and use mocked external
services. They establish runtime-overhead direction, not production savings.
Compare production resource usage over equivalent windows after rollout.

Rollback: restore the API service's previous null config-file path and redeploy
the last known-good Git commit. Preserve the previous variable values, all
storage modes, credentials and data. Never roll back customer data.
