# Oak Social V3 — Stage 1 (foundation only)

This patch adds standalone authentication primitives, a PostgreSQL migration, and unit tests. It does **not** activate login, change routes, create users, or make the existing API secure for public access.

## Tests (Mac with Docker)

```sh
cd /Users/sandip/Desktop/oak-social-push
docker run --rm --network none -v "$PWD/services/social-api:/app:ro" -w /app node:22-alpine node --test test/staffAuth.test.js
```

## Migration

`services/social-api/migrations/003_staff_auth.sql` is for isolated staging review only. Do not run on production. It creates staff, sessions, login-attempt and audit tables without default credentials.

## Next required work before staging exposure

- Create bootstrap administrator CLI (never ship default password).
- Add login/logout and server-side session validation, revocation, rate limiting, and CSRF.
- Apply role checks to **all** API routes, including reads and static assets.
- Replace public Next.js rewrite with an authenticated gateway and update `socialFetch`.
- Update approval UI to identify and audit staff; verify approval and scheduling concurrency.
- Test authorization and browser flows end-to-end in isolated staging.
