# Oak Social V3 Stage 3A — middleware primitives

This patch adds unmounted authentication/authorization and exact-origin middleware with unit tests.

It intentionally does **not** create public login routes, modify Next.js rewrites, or run migrations.
Do **not** deploy it as a completed login solution. Next steps: implement and test protected gateway,
login/logout routes with secure cookie and CSRF, admin bootstrap, role-checked Social API routes,
and end-to-end tests against isolated staging PostgreSQL.
