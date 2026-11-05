# 10 — Process roadmap

[Handbook index](README.md)

This is a status/acceptance roadmap, not a promise that unimplemented features exist. No new deployment, database migration or scheduler is installed by adding this documentation.

## Current delivery process

| Stage | Owner/action | Evidence needed to move on |
| --- | --- | --- |
| Baseline | Operator checks GitHub and both live systems | Exact source identity and scoped content observation; resolve differences |
| Development | Developer edits an approved branch and runs staging | Focused tests, browser review and no staging/live storage overlap |
| Commit/push | Developer reviews selected files and pushes | Clean tree, hook acceptance, no secrets, intended branch ancestry |
| PR | Reviewer examines scope and CI | Exact PR diff, successful Source checks, migration classification |
| Approval | Owner merges into main | Reviewed merge commit and successful main checks |
| Code release | Mac automatic worker | Both online, code-only policy, backup/health, exact commit/artifact |
| Production check | Operator reviews sites and status | Complete both-host release plus browser checks |
| Data upkeep | VPS operators enter data; engine syncs supported scope | Evidence reviewed, supported merge verified, conflicts resolved |
| Documentation | Developer updates handbook with behavior changes | Source links, commands and limits remain accurate |

## Completed milestones, based on recorded evidence

| Milestone | Evidence | Boundary |
| --- | --- | --- |
| Staging/live/VPS separation | Existing ports/projects and workflow records | Private host setup still required on a new machine |
| Expense synchronization compatibility repair | PR #7 and bridge snapshot/dry-run results | Explicit scope, not all tables |
| Restaurant non-root read-permission fix | PR #8, image/read checks and production health | Keep permission fix in future Docker builds |
| Company-funds feature | PR #10, unit/integration/sync tests | Financial review rules and CNY limitations remain |
| Paired company-funds production migration | Completed both-host owner output at `26c9591...` | Not a general migration service or distributed gate |
| Stable approved-code job | 27 isolated tests and owner check/enable output | Real future deployment still requires per-release verification |
| Read-only pre-push observation | Repository hook helper and owner preflight results | Allowed branches are explicit; observation can become stale |

## Phase A — Make routine operations observable

Priority: next operational work, without changing the financial model.

- Display separate **code version**, **last expense sync**, **current reachability** and **verification scope**; one green “synced” label is misleading.
- Report worker busy/blocked/attention_required distinctly and expose bounded progress logs.
- Add a reviewed completion workflow for recovering/retiring an automatic failed-job journal; verify actual host outcomes before changing its state.
- Add documentation-only release detection so approved docs can be recorded without rebuilding/restarting nine applications. It must not falsely record application code as deployed.
- Inventory installed local-only control source and versions for reproducible handover; decide which sanitized control source should be versioned. Do not commit private settings/state.

Acceptance: a new operator can explain the displayed state, identify a failed release and follow a tested recovery without manually editing a journal. Tests cover crashes before/after activation and main changing during preparation.

## Phase B — Extend data coverage deliberately

Independent inventory, keg, social and restaurant content need separate designs. For each scope define identifiers/seed mappings, foreign keys, deletion/tombstones, conflicts, files/media, exclusions, backups, retries and schema-version compatibility. Do not use “copy every table” or “ignore every ID/timestamp” as a replication strategy.

Acceptance: isolated two-peer tests cover both directions, concurrent edits, deletions, file checksum collisions/missing media, interrupted apply and no silent overwrite. Rehearse against restored live snapshots and verify preservation before requesting a live migration.

## Phase C — Finish strict online write coordination

The owner's desired rule remains: no new data modifications while either peer is offline or unverified. Current production does not enforce it.

Earlier tests exercised PostgreSQL barriers, restricted roles, paired permits, SQLite claims, handler atomicity and upload recovery. A production solution still needs a complete live coordinator, authenticated peer transport, fencing epochs, restricted application credentials, all real write paths/background tasks, durable replication and recovery across databases/files.

Acceptance must include both-peer outage/network partition, process crash at every stage, concurrent requests, expired/stale permits, reconnect, Git approval mismatch, migration interaction, bypass attempts and service restart behavior. Browsing/login/session/cache policies must be explicit. Do not unlock production from a sequential read-only comparison or a browser button alone.

Tradeoff for owner: this policy intentionally stops writes on the reachable VPS whenever the Mac is offline. Before enabling it, confirm that availability cost is acceptable for venue staff and provide a clear offline operational procedure.

## Phase D — Improve financial operations

Potential features: evidence-backed month-end sign-off, immutable close/reopen audit, explicit per-operator identity, movement receipt attachments, dedicated settlement exports, carefully designed refunds/FX and bank reconciliation. Each changes financial semantics and requires focused model tests, reviewed historical conversion and operator training. Do not infer that a recalculated monthly report is an approved accounting close.

Acceptance: exact cents, month boundaries, sign conventions, historical carry-forward, voids/corrections and double-count prevention are demonstrated with examples reviewed by the owner.

## Phase E — Disaster recovery and maintenance

Record off-host encrypted backup location, recovery-time target, acceptable data-loss window, backup retention, cleanup rules, account/key ownership, domain/provider access, supported dependency versions and an incident contact. Rehearse a complete replacement-host restore in isolation. Review public access protections and least-privilege credentials separately from this documentation change.

Acceptance: a second operator can restore tested copies, validate data/files and explain DNS/routing cutover without depending on one person's laptop memory.

## First-week learning plan for a new developer

| Session | Exercise | Proof of understanding |
| --- | --- | --- |
| 1 | Read architecture/environment map; browse source | Explain UI/API/DB and name every real-data boundary |
| 2 | Configure Git identity/auth; inspect branches/hooks | Explain fetch versus pull versus deploy; no production change |
| 3 | Run isolated staging and a small UI change | Show stage banner/ports and a passing focused test |
| 4 | Trace one expense and one funds calculation | Demonstrate no duplicate expense from an advance |
| 5 | Review a docs-only PR and CI | Identify whether merging would trigger a deployment |
| 6 | Read status/logs and simulated failures | Explain busy, blocked, uncertain and recovery_required |
| 7 | Rehearse backup/restore in disposable storage | Produce evidence; never restore over production |

Do not give a new developer production root or private keys merely to complete these exercises. Grant the access needed for their role through owner-approved handover.
