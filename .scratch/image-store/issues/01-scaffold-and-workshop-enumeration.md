# 01 — Project scaffold + Workshop enumeration tracer bullet

**What to build:** a working pnpm + TypeScript + vitest project whose first end-to-end path is: talk to the Steam Web API, enumerate the whole Workshop corpus, and print every KZ map. This lands the WorkshopClient (paginated `IPublishedFileService/QueryFiles`, the only module that touches Steam), the strict KZ map filter (CS2 tag required, title must match the Legal map name rule, no normalization), and Winner selection among same-named items. A `list` CLI command prints Winner map names and a total count using a real `STEAM_API_KEY` from the environment. Offline tests drive the filter and Winner logic with fixture data — no network in tests.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Project initialized with pnpm, TypeScript, vitest; typecheck and tests pass in CI
- [ ] WorkshopClient paginates `QueryFiles` to exhaustion and returns a typed item list (id, title, tags, time updated, preview URL)
- [ ] Filter rejects non-CS2-tagged items and any title failing the strict Legal map name rule; verified by fixture tests covering `KZ_x`, `kz-x`, and trailing-junk titles
- [ ] Winner rule (most recent `time_updated` per name) covered by fixture tests including a tie case
- [ ] `pnpm list` with a real API key prints the full KZ map list (expected magnitude: a few hundred entries)
