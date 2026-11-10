# Oak Social V3 Stage 3B1 — unmounted staff route module

Adds `services/social-api/src/staffRoutes.js` with login/logout/me/staff-create/staff-disable endpoints, strict-origin checks, session cookies, and permission middleware. **The router is intentionally NOT mounted in index.js.** It is not a working login system yet.

Do not deploy or expose this module until the Next.js authenticated gateway, CSRF/origin configuration, backend port isolation, super-admin bootstrap, and legacy approval endpoint retirement are completed and tested.

Tests: `node --test test/*.test.js` (inside the social-api container). No database migration or restart required.
