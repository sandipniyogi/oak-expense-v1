# The Oak Lounge — oak-expense-v1

One repository for the expense system, restaurant website, inventory, keg, social, AI services and deployment/sync automation.

## Setup and recovery documentation

Start with [Setup process and environment map](docs/setup/SETUP-PROCESS.md).

- [Backup inventory and recovery checklist](docs/setup/BACKUP-AND-RECOVERY.md)
- [Approved release workflow](docs/RELEASE-FLOW.md)
- [Mac staging/live setup](STAGING_PRODUCTION_SETUP.md) — historical bootstrap instructions; use the approved release flow for current expense promotions.
- [Restaurant local-first deployment](restaurant/LOCAL-FIRST.md)
- [Restaurant documentation](restaurant/README.md)
- [Inventory setup](INVENTORY_ENGINE_SETUP.md)
- [Keg simulator setup](KEG_SIMULATOR_SETUP.md)
- [Inventory admin edit patch](docs/INVENTORY-ADMIN-PATCH.md) — preserved previous README content.

## Current expense workflow

Mac staging → GitHub `staging` → pull request and Source checks → approved `main` → Mac live validation → VPS.

The stable scheduler runs outside the development checkout. Live expense records and receipt files sync between Mac and VPS daily at 03:00 Asia/Shanghai, with catch-up and conflict review. Staging data stays separate.

The expense deployer does not automatically deploy every other module. See the release guide for exact scope.

## What GitHub stores

Source code, reviewed configuration templates, documentation, menu artwork, tests and deployment scripts.

GitHub does not replace private backups of databases, receipts, production environment files, scheduler state, SSH/VPN keys or credentials. Never commit the private operations guide containing passwords. Use a redacted guide here and encrypted storage for the private recovery materials.

## First-time readers

The setup guide records the installation performed in October 2026 and identifies the machine-only configuration still needed for a full rebuild. It is not a claim that cloning this repository recreates live data or all server services automatically.

## Everyday commands

[Commands to Run the Code — Local and Server](docs/COMMANDS.md)
