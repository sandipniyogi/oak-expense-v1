# Stage 3B4B3 — render/export optimistic concurrency protection

- All generated artifacts commit with a revision check against `updated_at`.
- If a project is edited during generation, the stale output is rejected and deleted.
- Successful generated artifacts reset project status to draft, clear scheduling, and record the authenticated editor. Approval must be repeated.
- Scheduled/published projects cannot be regenerated through these routes.

## Limitations before deployment

- These are source-level regression tests, not database concurrency tests.
- Timestamp revision comparison should be replaced by an integer revision counter for robust high-concurrency use; PostgreSQL timestamps can theoretically collide.
- A later phase should make file lifecycle and DB transaction recovery more robust.
- No migration or Docker restart is part of this patch.
