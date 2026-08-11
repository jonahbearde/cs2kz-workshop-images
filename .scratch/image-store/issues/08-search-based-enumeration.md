# 08 — Search-based enumeration

**What to build:** switch `WorkshopClient` from full-corpus traversal to a single search pass per ADR 0003: `QueryFiles` with `search_text=kz` and `appid=730`, cursor-paginated to exhaustion. The full-corpus path is deleted outright — no mode switch, no leftover option — because the seed download (`pnpm download`, issue 02) also uses the search pass. The pure pipeline (filter, Winner selection) is untouched; only the Steam-side query changes. This trades constructive completeness for speed (~1,400 requests / 15-25 min → ~15 requests / under a minute); the safety argument is the additive-only repo invariant, recorded in the ADR.

**Blocked by:** None — changes the client shipped by issue 01. Issues 02-06 build on top of this one.

**Status:** ready-for-agent

- [ ] `WorkshopClient.enumerate()` performs a single `search_text=kz` pass (`appid=730`, cursor-paginated to exhaustion); the full-corpus path and any dead option are removed
- [ ] `pnpm run list` with a real API key completes end-to-end in about a minute and still prints sorted Winner names with a total count
- [ ] Live output is in the expected magnitude (~400 Winners); the exact set may differ from run to run by 5-17% — that is sampling variance, not a bug
- [ ] Typecheck and the existing offline test suite stay green (filter/Winners fixtures are unaffected)
- [ ] The `list` CLI no longer warns about 15-25 minute runtimes; progress reporting stays
