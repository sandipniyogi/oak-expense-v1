# Backup inventory and recovery checklist

A GitHub copy backs up source and setup instructions. It does not back up live databases, receipt files, installed scheduler state or secrets.

## What to keep in Git

- Entire reviewed application source, tests and safe static assets.
- Compose definitions after checking for embedded real credentials.
- Secret-free environment examples, schema/migrations and install scripts.
- This setup record, release workflow and module guides.
- Future reviewed redacted VPS/gateway templates and the stable-engine installer.

Avoid publishing the confidential operations guide: it contains an administrator password at the owner's request. Keep a separate redacted guide in Git.

## Private recovery set — encrypted and outside Git

| Machine/component | What is needed |
|---|---|
| Mac expenses | Verified PostgreSQL dump and matching receipt-upload backup |
| VPS expenses | Verified PostgreSQL dump and matching receipt-upload backup |
| Mac configuration | `.env.production`, `.env.staging`, module-specific environment files and private phone certificate configuration |
| Mac automation | `config.json`, complete configured state directory, installed stable engine and actual Oak LaunchAgent plist |
| Automation SSH | `~/.ssh/oak_vps_backup`, known_hosts evidence and matching restricted authorized-key entry on VPS |
| VPS configuration | `.env.vps`, actual compose.vps.yaml/compose.app.yaml and `/etc/oak-automation.json` |
| Gateway | `/opt/oak-gateway` Compose/config plus actual Caddy persistent certificate/config volumes |
| Restaurant | Consistent SQLite backup, uploaded images and each environment's private configuration |
| Other modules | Their own databases, uploaded files, volumes and private environment values |
| OpenVPN | Compose definition and consistent `/opt/oak-openvpn/data` backup |
| WireGuard | Compose definition, config/peers and private Clash/subscription material |
| Provider/DNS | Account recovery methods/MFA recovery codes and DNS record inventory |

Caddy volume names, extra module data stores and the LaunchAgent filename must be inventoried from the actual machines; do not guess names from this guide. Keep more than one backup, including an encrypted off-server copy.

## Existing backup behavior

`automation/machine.py` creates a private backup folder under `<project>/backups/automation/<UTC timestamp>`:

- Custom-format PostgreSQL dump.
- Validation using `pg_restore --list`.
- Uploads tar.gz, checked by reading gzip contents.
- VERIFIED marker after checks.
- Retains at least seven verified snapshots and those within its configured retention period (default 14 days).

These checks verify readable artifacts, not a full end-to-end restored application. The current method does not establish a single atomic database/filesystem snapshot while uploads continue. Quiesce writes during a deliberate disaster-recovery checkpoint and restore-test a matching pair.

Backup timer installation for expenses was reported successful. Verify timer status and fresh files, rather than assuming installation proves daily execution. Restaurant has its own backup scripts and installer schedule.

On the VPS, inspect without exposing secrets:

```bash
systemctl list-timers --all 'oak*'
systemctl status oak-backup.timer --no-pager
df -h /
```

## Recover onto replacement machines

1. Preserve the failed system and all surviving copies before changing anything.
2. Decide the recovery point and authoritative live data copy. Do not enable two-way sync with an empty replacement database.
3. Clone the reviewed Git commit and recreate the recorded Docker topology.
4. Restore private environment values, SSH permissions and trusted host identity deliberately. New VPS host keys must be verified before updating known_hosts.
5. Restore expense PostgreSQL and corresponding screenshots into isolated storage first; validate record counts, totals and representative attachments.
6. Restore restaurant and other modules independently using consistent backups, not a copy of an active database file.
7. Restore Caddy and DNS routing, preserving separate restaurant, expense, phone and VPN paths.
8. Verify API/OCR/web health, admin access, reports, Excel screenshots and phone-save behavior.
9. Restore stable engine, existing scheduler definition and sync state; keep deployment paused until Git main and machine configuration are reviewed.
10. Review pending sync recovery/conflicts before resuming data synchronization. If state is missing, reconcile explicitly instead of creating a fresh baseline blindly.
11. Enable approved-main release policy only when the rebuilt Mac live and VPS have passed checks.
12. Test off-server backups and record the successful recovery date/commit privately.

Do not use `docker compose down -v`, database initialization or old migration restore commands against an existing live installation as a shortcut. These instructions intentionally do not provide destructive one-line restore commands without a chosen destination/snapshot.

## Completion criteria

A setup backup is complete only when all three exist:

1. Reviewed source and process documentation in GitHub.
2. Verified encrypted private recovery material off the live machines.
3. An isolated restore drill showing the applications and their real data can be recovered.

At the time this guide was written, (1) was being completed, while off-server coverage and restore validation still required confirmation.
