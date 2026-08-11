# 05 — Telegram sender + `pnpm scan`

**What to build:** the Scan becomes runnable end-to-end on the maintainer's machine. A thin Telegram sender posts each rendered message in order to the configured private chat (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`). The `scan` command wires enumeration → diff against the repo → index rebuild → report → send, and always sends — unchanged results are still reported, so silence never means "the job died". If the scan itself fails at any stage, a failure notification with the reason is sent to the same chat as a best-effort final step.

**Blocked by:** 03 — index.json generation + `pnpm check`; 04 — Diff and report rendering.

**Status:** resolved

- [x] `pnpm scan` with live credentials completes enumeration, prints the report, and delivers it to Telegram
- [x] The index is rebuilt during the scan using repo images as the source of truth
- [x] A scan whose result is unchanged from yesterday still sends the full report
- [x] A simulated failure (e.g. bad API key) results in a Telegram failure notification naming the cause, and a non-zero exit
- [x] Messages arrive in order, each within Telegram's length limit

## Comments

Implemented 2026-08-11. `src/telegram/client.ts` is the thin Telegram sender — the only module that talks to the Bot API, wrapping `sendMessage` and surfacing the API's `description` on rejection. `src/scan/scan.ts` holds `runScan`, the Scan orchestration with injected deps (enumerate / listRepoMaps / rebuildIndex / send): enumerate → diff against the repo → index rebuild → render → sequential sends, so messages arrive in order; the report is always sent, and any stage failure triggers a best-effort `❌ Scan failed: <reason>` notification to the same chat before the original error is rethrown (a notification failure never masks the original error). `src/cli/scan.ts` wires env validation (`STEAM_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`), progress reporting, and the report echo to stdout. 10 new tests, all offline with stubbed fetch.

Verified live against Telegram: a real `pnpm scan` delivered 8 in-order messages (header + 370 Missing maps); a bogus Steam key delivered the `❌ Scan failed: QueryFiles failed with HTTP 403` notification and exited 1. The live run exposed a Node 24 + Windows libuv crash (assertion in `win/async.c` when `process.exit()` runs after a fetch), so all CLI error paths now set `process.exitCode = 1` instead of calling `process.exit()`.
