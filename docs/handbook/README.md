# Oak developer and operations handbook

**Start here if you are new to this project or new to coding.** This handbook explains how to work without confusing test code, real business records, GitHub and the running websites.

Updated **3 November 2026, Asia/Shanghai**. Repository source reviewed at `26c959182764d5cb9d4a3dfcb0d47410fa203388` (PR #10). Installed automatic-code runtime reviewed from `oak-automatic-code-release.zip`. The owner supplied successful production-migration and automatic-enable outputs. Those are historical acceptance records, not a claim that a live check has just run.

## The daily rule

**Real data goes into VPS. Code changes and test data go into Mac staging. Approved main code is released to Mac live, then VPS.** Expense/company-funds data has separate scheduled/manual synchronization. Restaurant, inventory, keg and social data do not gain replication just because their code is deployed together.

## Reading order

| Chapter | What you learn |
| --- | --- |
| [01 — Current state and environments](01-current-state.md) | What is installed, which site to use, known limits |
| [02 — Coding and architecture basics](02-architecture.md) | Browser, API, OCR, database, Docker and directory map |
| [03 — Git and workstation setup](03-git-and-setup.md) | Install tools, authenticate, clone, branches, hooks and secrets |
| [04 — Develop and test a feature](04-development.md) | Update staging, edit, test, commit and open a PR |
| [05 — Approved deployment](05-deployment.md) | Automatic job, manual console, checks, backups and status |
| [06 — Data synchronization](06-data-sync.md) | Seven-table scope, dry run, sync, conflicts and offline behavior |
| [07 — Company funds](07-company-funds.md) | Advances, expense funding and monthly partner balances |
| [08 — Backup, migration and recovery](08-recovery.md) | What backups cover and how to handle interrupted releases |
| [09 — Troubleshooting and security](09-troubleshooting.md) | Common failures, logs, credentials and safe diagnosis |
| [10 — Process roadmap](10-roadmap.md) | What is complete, what is pending and acceptance criteria |
| [11 — Command reference](11-command-reference.md) | Commands grouped by purpose and effect |
| [12 — Evidence and maintenance](12-evidence-and-maintenance.md) | Source traceability, handover checklist and documentation updates |

## How to use commands

Commands marked **Mac** run in your Mac Terminal. Commands marked **VPS** run only after SSH login. Do not paste the Terminal prompt (`sandip@... %` or `root@...#`) or sample output. A trailing `\` continues a command on the next line; there must be nothing after it. Quotes around paths are required because `Application Support` contains a space. `YOUR_NAME`, `YOUR_EMAIL` and `PR_NUMBER` are placeholders to replace, not literal values.

Each chapter distinguishes observation from changes. Read the paragraph above a command before running it. Existing installations have private configuration and data that are absent from GitHub; cloning the repository does not recreate production.

## Important differences from older documents

The older `docs/RELEASE-FLOW.md` describes a limited expense deployer. It is retained as history. **Do not enable `approved-main-v1` in the old data-sync configuration.** The current separate approved-code LaunchAgent deploys nine applications. Older restaurant instructions that promote local images or run a VPS installer remain useful for isolated setup, but are not the normal promotion route for the currently managed production stacks.

There is no production continuous write gate. A passing observation does not prevent a later offline period or concurrent edit. A GitHub push does not copy business records. A database migration does not run automatically through the code-only job.
