# Setup process and environment map

Recorded 29 October 2026, Asia/Shanghai. Based on repository source and the owner's setup outputs. This is the Git-safe setup record: no real passwords, tokens or private keys.

## 1. Project layout

| Path | Purpose |
|---|---|
| `apps/api` | Expenses API and reports |
| `apps/web` | Expense interface and other module pages |
| `services/ocr` | Receipt OCR |
| `services/phone-queue` | Phone capture/queue service |
| `services/inventory-api` | Inventory service |
| `services/keg-api` | Keg service |
| `services/social-api` | Social service |
| `services/oak-ai` | AI service |
| `db` | Expense database bootstrap and migrations |
| `automation` | Live data merge, backup and release engine |
| `scripts` | Local module startup and supporting commands |
| `restaurant` | Current restaurant website and menu work |
| `oak-restaurant` | Earlier restaurant copy retained for reference; not the current active path |
| `.github/workflows/checks.yml` | GitHub Source checks |

Do not delete the earlier restaurant copy until any unique files have been reviewed. The loose root `page.js` is also retained; the expense page used by the web app is `apps/web/app/page.js`.

## 2. Environment map

| Environment | Address | Data boundary |
|---|---|---|
| Mac expense staging | http://localhost:3100 | Test database/uploads |
| Mac expense live | http://localhost:3000 | Real expenses |
| VPS expense live | https://expenses.the-oak-lounge.online | Real expenses, synced with Mac live |
| Mac restaurant staging | http://localhost:3180 | Independent test restaurant database |
| Mac restaurant live | http://localhost:3080 | Independent live restaurant database |
| VPS restaurant live | https://the-oak-lounge.online | Independent restaurant database |

The Mac project lives at `/Users/sandip/Desktop/oak-expense-v1`. The VPS project lives at `/opt/oak-expense`. Restaurant code stays inside the same project.

## 3. Mac expense bootstrap

Prerequisites: Git, Docker Desktop with Compose, Python 3.9+ (Python 3.12 is used in CI), and Node 24 for local restaurant checks. Normal expense runtime services run in Docker. Keep the Mac awake and Docker running for its scheduled tasks.

Clone into the desired project location on a NEW machine only:

```bash
git clone https://github.com/sandipniyogi/oak-expense-v1.git
cd oak-expense-v1
git switch staging
```

Do not clone over or replace the existing working project. If the repository becomes private, authenticate using the owner's authorized GitHub access.

Create separate private `.env.staging` and `.env.production` files using the safe examples in `docs/examples`. Replace the password placeholder privately. On an existing installation, restore the original values rather than inventing new database names/passwords or Docker project names.

| Setting | Mac staging | Mac live |
|---|---|---|
| `STACK_NAME` | oak-expense-staging | oak-expense-v1 |
| `POSTGRES_DB` | oak_expenses_staging | oak_expenses |
| Web/API/DB/OCR host ports | 3100/4100/5433/8101 | 3000/4000/5432/8001 |
| Uploads/reports | storage-staging | storage |

Create private directories and bootstrap staging:

```bash
mkdir -p storage-staging/uploads storage-staging/reports storage/uploads storage/reports backups
docker compose --env-file .env.staging -f docker-compose.yml -f automation/compose.local.yaml up -d --build
curl --fail http://localhost:4100/health
```

For a NEW live installation, restore its private configuration and data before enabling sync. `scripts/start-production.sh` can bootstrap the basic stack but builds the current checkout: do not use it to promote unfinished staging code to an existing live environment. Existing live releases use the stable approved-main engine described below.

The tracked `scripts/backup-production.sh` backs up only the database with hardcoded default database/user names. It is not a complete backup of this setup. Use the full automation backup and private material inventory in the recovery guide.

## 4. VPS and domain setup performed

- Provider: InterServer, New Jersey; VPS hostname `vps3769756`, IP `162.35.33.141`.
- Order: four KVM slices, $12/month, 8 GB advertised RAM, 160 GB disk, 8,000 GB advertised transfer allowance. These record the order, not a promise of current provider pricing.
- Server reported Ubuntu 26.04.1 LTS; Docker hello-world and Compose checks passed.
- GoDaddy DNS root/www/expenses and later vpn hostname were pointed to the VPS.
- Caddy uses public ports 80/443 and the shared Docker network `oak-edge`.

| VPS path | Purpose | In Git? |
|---|---|---|
| `/opt/oak-expense` | Expense source and deployment files | Source yes; machine-only files below not yet captured |
| `/opt/oak-expense/.env.vps` | Private credentials/config | No |
| `/opt/oak-expense/compose.vps.yaml` | Actual VPS topology | Not present in current Git snapshot |
| `/opt/oak-expense/compose.app.yaml` | Actual VPS app topology | Not present in current Git snapshot |
| `/opt/oak-gateway/conf/Caddyfile` | HTTPS routes and auth | Private actual file; redacted template still needed |
| `/opt/oak-gateway/compose.yaml` and `compose.edge.yaml` | Gateway topology/network | Not present in current Git snapshot |
| `/etc/oak-automation.json` | VPS automation config | No; preserve privately |
| `/opt/oak-expense/restaurant` | Restaurant service | Source in Git; data/config private |

The current GitHub source alone is therefore not a complete bare-server bootstrap. Capture reviewed, redacted versions of the missing deployment definitions and scheduler installer before claiming one-command recovery. Do not overwrite running VPS files with guessed templates.

Read-only VPS checks:

```bash
cd /opt/oak-expense
docker compose --env-file .env.vps -f compose.vps.yaml -f compose.app.yaml ps
curl -u sandip https://expenses.the-oak-lounge.online/api/health
```

The health request prompts for the private gateway password. HTTP 401 without credentials is expected on the protected expense host. Keep database/API/OCR ports private on the VPS.

## 5. Original live-data migration

Mac expense data and receipt files were backed up, copied into `/opt/oak-migration`, and database/attachment contents restored into the VPS stack. SHA-256 checksums were shown after transfer.

Verified baseline on both machines:

- 126 expense records.
- Total expense amount 66,428.70.
- 127 uploaded files excluding macOS `._*` files.

These are historical migration values. Never overwrite today's live database merely to reproduce them. Data added since migration belongs in current backups and sync.

## 6. Approved expense releases

Read [RELEASE-FLOW.md](../RELEASE-FLOW.md) for detailed mechanics and limitations.

Installed and confirmed workflow:

1. Develop/test on Mac staging.
2. Commit/push to GitHub `staging`.
3. Create a PR to `main`; pass `Source checks`.
4. Merge deliberately as release approval.
5. Mac scheduler fetches approved remote main and validates an isolated source checkout.
6. Promote Mac live and verify API, reports, web and OCR health.
7. Deploy the same source commit to the VPS and verify.

GitHub main protection was configured through the UI: PR required; Source checks from GitHub Actions required; up-to-date branch required; approvals left off for the sole owner. No force pushes/deletion. Verify actual protection settings in GitHub when restoring repository administration.

First successful approved release reported by the owner:

```json
{"ok":true,"commit":"a0177b07aeff7aa0c568e2a460f6411fc759eb3d","scope":"expense-api-web-ocr"}
```

The stable Mac engine is outside the working tree, at the configured state's `engine` directory, reported as `/Users/sandip/Library/Application Support/OakAutomation/engine`. Private config is `/Users/sandip/Library/Application Support/OakAutomation/config.json`; the scheduler checks code at its existing five-minute interval. Preserve the actual LaunchAgent, its label and engine in the encrypted recovery set.

The original reviewed installer ZIP is not currently tracked in this repository. On a new Mac, restore the installed engine/LaunchAgent/config from a verified private backup or obtain the reviewed installer. Do not create a second scheduler or point an old deploy-on-HEAD scheduler at development branches.

Database/Compose changes require explicit review. Engine changes require reinstalling the reviewed stable engine; merging code does not replace that private installed copy automatically.

## 7. Data synchronization

Mac live ↔ VPS live daily at 03:00 Asia/Shanghai, with catch-up after sleep/login/Docker restart. Staging records and restaurant data are excluded from this sync.

The sync code:

- Compares database schema and three-way record state.
- Flags conflicting edits for explicit resolution instead of silent overwrite.
- Takes database and upload backups before a changing sync.
- Copies attachment additions and checks filename/hash collisions.
- Uses a journal for interrupted sync recovery.
- Retains physical attachment files rather than deleting them during sync.

Keep the state directory including baseline, pending plan, resolutions, conflicts and deployment markers in private backups. It contains business data. Do not initialize a fresh empty baseline blindly after losing state.

For commands, use the stable engine and private config path, not a potentially old runner from a checked-out branch. Inspect status before retrying an interrupted task. A successful release does not itself prove a changing-data sync has been tested.

## 8. Restaurant and additional modules

Restaurant is live at the root domain. Its staged photo/mobile menu and Instagram code are tracked under `restaurant`; current production features must be checked separately.

Restaurant promotion remains separate:

```bash
cd restaurant
python3 scripts/local.py staging
# Review staging. Only after approval:
python3 scripts/local.py live
# Review Mac live, then:
python3 scripts/local.py package
```

Follow `restaurant/LOCAL-FIRST.md` for the produced release ZIP and VPS installation. Do not copy staging restaurant data into live. The installer must preserve expense and VPN hostname blocks when changing the restaurant Caddy route.

The Instagram account is `theoaklounge786`; connected API authentication and live automatic-feed operation were not confirmed. Keep tokens private.

Inventory/social/keg/AI Compose overlays and source are in Git, but the expense auto-deployer does not start or promote these services. Use each module's guide and validate its data/backup/health behavior separately.

## 9. VPN and bandwidth setup record

These services share the VPS but are not part of the expense deployment or sync.

| Component | Recorded setup |
|---|---|
| ASUS router | RT-AC86U, Merlin 386.10; OpenVPN Client 5, Oak VPS |
| Router endpoint | 162.35.33.141:1194/UDP; TUN; NAT enabled |
| Router DNS/routing | Exclusive DNS; Yes (all) internet redirection |
| Router TLS renegotiation | -1; imported 604800 was rejected by router UI |
| OpenVPN server | `/opt/oak-openvpn`, `openvpn/openvpn-as:latest`, observed version 3.2.3 |
| Admin bind | 127.0.0.1:943; accessed through Mac SSH tunnel at localhost:1943 |
| OpenVPN persistent state | `/opt/oak-openvpn/data` |
| WireGuard | `/opt/oak-vpn`, LinuxServer image, UDP 51820 |
| Clash generated profile | `/opt/oak-vpn/oak-clash.yaml`; contains private keys, excluded from Git |
| Bandwidth monitor | vnStat installed; external interface eth0 |

OpenVPN router connection was reported working. iPhone setup began; final end-to-end result not recorded. WireGuard Android connection not confirmed. Router external exit IP, VPN auto-start, vnStat accumulated usage, provider counting directions and allowance reset period still need verification.

The VPS allowance is shared by VPN, websites, backups and synchronization. Provider usage is the billing reference; Git does not measure bandwidth.

No private VPN profiles, keys, passwords or secret subscription URLs belong in this guide.

## 10. Evidence and remaining gaps

| Item | Status |
|---|---|
| Docker/VPS health and expense migration | Verified through owner outputs |
| Restaurant public root domain | Owner confirmed live |
| GitHub source checks | Screenshot showed passing staging and PR checks |
| Main release a0177b0 | Owner reported successful Mac/VPS deployment |
| Missing VPS Compose/gateway templates | Need reviewed redacted copies |
| Stable-engine bootstrap installer in Git | Not included; preserve original/private installation material |
| Off-server backup and isolated restore drill | Not yet confirmed |
| Private config/secrets recovery | Must be backed up separately |
| WeChat receipt ingestion | Original goal; completed integration not confirmed |

Historical patch documents may describe superseded promotion steps. This guide and the approved release flow describe the current expense release process. Keep historical documents for context, not as instructions to reset a working live installation.
