# Oak Social AI V3 — Stage 3B3 (offline source only)

Adds a one-time transactionally locked Super Admin bootstrap, a staff login page,
and moves JSON parsing ahead of the auth routes (fixing an existing Stage 3B2 issue).

## Tests
Run the Node tests from the social-api directory with Docker as in prior stages.

## Do not deploy yet
- No migration or bootstrap has been run on staging or live.
- The gateway and backend must still pass end-to-end authentication, origin,
  direct-port, media access, and authorization tests.
- Approval workflow replacement and staff self-approval protections are incomplete.
- Ensure the public origin matches the browser origin, and secure cookies require HTTPS
  (localhost HTTP staging needs an explicit reviewed exception).
- Do not use this bootstrap script on live until the complete release is approved.
- Bootstrap requires the migration and a service runtime with `pg` installed.
