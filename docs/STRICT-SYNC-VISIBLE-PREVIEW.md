# Visible local replication rehearsal

Run `python3 scripts/run-sync-preview.py` from the project root, then open the printed 127.0.0.1 URL (default port 3190). Keep Terminal running; Ctrl+C stops the preview. This is a separate test page, not the real expense or restaurant site. Docker and extra Python packages are not required.

Two real SQLite stores and a durable control journal persist under backups/sync-preview-v1. They contain only synthetic expense/menu records. The actual Mac live database, staging data, VPS, GitHub, receipt uploads and restaurant media are never read or modified. The VPS-labelled panel is a second local database, not a remote VPS connection.

Normal edits require both fixture peers online, both fixture code approvals enabled, no recovery journal, identical records on both sides, and equality with the last synchronized baseline. One edit relocks further edits until Check & Sync completes. Reads remain available.

The merge compares each whole JSON record with the prior baseline. Independent record edits merge; concurrent edits to the same record and edit/delete conflicts require an explicit side selection. There is no field-level merge or silent newest-timestamp winner. Deletes are represented by absence relative to the saved baseline. Explicit conflict selection updates only the merge baseline for that record; click Check & Sync to apply it.

Sync persists a before/target journal before changing either peer, applies both, verifies equality and then advances the baseline. Simulated interruption stops after the first peer apply. Recovery can roll forward only when each store equals its recorded before or target snapshot; unexpected data blocks recovery. Restart preserves pending recovery. Recovery cannot bypass offline or approval checks.

The conflict-injection button is intentionally test-only and bypasses normal edit locking to produce two independent conflicting edits. Offline and approval switches are fixtures, not real network/Git verification. The server binds only 127.0.0.1 and requires same-origin/token-protected mutation requests. Never expose this demo through Caddy or a public port.

Twelve engine tests cover forward/reverse sync, deletion, independent records, conflicts, explicit selection, offline/approval denial, restart recovery and unexpected-data rejection. Run `python3 automation/sync_preview/test_engine.py`.

This rehearsal is not wired to the earlier permit coordinator, PostgreSQL, actual restaurant schemas, media replication or real SSH connectors. Those integrations, schema/identity migration, production permissions and distributed fencing remain unfinished. No live synchronization guarantee follows from this demo. Keep PR #9 draft and deployment paused.
