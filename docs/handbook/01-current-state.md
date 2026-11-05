# 01 — Current state and environments

[Handbook index](README.md)

## Current operating decision

Use **VPS for real business entry**. Use Mac staging to build/test new features. Use Mac live to check the approved version and maintain the existing expense-data mirror. Avoid editing the same live record on two systems between synchronizations.

| Task | Place | Why |
| --- | --- | --- |
| Add expenses, receipts and company-funds movements | VPS expense website | One normal entry point reduces competing edits |
| Update public menus, events and venue settings | VPS restaurant admin | Restaurant content is independent on each host |
| Develop a new feature | Mac checkout and staging containers | Unfinished source and test records stay away from production |
| Review a released feature locally | Mac live | It runs approved source with separate live data |
| Store approved source and documentation | GitHub | Reviewable version history; no business database backup |

## Environment map

| Environment | Expense UI | Expense API host port | Restaurant UI/admin |
| --- | --- | --- | --- |
| Mac staging | http://localhost:3100 | 4100 | http://localhost:3180 and `/admin` |
| Mac live | http://localhost:3000 | 4000 | http://localhost:3080 and `/admin` |
| VPS live | https://expenses.the-oak-lounge.online | Internal routing; preserve installed configuration | https://the-oak-lounge.online and `/admin` |

Staging PostgreSQL is normally host port 5433; Mac live PostgreSQL is normally 5432. Staging OCR is normally 8101; Mac live OCR is normally 8001. Verify actual ports with `docker ps`; do not change them to match a table if an installed configuration differs.

The local release console is normally http://127.0.0.1:3192. A separate locally installed expense-sync panel may use http://127.0.0.1:3191; its availability depends on its own process. Neither is the public VPS site. For restaurant local admin use `localhost`, matching its configured origin, rather than substituting `127.0.0.1`.

## Known working milestone

The owner reported both hosts successfully deployed company funds at main commit:

```text
26c959182764d5cb9d4a3dfcb0d47410fa203388
```

Recorded artifact SHA-256:

```text
58aa8944e58ec420ad54ee5031fa0434cb1cf2d25e70c83e08403213d89e6a8c
```

The completed rollout reported `production_migration_applied: true`, `engine_upgraded: true`, `both_hosts_verified: true`, and `continuous_write_fencing_enabled: false`. The automatic-code enable operation subsequently succeeded with `would_deploy: false` and matching approved/deployed commits. These identifiers are audit history, **not values to force into a future configuration**.

## Installed versus not installed

| Capability | Status at handover | Practical consequence |
| --- | --- | --- |
| Expense, OCR, phone intake and reports | Existing application capabilities | Review OCR output before saving real records |
| Company-funds production schema and application | Reported deployed on both hosts | Funding reviews and movements participate in expense sync |
| Expense/company-funds scheduled/manual sync | Existing engine, extended scope | It runs separately from code deployment |
| Approved-main automatic code release | Owner enabled separate Mac LaunchAgent | Polls every five minutes while its Mac session can run |
| Nine-app source deployment | Implemented in release-control path | Same source artifact, native builds on each host |
| Immediate replication after every save | Not implemented | A VPS entry may be absent on Mac until sync completes |
| All-module business-data replication | Not implemented | Independent module content can differ |
| Strict lock whenever either host is offline | Not enabled in production | Offline Mac does not automatically block VPS data entry |
| Paired PostgreSQL/SQLite write permits | Earlier isolated prototypes/tests | Passing prototype tests did not deploy a production gate |
| Automatic schema migrations | Blocked by code-only policy | A migration needs a dedicated reviewed rollout |
| Exactly simultaneous Mac/VPS rollout | Not implemented | Mac can be newer while VPS rollout awaits recovery |

The earlier strict-sync work must not be described as complete. Draft PR #9 was not part of company-funds approval. Check its actual current GitHub state before discussing it; do not merge it just to make a button appear.

## Persistent locations

| Location | Purpose |
| --- | --- |
| `$HOME/Desktop/oak-expense-v1` | Mac source checkout and staging helpers |
| `$HOME/Library/Application Support/OakAutomation/engine` | Installed stable expense-sync engine |
| `.../OakAutomation/config.json` | Private data-sync configuration |
| `.../OakAutomation/strict-verifier.json` | Private read-only verifier settings |
| `.../OakAutomation/release-console.json` | Private manual release settings |
| `.../OakAutomation/release-console-state` | Manual/coordinated release records and Mac backups |
| `.../OakAutomation/automatic-code` | Separate stable automatic-code service, settings, status and logs |
| `/opt/oak-expense` | VPS project/configuration and historical backup locations |
| `/opt/oak-release-control` | Dedicated VPS release agent and private state |
| `/opt/oak-gateway` | Existing Caddy configuration |
| `/opt/oak-ai-engine` | Separate Ollama engine installation |

Paths abbreviated with `...` start with `$HOME/Library/Application Support`. Actual paths in private settings take precedence. Downloads holds transfer packages, not the active source checkout. `tools/` may exist only locally and be excluded from Git; preserve it through branch changes.
