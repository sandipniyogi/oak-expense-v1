# Stage 3B2 — Authenticated API boundary (offline only)

This is an integration draft, not a production-ready release. It removes the direct Next.js rewrite, adds a server route handler, gates API endpoints on staff sessions and permissions, disables legacy approval, and binds the optional host port to loopback.

**Do not deploy or restart containers.** Staff schema migration, admin bootstrap, actual approval endpoint, secure HTTPS origin configuration, and end-to-end browser testing are still required. Existing approval buttons will return 410 until the replacement workflow is implemented. For localhost staging, configure SOCIAL_AUTH_ORIGIN=http://localhost:3100 and SOCIAL_COOKIE_SECURE=false only for local testing. Production must use HTTPS and secure cookies.

Run existing tests offline, and review this patch before applying.
