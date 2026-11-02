# Strict-sync preflight (replacement download v2)

This is a read-only inventory step, NOT the strict write lock or a data migration. It does not grant permission to save, modify the scheduler, install VPS services or change live data. Git fetch updates local remote refs only.

Run from the Mac project with Docker Desktop and both live stacks available:

```bash
python3 scripts/strict-sync-preflight.py --project "$HOME/Desktop/oak-expense-v1"
```

Enter the SSH password privately in Terminal. Do not share credentials. Only hashes, table names, counts and mismatching source paths are reported; row contents and environment values are not printed. Exit 0 means observed fields matched, 2 means differences, 1 means incomplete/unavailable. None authorizes writes.

The check compares fetched origin/main with source files inside nine running components, all PostgreSQL public tables and column metadata, restaurant SQLite content, expense screenshots, social storage, and restaurant uploads. PostgreSQL queries use a read-only repeatable-read transaction and restaurant queries use a separate read-only SQLite transaction. Restaurant sessions/audit/Instagram cache remain local. Whole social storage including temporary files and unreferenced expense files is included conservatively and may need classification.

Observations happen sequentially while applications can still write. They are not an atomic two-host proof. Sequences, SQL constraints/functions, dependencies, extra untracked runtime files and compiled frontend environment values are not verified. MD5 row aggregation detects ordinary operational drift, not adversarial tampering. Full table aggregation/file hashing can consume resources; run once at a quiet time rather than scheduling this checker repeatedly.

The existing expense sync covers five tables plus referenced screenshots. It must not silently widen to unknown module tables or overwrite a database. Further implementation must define module-specific migration/conflict policies, a shared serialized write coordinator, fresh peer/Git verification, crash recovery, and enforcement across browser/API/background/startup/CLI mutation paths. Offline tests and interrupted/concurrent-save tests must pass in staging before production activation. An offline peer or unavailable approval must never reuse stale success to unlock. Instantaneous network failure detection cannot be guaranteed; transaction boundaries and fencing must be explicit.

Validation: eight comparison/read-only declaration tests and embedded Node syntax checks pass locally. Actual Docker/PostgreSQL/SSH checks are pending your run. Automatic code deployment should remain paused. Existing scheduled expense sync is unchanged.
