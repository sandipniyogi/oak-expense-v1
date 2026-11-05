# 08 — Backup, migration and recovery

[Handbook index](README.md)

## Recognize the operation before recovering it

| Operation | Changes source/images? | Changes schema? | Changes business records? |
| --- | --- | --- | --- |
| Automatic-code `check` | No activation | No | No merge; local status may be written |
| Data `dry-run` | No | No | No merge; local metadata may be written |
| Data `sync` | No | No intentional migration | Yes, supported merge and receipt additions |
| Code-only deployment | Yes | Schema changes blocked | Existing data retained; app behavior may write during normal use |
| Coordinated company-funds migration | Yes | Yes, explicitly reviewed SQL | Adds support tables/triggers; verified existing content retained |
| Restore from an older database dump | Possibly unrelated | Possibly | Can replace/lose later records; requires explicit recovery plan |

A backup existing is not the same as a verified restore succeeding. A healthy container is not proof of a correct business ledger.

## What the current release backup verifies

The host release path stops the known nine application writers for the backup/activation stage, creates a PostgreSQL custom-format dump, validates its catalog and restores a disposable verification database. It archives writable application mounts and read-checks archives, and quick-checks a temporary restaurant SQLite copy including WAL where present.

This preserves database and attached-store evidence without deleting/remapping originals. An image rollback does not automatically restore an old database. New records entered after backup must not be erased by a blind restore.

Ordinary automatic and manual releases retain private sources, build logs, rollback specifications and backups. These files may contain environment secrets and must not be committed. There is no established automatic retention/cleanup policy in this release-control path. Monitor disk use and develop retention only after establishing tested off-host backups and restore requirements.

## Locations to inspect

Mac release state normally lives at:

```text
$HOME/Library/Application Support/OakAutomation/release-console-state
```

VPS dedicated agent state normally lives at `/opt/oak-release-control/state`. Earlier full-release backups also exist under `/opt/oak-expense/backups/full-release`, company-funds rehearsals under dedicated subfolders, and restaurant backups under `/opt/oak-expense/restaurant/backups/production`. Do not assume the newest useful backup is in one historical folder; use the exact path recorded by the operation being recovered.

Mac sync state is configured by `state_dir` in private `config.json`; it may differ from release state. Never copy/rewrite a configuration just to make its path match a handbook example.

## First response to any interrupted live operation

1. Record which command/action was running, its commit/artifact identity, last reported stage and time.
2. Disable future automatic-code starts. An in-flight job is not killed by disable.
3. Do not start another deploy, sync, migration or database restore in parallel.
4. Inspect the recorded workflow and actual host/container state after connectivity returns.
5. Keep pending journals, backups and old images. Do not make a false success by editing metadata.
6. Have the operator choose the recovery appropriate to that exact workflow.

Mac, pause future code releases:

```bash
python3 "$HOME/Library/Application Support/OakAutomation/automatic-code/service/manage.py" disable
```

Read automatic status and logs as described in [deployment](05-deployment.md). If the worker is still active, let it finish or establish an operator recovery plan before changing services.

## Failed ordinary code release

A failed host activation attempts to restart its previous image IDs and checks their health. It records rolled-back versus rollback-failed distinctly. This is image recovery, not a database restore. Mac may have deployed successfully while VPS remains old or uncertain.

Open the existing release console, inspect host status and the exact interrupted commit/artifact. The manual workflow can reverify matching healthy releases or expose same-release image recovery controls. Do not guess that an SSH timeout means nothing happened on VPS. A remote operation can finish after the client loses its acknowledgement.

The automatic worker retains `active`/`attention_required` journal state and does not blindly retry a started release. There is currently no general automatic journal-reset command. After manual recovery, a maintainer must establish both agents' verified source, data and workflow state before reviewing how to retire the failed automatic journal. This is a known operational gap, not a reason to delete `job.json`.

## Failed expense sync

A pending plan has original and target digests. Retry through the supported sync command only after reviewing the situation. The engine can recover an original/exact-target state, but blocks if new conflicting edits invalidate the plan. Resolve real conflicts explicitly. Never delete `pending.json`, baseline or tombstones to force a merge.

## Future schema migrations

Automatic code deployment deliberately refuses schema/initialization changes. For a new table/field, review API validation, existing data compatibility, indexes/constraints, sync scope/keys/deletion, least-privilege roles, reports, backups and recovery. Design/rehearse migration before approving production activation.

The company-funds transition is the worked precedent, not a universal migration runner:

1. Back up each actual host and restore a disposable copy.
2. Test exact reviewed SQL against that copy and prove existing content is unchanged.
3. Verify schema objects, triggers/functions, idempotence and interruption recovery.
4. Approve exact GitHub main/CI and pin the source artifact.
5. Prepare all nine images on both hosts without stopping live apps.
6. In a maintenance window freeze/stop both writers, take fresh verified backups and rerun rehearsal on the frozen snapshot.
7. Apply reviewed SQL transactionally per host, check content/catalog invariants, start candidates and validate both hosts.
8. Upgrade only the reviewed engine components and publish a verified equal baseline if the migration requires a sync change.
9. Commit exact release records and document the outcome; do not claim production fencing was enabled.

The earlier company-funds rollout is complete. **Do not rerun its prepare/apply routine as routine maintenance.** Its policy is tied to reviewed source and engine hashes and may correctly refuse later commits.

For an operator investigating that exact coordinated workflow, status only:

```bash
cd "$HOME/Desktop/oak-expense-v1"
python3 tools/release-console/funds_control.py status
```

Historic controlled command shape, **not a copy/paste instruction for a new migration**:

```text
python3 tools/release-console/funds_control.py apply --commit EXACT_PREPARED_COMMIT --sha256 EXACT_PREPARED_ARTIFACT
```

During coordinated maintenance, use its recovery protocol rather than ordinary image rollback. Unactivated preparation can sometimes be abandoned through its exact identity-checked control; after maintenance begins the rules differ. The installed preparation-fix patch tightened state handling and fixed environment-list aliasing. Never replace current control source with an older package merely because filenames match.

## Disaster recovery requires a separate rehearsal

A complete machine rebuild needs more than Git: approved source, private host configuration, compatible Docker/DB versions, database dump, all persistent stores, restaurant SQLite/media, gateway configuration/cert management, SSH trust/access, installed automation state and documented service ownership. Restore into isolation first, validate source and business content, then plan DNS/routing cutover.

Do not run broad `pg_restore --clean`, replace production volumes or copy another host's database as an improvised repair. Full restore commands depend on the exact backup, target and accepted data-loss window. This handbook intentionally does not invent a universal destructive restore command.

Retention, off-host encrypted backups, recovery-time target and maximum acceptable data loss remain owner decisions to record in the roadmap.
