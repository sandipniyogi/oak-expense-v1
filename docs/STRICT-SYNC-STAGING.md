# Strict sync staging enforcement rehearsal

This patch is a staging-only foundation, NOT complete production synchronization. Keep automatic code deployment paused. Do not promote or merge it to main yet.

## Delivered

Server-side guards run before routes in expense, inventory, keg, social and AI APIs. Restaurant uses a native HTTP guard. Phone saves reach the guarded expense API. Direct POST/PUT/PATCH/DELETE requests fail closed in strict mode without a coordinator. GET/HEAD/OPTIONS browsing continues. AI POST inference is conservatively blocked too. Restaurant login/logout affect only local session/audit state and remain available.

The expense UI has a status panel and Check & Sync action. The action reports a clear refusal because no live sync adapter is installed. It does NOT synchronize business data in this patch. The default flag is off; existing live deployments are untouched.

A tested coordinator serializes both peers' writes, requires a fresh trusted provider check at each acquisition, persists the permit before returning, and relocks after completion. Stale success, offline peers, unavailable Git approval, mismatch, incomplete scope and provider errors block writes. It never expires an outstanding write automatically. Restart or uncertain completion retains the lock. State is atomic, fsynced and mode 0600. Only one coordinator process is supported; active/active/multiple-process operation is unsupported.

The provided fixture adapter is for isolated tests only. It does not contact real GitHub or either host and its sync function copies nothing. It binds to localhost and labels responses as rehearsal; guards reject those responses without explicit rehearsal opt-in. Never connect fixtures to live data or expose coordinator credentials to browsers.

The content comparison policy handles the observed category/location IDs using declared foreign-key mappings, keeps deletion identities, and separately handles narrow restaurant/social timestamp differences. It rejects ambiguous keys and dangling references. Unknown-table fields are preserved. This library does not merge/rekey/apply records. Full-scope verification and replication adapters remain to be implemented.

## Apply and test on the Mac

The installer requires the staging branch at approved commit 42a65b11ca64b9580b77224f592f6325bd5a61cf. It checks original hashes and refuses unexpected changes. It backs up source, copies the patch only, and executes no Docker/SSH/deployment operation.

```bash
python3 "$HOME/Downloads/oak-strict-sync-staging/apply.py" \
  --project "$HOME/Desktop/oak-expense-v1" --apply
cd "$HOME/Desktop/oak-expense-v1"
node --test services/strict-sync/test/*.test.mjs
python3 scripts/start-all-staging.py --strict-lock
python3 scripts/check-strict-staging.py
```

Node tests can also run through Docker on the user's machine:

```bash
docker run --rm -v "$PWD:/work:ro" -w /work node:24-alpine \
  node --test services/strict-sync/test/content-policy.test.mjs \
  services/strict-sync/test/protocol.test.mjs \
  services/strict-sync/test/source-wiring.test.mjs
```

Open http://localhost:3100. Browsing should work; the sync panel should report locked/unavailable. Clicking Check & Sync must report that the live adapter is not installed. Do not use real-data entry for this lock test. The status check script submits no business mutations.

Strict mode needs ALREADY initialized staging tables. It skips expense/inventory/keg/social startup migrations/seeding, disables social scheduling, and blocks expense bridge init/apply/file_put. Schema changes/bootstrap are separate explicit operations before entering strict mode. The existing live daily scheduler and stable engine are not modified.

The all-staging command does not activate restaurant strict mode or promote/rebuild restaurant. Native restaurant strict integration is covered by a real SQLite HTTP test in restaurant/test/strict-sync.test.mjs. A dedicated restaurant staging overlay remains needed for cross-module Docker testing. Do not export a global strict flag and run a live helper.

Restore normal staging configuration:

```bash
python3 scripts/start-all-staging.py
```

## Production work still required

No live all-module adapters, automatic replication, host connectivity, migration/conflict engine, deployment gate, or production unlocking exist in this patch. Required next: authenticated outbound Mac connectivity; per-component approved artifact checks; full transactional schema/constraint/sequence and content snapshots; safe module-specific replication with ID mappings; DB fencing covering in-flight transactions, background workers and CLI operations; interrupted recovery; server-authorized/CSRF-protected Sync Now; and staging failure tests on real containers.

A permit is a point-in-time verification, not proof of uninterrupted connectivity throughout a transaction. Instantaneous network failure detection is impossible. Define transaction boundaries, timeout/fencing and recovery before making production guarantees. A whole-database overwrite or dropping tombstones/files is not an acceptable shortcut.

Last observations: business expense rows and 137 referenced screenshots match; unreferenced regular uploads Mac 2 / VPS 5. Seed IDs/timestamps differ across inventory/restaurant; social settings and tombstone identity match except timestamps. These are historical observations, not current write authorization.

Local validation includes the new protocol/content/guard tests, native restaurant strict test, existing restaurant tests, and 31 existing automation tests. Docker Desktop builds and browser behavior remain pending on the user's Mac.
