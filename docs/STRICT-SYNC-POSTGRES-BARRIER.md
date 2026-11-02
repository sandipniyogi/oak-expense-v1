# PostgreSQL write barrier: disposable database test

This is the database-level barrier component, not a complete production sync rollout. Do not install its SQL in Mac live, VPS live or the shared staging application database. Do not promote draft PR #9 yet.

## Run safely on the Mac

Keep Docker Desktop and the existing staging Postgres container running. Apply the additive source patch, then:

```bash
python3 scripts/test-postgres-barrier.py --project "$HOME/Desktop/oak-expense-v1"
```

The script uses only oak-expense-staging-db-1. It creates a NEW database named oak_guard_test_<random>, adds a synthetic expenses table, installs the barrier inside that disposable database, runs real SQL/concurrency checks, and drops ONLY the newly created database. It never copies or modifies existing restaurant, staging or live records. No application or database container is restarted. It uses existing POSTGRES_USER inside the staging DB container and never prints its password.

A create-database or event-trigger permission failure stops testing. Do not make the application role a superuser to work around it; report the error. If cleanup fails, the script prints the exact disposable database name. Do not delete any other database or Docker volume.

## Implemented barrier semantics

- INSERT, UPDATE and DELETE require a matching operation ID, mode and generation in the transaction-local settings. COPY row writes are subject to the same triggers.
- TRUNCATE has its own statement trigger. New DDL is rejected while enabled, preventing creation of unguarded public tables through ordinary migrations.
- One active application operation is stored in a protected schema. A second operation cannot replace it. This is per database; the shared cross-host coordinator is still required.
- Every protected writer holds a transaction-scoped shared advisory lock plus a row-level share lock on barrier state. The freeze operation needs the exclusive advisory lock and waits for current writers to COMMIT/ROLLBACK.
- Freeze clears old permits and advances the generation. Queued/late writes using old permits fail. FOR SHARE on state also prevents a repeatable-read transaction from using an obsolete snapshot of the permit row after concurrent changes.
- Synchronization uses a different permit/mode while application writes remain frozen. Finishing synchronization fences that permit too. The barrier does not itself copy or merge business records.
- Token-changing functions and state are revoked from PUBLIC. Their owner is the trusted administrator for this test. Production requires dedicated non-superuser application roles without ownership of barrier objects. An administrator/superuser remains trusted and can disable/bypass protections; this is not a sandbox against database administrators.

## Integration still required

This patch does not wire permits into the API connection pools, deploy a shared coordinator, unlock the UI, or perform replication. The missing pieces remain paired host fencing, coordinated transaction context across every application pool/background/CLI worker, all-module conflict-aware replication, SQLite restaurant serialization, safe interrupted recovery, artifact approval checks and deployment gating.

No live behavior changes. Existing staging HTTP writes stay locked as before; live applications and the existing expense schedule stay unchanged.

## Validation limits

The Python harness and SQL file were inspected locally and Python syntax was checked. This environment has no PostgreSQL/Docker runtime, so execution of the SQL and concurrency tests is pending on your Mac. The output of that test is needed before continuing integration. Do not treat the SQL as production-tested from source inspection alone.
