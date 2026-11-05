# 09 — Troubleshooting and security

[Handbook index](README.md)

## Start with observation

Mac, harmless inventory:

```bash
cd "$HOME/Desktop/oak-expense-v1"
git status --short --branch
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
python3 "$HOME/Library/Application Support/OakAutomation/automatic-code/service/manage.py" status
```

Do not start with rebuilds, restarts or direct SQL. Note the exact failing command and whether it targeted staging or live.

## Common issues

| Symptom | Likely category | Next action |
| --- | --- | --- |
| `node: command not found` on Mac | Host Node absent | Use Docker-based project helpers or install compatible Node; do not change live images |
| Docker cannot connect | Desktop daemon stopped | Open Docker Desktop and retry `docker info` |
| Docker Hub token/metadata timeout | Registry/network/DNS path | Retry connectivity/base-image retrieval later; not proof of broken app source |
| Staging module proxies fail | Routing/readiness/model | Check direct service logs and proxy route separately |
| AI health says model unavailable | Ollama/model configuration | Compare configured URL/model with the installed host model; do not assume Mac and VPS model names match |
| Company-funds page/API returns 404 | Feature flag/overlay or old image | Inspect correct staging starter and image; do not reapply live SQL blindly |
| `Untracked database tables` | Explicit sync scope rejected unknown tables | Review migration/scope/boundaries; do not ignore tables by prefix wildcard |
| Source mismatch | Running source differs from approved record | Inspect actual host version; do not rewrite the expected commit |
| Data differs but counts match | Field/identity/file difference | Review scoped content evidence, not counts alone |
| Hook missing `preflight-push.py` | Old checkout branch missing installed hook target | Return/integrate reviewed helper; preserve hook |
| Hook says branch not approved | Explicit allowlist | Use an approved branch or reviewed policy extension |
| `new blank line at EOF` from diff check | Whitespace problem | Remove unintended trailing blank line and rerun `git diff --check` |
| Tests pass but temporary file cleanup fails | Test-copy ownership | Verify exact disposable test path and container; maintainer fixes cleanup ownership only |
| Service logs contain SIGTERM | Process was stopped | Correlate with intentional test/rollback stops; SIGTERM alone is not proof of application crash |
| Public website 502 | Gateway/upstream reachability | Check upstream internal health, Docker DNS/network and then public HTTPS |
| `ENOTFOUND` for restaurant | DNS name missing from caller's network | Inspect actual container attachments/aliases and caller network |
| Restaurant `EACCES /app/server.mjs` | Image file permissions | Use the committed Dockerfile permission fix and tested build; do not run live as root to hide it |
| `ADMIN_PASSWORD_HASH is required` | Missing private restaurant environment | Restore the correct private configuration; never put plaintext credentials in source |
| `Live configuration changed since preparation` | Real drift or old control-tool bug | Compare actual settings/source version; retain the environment-copy fix; do not weaken checks |
| SSH timeout / outcome unknown | Remote may still be operating | Refresh exact host status before retrying |
| `attention_required` | Started automatic rollout failed | Disable future runs, inspect/recover exact workflow; do not clear journal |

## Read application health

Mac staging, GET only:

```bash
curl --noproxy '*' --fail --max-time 10 http://127.0.0.1:4100/health
curl --noproxy '*' --fail --max-time 10 http://127.0.0.1:3100/module-api/inventory/health
curl --noproxy '*' --fail --max-time 10 http://127.0.0.1:3100/module-api/keg/health
curl --noproxy '*' --fail --max-time 10 http://127.0.0.1:3100/module-api/social/health
curl --noproxy '*' --fail --max-time 10 http://127.0.0.1:3100/module-api/ai/health
```

Mac live expense health uses API port 4000. Restaurant health is `/api/health` at port 3080. Public restaurant health is `https://the-oak-lounge.online/api/health`. A health response must be interpreted with its body, model availability where required and expected running image identity. Do not test production write locks by POSTing dummy expense records into a live system.

Read a bounded log instead of dumping unlimited output:

```bash
docker logs --tail 80 oak-expense-staging-api-1
docker logs --tail 80 oak-expense-staging-web-1
```

Choose the correct container. Logs can contain business details; redact before sharing.

## VPS observation

Use your authorized SSH access. The existing host address is held in private configuration; the historical production address is `162.35.33.141`. Never change known-host verification to get around an unexplained host-key warning.

VPS, after SSH login, observation only:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
free -h
df -h /opt
docker logs --tail 80 oak-vps-api-1
docker logs --tail 80 oak-restaurant-website-1
```

Module containers may use only the application network; public web/restaurant also use `oak-edge`. A service can be healthy internally but unreachable by its caller. Inspect networks before making changes. Do not reconnect production networks or rewrite Caddy without an explicit reviewed infrastructure change.

## Credentials are different things

| Credential | Used for | Never confuse with |
| --- | --- | --- |
| GitHub login/token/key | Repository read/write and CI queries | VPS root login |
| VPS administrative SSH | Authorized host administration | Forced-command automation key |
| Expense sync key | Restricted `oak-automation` endpoint | General-purpose shell access |
| Read-only verifier key | Restricted `oak-strict-verify` endpoint | Permission to apply a merge |
| Release-control key | Restricted `oak-release-control` endpoint | Independent server-side GitHub approval |
| Expense website access | Existing public app/gateway protection | Restaurant admin login |
| Restaurant admin password/hash | Restaurant content administration | Expense or VPS password |
| Staging admin credentials | Test environment only | Production admin credentials |

The dedicated release endpoint trusts source/artifact input from its authorized Mac control key. GitHub approval checks happen on the Mac; do not claim the VPS independently rechecks GitHub permissions. Restrict and protect that key accordingly.

Private keys, tokens and auth hashes stay private. `.pub` is a public key, but still share only when needed. Never paste the full environment, resolved Compose, SSH config with secrets or raw database dumps into GitHub issues. Do not add a credential to a remote URL.

## Password resets and account handover

This repository does not establish one universal password-reset mechanism for the expense site. Identify whether the login is enforced by Caddy, another access layer or the application before changing anything. Restaurant admin has its own hash/configuration. An owner should reset through the actual deployed mechanism, take a private configuration backup and verify login. Do not change PostgreSQL passwords as a substitute for resetting web access.

If a real secret has been committed or posted publicly, remove it from current content **and rotate it**. A later delete commit does not erase old Git history. Coordinate any history cleanup carefully rather than force-pushing production history impulsively.

## Commands to keep out of routine troubleshooting

Do not use `docker compose down -v`, `docker volume rm`, `docker system prune --volumes`, `git reset --hard`, `git clean -fd`, force push, direct production table deletion or unconditional database restore as quick fixes. Do not run a bare `docker compose up -d --build` from an arbitrary checkout on the managed live stacks. Do not disable TLS/SSH verification to make a diagnostic pass.

A support report should contain the environment, command, time (Asia/Shanghai), commit, redacted error, current phase and actions already taken. It should not contain passwords, raw customer data or secret-resolved configuration.
