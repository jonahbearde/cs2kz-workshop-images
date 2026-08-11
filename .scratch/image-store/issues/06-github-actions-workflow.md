# 06 — GitHub Actions workflow

**What to build:** the Scan runs by itself in CI. A workflow on `0 1 * * *` UTC (09:00 Beijing) plus `workflow_dispatch` checks out the repo, installs dependencies, and runs the scan with the three secrets (`STEAM_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`). After scanning, if `index.json` changed it is committed back with the default token (`contents: write`); images are never committed by the workflow. The failure-notification path from the scan carries over to CI, so a dead job announces itself on Telegram.

**Blocked by:** 05 — Telegram sender + `pnpm scan`.

**Status:** resolved

- [x] Workflow triggers on schedule and on manual dispatch
- [x] A manual dispatch delivers the Telegram report from CI
- [x] `index.json` is committed back only when its content changed; no empty commits
- [x] Workflow never stages or commits image files
- [x] A failing scan (simulated via a temporarily broken secret) sends the failure notification to Telegram

## Comments

- 2025-08-11: Implemented as `.github/workflows/scan.yml`. Items 1/3/4 verified by inspection (YAML parse-checked); the commit-back guard is `git add index.json` + `git diff --cached --quiet`, so images can never be staged and no empty commit is possible. A `concurrency: scan` group serializes runs so a dispatch and the schedule can't race on the push. Items 2/5 need a live run on GitHub: push, set the three secrets, then manual-dispatch once and once with a deliberately broken secret.
- 2025-08-11: Live-verified on GitHub Actions via `gh` CLI. Run 31476462085 (good secrets): scan completed, 8 message(s) sent to Telegram (job success proves the Telegram API accepted every message), commit-back step took the no-op branch ("index.json unchanged; nothing to commit." — no empty commit). Run 31476548261 (STEAM_API_KEY temporarily broken): enumeration failed with HTTP 403, the failure path attempted the `❌ Scan failed: ...` notification, job exited 1, commit-back skipped. Secret restored afterwards.
