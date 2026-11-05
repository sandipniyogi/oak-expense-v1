# 03 — Git and workstation setup

[Handbook index](README.md)

## 1. Understand the two kinds of setup

**Existing Sandip Mac:** use the existing checkout, private configuration, Docker volumes and installed agents. Do not clone into the same directory, recreate secrets or run production bootstrap commands.

**New developer Mac:** clone source and create isolated staging resources. A new checkout does not contain production credentials, live records, SSH access or installed automation. Do not create a second production scheduler just because the source contains `runner.py`.

## 2. Install/check tools

Mac, observation only:

```bash
xcode-select -p
git --version
python3 --version
docker --version
docker compose version
gh --version
```

If Apple's command-line tools are missing, `xcode-select --install` opens their installer. Install Docker Desktop for the correct Mac architecture from the [official Mac guide](https://docs.docker.com/desktop/setup/install/mac-install/) and open it. Confirm `docker info` succeeds. A Docker CLI version alone does not prove the Docker daemon is running.

If using Homebrew, install it by following its [official installation page](https://docs.brew.sh/Installation), then install missing developer commands:

```bash
brew install git gh python
```

Do not reinstall working tools merely to match this example. Homebrew may ask you to update your shell PATH; follow the instructions for your machine. `/opt/homebrew` is common on Apple silicon. CI uses Python 3.12 and Node 24. App containers supply Node for most local operation. If you want to run the full CI commands directly on the Mac:

```bash
brew install node@24
```

Use the package's printed PATH instructions and verify `node --version`. This is optional for Docker-based test helpers; it does not change the Node version inside existing containers. Do not upgrade Docker, PostgreSQL or live images as an incidental onboarding step.

## 3. Configure Git identity

Git records an author name and email in commits. Use your own identity and a verified GitHub email or GitHub-provided private noreply address:

```bash
git config --global user.name "YOUR_NAME"
git config --global user.email "YOUR_EMAIL"
git config --global init.defaultBranch main
```

These settings do not log in to GitHub. Inside an existing repository, use `git config user.name` and `git config user.email` to see its effective values. Avoid printing all Git configuration into shared logs; it can contain sensitive URLs or helper settings.

## 4. Authenticate with GitHub

The current repository URL uses HTTPS. A straightforward setup is:

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
gh auth status
```

Complete the browser authorization using your own allowed account. Never paste a token into chat, documentation, a remote URL or a shell command. The unattended job needs credentials usable in its logged-in Mac session. If Terminal access works but the background job cannot fetch, investigate its PATH and credential access instead of disabling checks.

GitHub SSH is an alternative, not a required replacement for working HTTPS. If choosing SSH, create a **GitHub-specific** key, add only its `.pub` contents to GitHub and follow GitHub's official instructions. Test with `ssh -T git@github.com` after verifying GitHub's published host fingerprint. Its successful message says GitHub does not provide shell access; that is normal. Never reuse a forced-command VPS automation key as a GitHub key.

## 5. Open or clone the repository

Existing Mac:

```bash
cd "$HOME/Desktop/oak-expense-v1"
git rev-parse --show-toplevel
git status --short --branch
git remote -v
git fetch origin
git log -3 --oneline --decorate
```

Expected origin: `https://github.com/sandipniyogi/oak-expense-v1.git` or its recognized GitHub SSH equivalent. Do not run `git init` in the existing checkout. Do not replace its origin to solve authentication.

New developer only, in an empty destination:

```bash
cd "$HOME/Desktop"
git clone https://github.com/sandipniyogi/oak-expense-v1.git
cd oak-expense-v1
git fetch origin
```

A public clone may succeed without write permission; pushing still needs authorized access. Ask the repository owner to grant the correct account permission through GitHub. Do not share the owner's login.

## 6. Learn the normal Git commands

| Command | Effect | Does it deploy? |
| --- | --- | --- |
| `git status --short --branch` | Show local changes and branch state | No |
| `git diff` | Show unstaged tracked-file edits | No |
| `git diff --cached` | Show what the next commit will contain | No |
| `git fetch origin` | Update remote-tracking refs | No |
| `git switch staging` | Change the source checkout branch | No; running containers keep their images |
| `git merge --ff-only origin/main` | Advance current branch only if no merge is needed | No |
| `git add PATH` | Stage selected files for a commit | No |
| `git commit -m "message"` | Record staged source locally | No |
| `git push -u origin staging` | Publish local commits | Not itself; a later approved main merge can trigger deployment |
| `gh pr create` | Propose changes for review | No |
| `gh pr merge PR_NUMBER --merge` | Merge reviewed code to main | Can trigger the enabled automatic deployment job |

`origin/main` is the last fetched remote main, not a guaranteed live network view. `fetch` does not update your branch's files. `pull` combines fetching with branch integration. This handbook uses explicit fetch and `--ff-only` to make that distinction visible.

## 7. Choose a branch without importing unrelated work

The current pre-push policy in main explicitly allows `staging` and `feature/company-funds`. It does **not** allow arbitrary `feature/...` or `docs/...` branches automatically. Inspect `scripts/preflight-push.py` before choosing a new branch name. Expanding that allowlist is a reviewed policy change, not a reason to bypass the hook.

Check whether staging already contains unrelated work:

```bash
git fetch origin
git log --oneline origin/main..origin/staging
git diff --stat origin/main...origin/staging
```

Earlier strict-sync work lived on staging/draft PR #9. Do not merge every staging commit into main just to publish one feature. Prefer a clean, approved development branch for isolated changes. The already approved `feature/company-funds` branch can be reused for the documentation-only handover after #10, provided its history is inspected and advanced safely. Do not overwrite unmerged feature work.

## 8. Hooks and the push preflight

On the configured Mac, the pre-push hook runs a read-only check before a permitted push. It requires a clean working tree, expected origin, correct ancestry, both hosts online, approved live source and matching observed content. It grants no application write permit.

A clone does not normally copy local Git hooks. Read the owner's policy before installing one. To install the repository's existing preflight on an authorized developer Mac:

```bash
python3 scripts/preflight-push.py --project "$PWD" --install-hook
```

The installer preserves an existing custom hook or `core.hooksPath` by refusing to overwrite it. Have a maintainer integrate both checks. Do not delete the hook, use `--no-verify`, change hooksPath to an empty directory or bypass a rejected live verification.

If you switch to an old branch without `scripts/preflight-push.py`, the installed hook can fail. Return to reviewed source that includes the helper, or integrate it through a reviewed change. Do not install a random copy from an old ZIP without checking its version.

## 9. Private files and staging configuration

Keep real `.env` files, SSH private keys, auth hashes, database dumps, storage, uploads, backups, session stores and resolved Compose files outside commits. Examples under `docs/examples` are templates; replace placeholders privately on a new staging installation. Restore existing values on an existing Mac.

Use `git check-ignore PATH` to confirm an intended private file is ignored. Local-only `tools/` may be excluded in `.git/info/exclude`; that exclusion is not shared with a new clone. Review untracked files before every commit. Prefer `git add specific/path` over `git add .`.

Never copy live database credentials into staging just to make a test pass. Staging needs its own project name, database, host ports and upload paths. Production restore/bootstrap is an operator task described in [recovery](08-recovery.md), not a prerequisite for learning Git.

## Official references

[Git setup](https://docs.github.com/en/get-started/git-basics/set-up-git), [git switch](https://git-scm.com/docs/git-switch), [GitHub CLI login](https://cli.github.com/manual/gh_auth_login), [SSH test](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/testing-your-ssh-connection).
