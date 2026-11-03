# 06 — Data synchronization

[Handbook index](README.md)

## Scope comes before the button

The installed expense sync is a bidirectional three-way merge. It compares Mac live and VPS live with a previously verified baseline, detects conflicting edits and applies only a valid planned result. It is not a full server clone and is not Git.

The completed company-funds rollout extended the supported expense scope:

| Table | Meaning | Merge identity |
| --- | --- | --- |
| `users` | Payers/individuals/company identities | `id` |
| `categories` | Expense categories | `id` |
| `merchants` | Merchants/vendors | `id` |
| `expenses` | Actual expense records | `id` |
| `oak_phone_saves` | Phone-save records | `id` |
| `oak_company_fund_entries` | Advances, returns, reimbursements and other movements | `id` |
| `oak_company_expense_funding` | Reviewed funding classification for an expense | `expense_id` |

`oak_sync_tombstones` supplies deletion metadata. Explicit deletion is different from a missing observation. The funding table is keyed by `expense_id`, so treating every table as if it had `id` breaks deletion/merge behavior.

Expense receipt files are copied as supported by the sync engine. It verifies checksums, copies additions and does not automatically delete physical files. A filename collision with different bytes stops the operation. An unreferenced extra receipt file can exist without a different saved expense; investigate rather than deleting it casually.

Inventory, keg and social tables are explicitly independent. Restaurant SQLite, menu/event content and media are also outside this expense sync. The broad read-only verifier can report differences in those stores, but it cannot reconcile them. All-module replication is future work.

## Normal timing

The existing Mac scheduler considers daily expense sync due at **03:00 Asia/Shanghai**. If the Mac cannot run then, an available later scheduler tick can catch up. This depends on the actual installed schedule, login/session conditions, Docker and connectivity; there is no guaranteed successful nightly run while the Mac is powered off.

The automatic **code** job's five-minute interval does not change that data schedule. A save on VPS does not immediately appear on Mac live. Keep VPS as the usual entry point so two people do not unknowingly edit the same record on separate peers.

## Dry run before a manual sync

Mac, installed engine, no business-data merge:

```bash
python3 "$HOME/Library/Application Support/OakAutomation/engine/runner.py" \
  --config "$HOME/Library/Application Support/OakAutomation/config.json" \
  dry-run
```

This can update local operation/status metadata and acquire locks. It does not apply planned business-record changes.

Example:

```json
{"conflicts":0,"mac_changes":true,"vps_changes":false}
```

This means the planned result would change Mac, while VPS already matches that plan. It does **not** mean the change has happened, and it does not prove that every module's data is equal.

`pending_recovery: true` means an earlier journal exists. Do not interpret it as a fresh successful comparison. Review pending recovery before another operation.

## Apply the supported merge

Mac, live-data operation; supported backups occur before planned mutations:

```bash
python3 "$HOME/Library/Application Support/OakAutomation/engine/runner.py" \
  --config "$HOME/Library/Application Support/OakAutomation/config.json" \
  sync
```

Do not launch multiple copies because one is slow. The normal runner lock prevents overlap; some historical runner versions exit silently when busy. Blank output or a zero shell exit alone is not proof of synchronization.

A genuine `{"ok":true,"unchanged":true}` reports the supported expense records already match the calculated result. It is not proof of identical server configuration, independent module data, or an installed continuous write gate.

After sync, repeat the dry run and the broad readiness observation:

```bash
python3 "$HOME/Library/Application Support/OakAutomation/automatic-code/service/manage.py" check
```

If this still reports independent-module differences, expense sync is not the tool to erase them. Plan a separate scoped migration with mapping/backups and explicit direction.

## What the sync engine does

1. Read both bridge snapshots and require matching supported schemas/scopes.
2. If recovering a pending plan, accept only the original or exact planned digest; later competing edits block recovery.
3. Otherwise compute a three-way record merge from the last baseline and any explicit conflict resolutions.
4. If conflicts exist, retain a conflict report and stop before record overwrites.
5. For a real change, back up both database/upload snapshots, inspect file manifests and copy verified additions.
6. Persist a pending plan, including original and target digests.
7. Apply with expected-digest checks, then re-read and require the exact target on both sides.
8. Publish the verified baseline and clear completed pending/conflict/resolution state.

A crash between peers can leave a pending plan. The journal is evidence needed for recovery. Removing it can conceal an incomplete operation and cause incorrect future merges.

## Conflicts need a decision

Mac, read recorded conflicts:

```bash
python3 "$HOME/Library/Application Support/OakAutomation/engine/runner.py" \
  --config "$HOME/Library/Application Support/OakAutomation/config.json" \
  conflicts
```

Conflict output can contain business data; keep it private. Compare the original evidence and decide which version is correct. Only after that review, replace `CONFLICT_ID` and choose a peer:

```bash
python3 "$HOME/Library/Application Support/OakAutomation/engine/runner.py" \
  --config "$HOME/Library/Application Support/OakAutomation/config.json" \
  resolve --id CONFLICT_ID --take vps
```

`--take mac` is the alternative when Mac holds the correct version. Resolution records a choice; it does not itself apply the merge. Run `dry-run`, then `sync` and verify the result. Never choose VPS solely because this handbook recommends VPS for normal entry; an individual conflict still requires evidence.

## Why equal row counts are not enough

Two databases can each have 160 expenses but differ in amounts, payer IDs or deletions. Conversely, independent seed IDs/timestamps can differ while normalized business content appears equivalent. The verifier maps declared seed identities and separates excluded local state. It does not grant permission to ignore arbitrary IDs, foreign keys, timestamps or missing referenced media.

The current observation is sequential, not an atomic snapshot spanning both hosts. It does not verify every dependency version, sequence state, database function or compiled browser setting. Session/audit/cache exclusions and unreferenced files remain documented limitations. Later writes can invalidate a successful observation.

## Watch a slow operation without interrupting it

In a **second** Mac Terminal:

```bash
ps -axo pid,etime,%cpu,command | grep -E '[r]unner.py|[s]sh .*oak-automation|[p]g_dump|[t]ar -czf'
```

A long-running runner at 0% CPU can be waiting for SSH, a backup or remote work. Changing SSH child PIDs show activity, but do not prove success or a particular stage. The engine performs backups and file transfers; large receipt stores can take time.

Do not kill the runner, remove a lock file or restart services to make it faster. Record elapsed time, status and redacted logs. If the outcome is unknown, follow [recovery](08-recovery.md).
