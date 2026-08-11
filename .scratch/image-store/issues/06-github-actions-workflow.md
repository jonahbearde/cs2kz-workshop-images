# 06 — GitHub Actions workflow

**What to build:** the Scan runs by itself in CI. A workflow on `0 1 * * *` UTC (09:00 Beijing) plus `workflow_dispatch` checks out the repo, installs dependencies, and runs the scan with the three secrets (`STEAM_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`). After scanning, if `index.json` changed it is committed back with the default token (`contents: write`); images are never committed by the workflow. The failure-notification path from the scan carries over to CI, so a dead job announces itself on Telegram.

**Blocked by:** 05 — Telegram sender + `pnpm scan`.

**Status:** ready-for-agent

- [ ] Workflow triggers on schedule and on manual dispatch
- [ ] A manual dispatch delivers the Telegram report from CI
- [ ] `index.json` is committed back only when its content changed; no empty commits
- [ ] Workflow never stages or commits image files
- [ ] A failing scan (simulated via a temporarily broken secret) sends the failure notification to Telegram
