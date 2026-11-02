# Restaurant handler permit integration — rehearsal only

Actual server.mjs handlers now support an injected permitAdapterFactory only when strict mode is enabled, OAK_STRICT_REHEARSAL=1 and createApp environment is strict-rehearsal. The normal server entrypoint supplies no factory, so restaurant strict writes remain blocked. No production schema, data, deployment configuration or replication is installed.

Menu/event upserts and deletes, settings and their audit records run together inside the adapter transaction. Upload receipt and audit commit after an immutable file is durable. The adapter retains its default test receipt table and now permits a validated receipt-table name and uploads directory. A captured server-only claim crosses the native HTTP handler boundary explicitly; browser input cannot supply it. Strict Instagram refresh remains blocked. Local login/logout sessions and login audit retain their existing local policy.

Nine new tests exercise actual authenticated HTTP handlers against disposable restaurant schemas. Eight earlier tests also run, covering default strict locking and process-crash recovery. No real GitHub or Mac/VPS replication is tested; offline detection is a fixture. The second SQLite database is local. SQLite controllers still use the test fence and test receipt schema, and filesystem single-writer ownership remains unfinished.

Restaurant test coordinator dependencies now live inside restaurant/scripts/strict-sync-runtime so the Docker build context is self-contained. Its transaction-context module re-exports the parent module to preserve the single request AsyncLocalStorage. Other runtime files match the canonical coordinator source at this patch revision. Future coordinator changes must update these copies and rerun tests.

The runner copies source only into a random staging-container /tmp folder, gives that folder to the existing container user, runs all 17 included tests as that user, and cleans up as root. No restart or rebuild occurs. Production services and original data are not touched.

Keep PR #9 draft and automatic deployment paused. Required remaining work includes real replicated storage, production controls/migrations, restricted file ownership, a real fenced verification provider and coordinated recovery. Passing these handler tests does not enable production writes.
