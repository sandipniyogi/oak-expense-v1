# Paired PostgreSQL write-flow test

This patch connects an HTTP permit to transaction-local PostgreSQL claims in the expense, inventory, keg and social APIs when strict mode is enabled. Queries without a claim run read-only. The coordinator freezes both databases before verification and after an operation. Claims are peer-bound and close when the HTTP response finishes.

This is an isolated integration test, not a production synchronization release. Restaurant content writes remain blocked in strict mode because SQLite fencing is not implemented. Production all-module replication, durable recovery and a live verification provider are still pending. Keep PR #9 draft and automatic deployment paused.

Run from the project root:

```bash
python3 scripts/test-paired-write-flow.py --project "$PWD"
```

Docker Desktop and the existing staging API/database containers must be running. No image build or container restart is needed. The harness creates two randomly named databases inside the staging PostgreSQL container, installs the already tested barrier there, and copies test source into a temporary folder in the staging API container. It removes these databases and temporary files afterward. Existing application databases, screenshots and live services are untouched.

The test exercises HTTP locking, transaction claims, reverse-direction writes, synchronization claims, direct-SQL rejection and unavailable database connections. Its replication provider copies one synthetic expense row only. Offline and Git approval checks are fixtures; this does not test the actual Mac/VPS connection or GitHub. Both test databases reside on the Mac.

Production application roles must not be superusers or own the barrier objects. Coordinator administrative connections must be separate. The pool wrapper supports Promise-based queries and one SQL statement per query; explicit transactions must use pool.connect(). This conservative interface may require application compatibility changes before deployment.

48 local Node unit tests passed. The Docker/PostgreSQL integration test must be run on your Mac; it has not been run in the patch preparation environment.
