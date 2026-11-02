# Restricted application roles — permission migration prerequisite

The production inventory found that all four PostgreSQL application services use the oak superuser and own the public tables on both hosts. Preserve oak as administrator. Applications need separate non-superuser login roles, explicit table/sequence grants and no table, schema or barrier ownership. Coordinator credentials must remain separate from application containers.

This source defines the exact runtime table scope: expense 6 tables; inventory 13 oak_inv_ tables; keg 2 tables; social 6 tables. Roles receive schema USAGE and SELECT/INSERT/UPDATE/DELETE on their listed tables. They receive USAGE on the serial/identity sequences attached to those tables, not broad sequence or administrative permissions. No TRUNCATE, DDL, gate schema access or control-function execution is granted. Startup DDL/migrations require the administrator migration path and cannot run as these runtime roles.

Run the prerequisite test with:

```
node --test services/strict-sync/test/application-roles.test.mjs
python3 scripts/test-restricted-roles.py --project "$PWD"
```

The harness reads a SCHEMA-ONLY custom dump from oak-expense-staging-db-1, restores it into a newly generated oak_role_test_<random> database, creates four temporary login roles, grants each explicit runtime scope and installs the previously tested barrier only in that new database. No business rows are copied. It connects as each actual restricted login, reads its real module tables, checks cross-module access and administrative operations are denied, verifies frozen writes are blocked, and verifies a current permit authorizes an update to a synthetic probe row. It then freezes again and confirms writes are denied. Unknown public SECURITY DEFINER functions block the test pending review.

Cleanup drops the generated database with --force, removes only the four generated test roles and removes copied temporary source. Role passwords are generated inside Node memory and never printed or stored in project files. The temporary roles exist in the staging PostgreSQL cluster for the duration of this test; existing roles, databases, live services and scheduler configuration are unchanged. PostgreSQL privilege/role statements are real, not mocked in the integration test. Four local unit tests passed during preparation; the Docker/PostgreSQL integration must run on the Mac.

A passing permission test does not prove every application endpoint works under the new role. Sequence-backed INSERTs, complete route smoke checks and application connection overrides need validation before live switching. Production migration is NOT activated by this package: live application DATABASE_URL settings still use oak. No barrier is installed on an existing application database.

The role grants are only one prerequisite. Real all-module replication, shared production controls, durable file replication, strict Git verification and recovery must be complete before changing live roles or enabling the gate. Keep PR #9 draft and deployment paused.
