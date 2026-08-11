# 07 — Documentation

**What to build:** everything a human needs to operate this repo, written after the pipeline is settled so it describes reality. The README states the public URL contract (`raw/main/images/<name>.jpg`, JPEG-only, filename is the Legal map name), the repo layout, and how to use each command. A first-timer's Telegram bot guide walks from zero — creating the bot via BotFather, obtaining the token, starting a private chat, obtaining the chat id — assuming no prior Telegram API knowledge. Steam API key acquisition and where each secret is configured (local env vs GitHub Actions) are documented as prerequisites, with links to the ADRs explaining the JPEG contract, the Actions-generated index, and search-based enumeration.

**Blocked by:** 06 — GitHub Actions workflow.

**Status:** resolved

- [x] README documents the consumer URL contract, repo layout, and the `download` / `check` / `scan` / `list` commands
- [x] Telegram guide takes a complete beginner from no bot to a working `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`, targeting a private chat with the bot
- [x] Steam Web API key setup is documented for both local runs and the workflow secrets
- [x] ADRs 0001, 0002, and 0003 are linked from the README where the corresponding behaviour is described
- [x] All documented commands and secret names match the shipped implementation exactly

## Comments

- Resolved by adding `README.md`: consumer URL contract + index.json shape, repo layout, how-it-works overview, prerequisites (Steam key for local `.env` and Actions secrets), zero-to-working Telegram bot guide (BotFather → token → private chat → `getUpdates` chat id), all four commands (`download` incl. `--limit`, `list`, `check`, `scan`), the hand-upload workflow, and inline + footer links to ADRs 0001/0002/0003.
