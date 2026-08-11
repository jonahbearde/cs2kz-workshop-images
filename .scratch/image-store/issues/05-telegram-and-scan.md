# 05 — Telegram sender + `pnpm scan`

**What to build:** the Scan becomes runnable end-to-end on the maintainer's machine. A thin Telegram sender posts each rendered message in order to the configured private chat (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`). The `scan` command wires enumeration → diff against the repo → index rebuild → report → send, and always sends — unchanged results are still reported, so silence never means "the job died". If the scan itself fails at any stage, a failure notification with the reason is sent to the same chat as a best-effort final step.

**Blocked by:** 03 — index.json generation + `pnpm check`; 04 — Diff and report rendering.

**Status:** ready-for-agent

- [ ] `pnpm scan` with live credentials completes enumeration, prints the report, and delivers it to Telegram
- [ ] The index is rebuilt during the scan using repo images as the source of truth
- [ ] A scan whose result is unchanged from yesterday still sends the full report
- [ ] A simulated failure (e.g. bad API key) results in a Telegram failure notification naming the cause, and a non-zero exit
- [ ] Messages arrive in order, each within Telegram's length limit
