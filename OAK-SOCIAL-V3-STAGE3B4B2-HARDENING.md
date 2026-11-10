# Stage 3B4B2 hardening (offline only)

Apply the previously checked 3B4B2 draft first, then this incremental patch.

- Editing project content always returns status to draft.
- Approval decisions are blocked after scheduling or marking published.
- Three additional source-wiring regression tests.

**Not deployment ready:** Source-wiring tests are not HTTP/database integration tests. Render/export race safety, complete edit-history self-approval prevention, and migration/staging validation remain outstanding. No Docker restart or DB migration.
