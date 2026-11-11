# Oak Social V3 Stage 2 — service layer (not deployable)

Adds `staffService.js` with database-backed session lookup, login/logout, staff creation, disabling with session revocation, audit events and basic login-attempt throttling. Adds tests.

**Not integrated with HTTP routes or Next.js yet. Do not deploy or expose this as a login system.** Existing endpoints and proxy remain unchanged. In particular, login rate limits need a concurrency-safe database enforcement mechanism before internet exposure; the current query-then-insert can race. No super-admin bootstrap is included. Stage 3 must wire all routes, cookie/CSRF handling, server-side permissions, initial admin bootstrap, and the browser login UI with integration tests.

Run offline tests:

```sh
docker run --rm --network none -v "$PWD/services/social-api:/app:ro" -w /app node:22-alpine node --test test/staffAuth.test.js test/staffService.test.js
```
