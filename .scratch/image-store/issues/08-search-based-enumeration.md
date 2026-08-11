# 08 — Search-based enumeration

**What to build:** switch `WorkshopClient` from full-corpus traversal to a single search pass per ADR 0003: `QueryFiles` with `search_text=kz` and `appid=730`, cursor-paginated to exhaustion. The full-corpus path is deleted outright — no mode switch, no leftover option — because the seed download (`pnpm download`, issue 02) also uses the search pass. The pure pipeline (filter, Winner selection) is untouched; only the Steam-side query changes. This trades constructive completeness for speed (~1,400 requests / 15-25 min → ~15 requests / under a minute); the safety argument is the additive-only repo invariant, recorded in the ADR.

**Blocked by:** None — changes the client shipped by issue 01. Issues 02-06 build on top of this one.

**Status:** resolved

- [x] `WorkshopClient.enumerate()` performs a single `search_text=kz` pass (`appid=730`, cursor-paginated to exhaustion); the full-corpus path and any dead option are removed
- [x] `pnpm run list` with a real API key completes end-to-end in about a minute and still prints sorted Winner names with a total count
- [x] Live output is in the expected magnitude (~400 Winners); the exact set may differ from run to run by 5-17% — that is sampling variance, not a bug
- [x] Typecheck and the existing offline test suite stay green (filter/Winners fixtures are unaffected)
- [x] The `list` CLI no longer warns about 15-25 minute runtimes; progress reporting stays

## Comments

Implemented 2026-08-11. `enumerate()` now sends `search_text=kz` on every `QueryFiles` page; the full-corpus semantics were already gone after issue 01's cursor fix, so only the query parameter, docs, and CLI wording changed. New offline tests in `src/workshop/client.test.ts` cover the request shape (`search_text=kz`, `appid=730`, `cursor=*`), cursor following to an empty page, early stop without `next_cursor`, `result !== 1` record rejection, and per-page progress.

Live run with a real `STEAM_API_KEY`: 14 seconds, ~14 requests, 1,355 items returned, 410 passed the KZ filter, **378 Winners** printed. Against issue 01's full-corpus measurement (414 Winners) that is a 9% shortfall — inside the 5-17% sampling variance ADR 0003 predicted.

Also landed while verifying: the `list` script now loads `.env` via Node's native `--env-file-if-exists` (no dotenv dependency), `.env` is git-ignored, and a `.env.example` documents where to get a key.
