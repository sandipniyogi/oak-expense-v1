# Real host verification connector — read-only deployment

This adds REAL Mac-live/VPS-live inspection, not the fixture provider. It does not enable production write gating or automatic all-module replication. The existing staging lock remains locked. Keep automatic code deployment paused.

## Run on the Mac

1. Apply the source patch using its installer; it checks current staging file hashes first.
2. Install the dedicated read-only SSH verifier (requires one private root password entry):

```bash
python3 scripts/setup-strict-verifier.py --project "$HOME/Desktop/oak-expense-v1"
```

This generates a separate Ed25519 key under ~/.ssh, appends one restricted forced-command authorization on the VPS, and installs /opt/oak-strict-verifier/agent.py. It does not replace existing SSH keys or restart/change Docker applications. The key cannot run arbitrary SSH commands or forward ports. Existing authorized_keys is backed up before appending. A changed verifier agent is backed up before replacement. No admin password is saved. Its small configuration is stored separately at ~/Library/Application Support/OakAutomation/strict-verifier.json, mode 0600. Existing config.json, the stable engine and scheduler are unchanged.

3. Run real verification:

```bash
python3 scripts/verify-live-sync.py --project "$HOME/Desktop/oak-expense-v1"
```

No password should be needed after setup. Each invocation fetches approved origin/main; checks runtime source hashes for nine live components; uses a fresh nonce over SSH; and compares content using explicit seed-ID/FK mappings. Unknown table fields are retained. Duplicate semantic keys, dangling mapped foreign keys and missing data fail verification. Both hosts must respond; old reports are never reused. Database snapshots use a read-only repeatable-read transaction. SQLite uses a read-only connection and read transaction. Business rows stay within the inspecting host process; only source hashes, content digests and counts are returned.

The report contains observed_business_content_matches, source_mismatches, data_differences and counts. It ALWAYS returns write_permission_granted=false and production_gate_ready=false. An observed match is not a safe production write permit. Exit 0 means observed agreement; exit 2 means differences; exit 1 means inspection failed or a peer could not be verified.

This reads MAC LIVE/VPS LIVE, not the 16-record local staging database. It deliberately never authorizes staging writes using live evidence. Reads still consume CPU/memory and can time out for large databases/files; run manually at a quiet time, not every save or every few seconds. SSH/network failures must be investigated without bypassing host-key checking.

## Data scope and limits

- Every public PostgreSQL table is included, as are column metadata, constraint definitions, public-source FK metadata and non-internal trigger definitions.
- Seed category/location IDs and declared references are mapped by unique semantic identities; timestamps are ignored only for the exact policies identified in the prior reports. Tombstone identity remains included. This does NOT rekey or apply data.
- Referenced expense screenshots are verified through the existing five-table bridge, including combined-payment references.
- Restaurant content tables are included except local sessions, audit and Instagram cache. Settings media references, menu/event media references and file content are checked; unreferenced upload files are preserved and excluded.
- Social assets/thumbs/renders/exports are compared; tmp is excluded.
- PostgreSQL functions, sequence state, dependency versions, compiled frontend environment values, extra untracked runtime source files, cross-schema completeness and SQLite schema equivalence are NOT fully attested. The report expressly cannot grant permission.
- Observations across services and hosts are sequential while existing live applications can write. No claim of atomic agreement or continuous online status is made.

## Existing expense synchronization preview

```bash
python3 scripts/preview-expense-sync.py --project "$HOME/Desktop/oak-expense-v1"
```

This invokes ONLY the installed engine's dry-run CLI and reuses its runner lock. It never applies a merge. An empty response (busy scheduler) fails closed. It retains pending/conflict/baseline files and does not change the installed engine. Five-table expense preview is not all-module synchronization.

## Remaining before production unlocking

The actual live transactional write barrier, all-module replication/conflict adapters, coordinator-to-peer routing, guarded background/CLI operations, per-component deployment manifests and post-write recovery still need implementation and validation. The connector is not wired into the staging Check & Sync button in this patch: accepting live evidence there would verify a different database from the one being changed. The next integration requires explicit peer/environment binding and protected sync authority.

Do not enable strict mode on live merely because both digests match. Do not overwrite one full database, clear tombstones or remove unused screenshots. The requested strict behavior remains: both systems must refuse new changes when either cannot be verified. Network failure after permit issuance requires defined in-flight transaction fencing and recovery, not a cached green status.

## Validation

13 new local tests cover normalization/FK/deletion semantics, decimal precision, non-mutation, stale nonce rejection, incomplete scope and the rule that real agreement alone cannot grant write permission. The 31 uploaded coordinator/content/guard tests also pass. Embedded Node probe syntax was checked. Live Docker/PostgreSQL/SSH execution is pending your run; no production validation is claimed.
