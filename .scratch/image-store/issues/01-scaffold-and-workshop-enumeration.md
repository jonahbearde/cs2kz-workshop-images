# 01 — Project scaffold + Workshop enumeration tracer bullet

**What to build:** a working pnpm + TypeScript + vitest project whose first end-to-end path is: talk to the Steam Web API, enumerate the whole Workshop corpus, and print every KZ map. This lands the WorkshopClient (paginated `IPublishedFileService/QueryFiles`, the only module that touches Steam), the strict KZ map filter (CS2 tag required, title must match the Legal map name rule, no normalization), and Winner selection among same-named items. A `list` CLI command prints Winner map names and a total count using a real `STEAM_API_KEY` from the environment. Offline tests drive the filter and Winner logic with fixture data — no network in tests.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Project initialized with pnpm, TypeScript, vitest; typecheck and tests pass in CI
- [x] WorkshopClient paginates `QueryFiles` to exhaustion and returns a typed item list (id, title, tags, time updated, preview URL)
- [x] Filter rejects non-CS2-tagged items and any title failing the strict Legal map name rule; verified by fixture tests covering `KZ_x`, `kz-x`, and trailing-junk titles
- [x] Winner rule (most recent `time_updated` per name) covered by fixture tests including a tie case
- [x] `pnpm list` with a real API key prints the full KZ map list (expected magnitude: a few hundred entries)

## Comments

Implemented 2026-02-10. Live run with a real `STEAM_API_KEY`: 141,990 items enumerated from the app-730 corpus, 420 items passed the KZ filter, 414 Winners printed.

Findings from the live API that shaped the implementation:

- **Pagination**: `QueryFiles` page-based pagination caps out around page 501. Deep pagination only works via cursor: start with `cursor=*`, then follow `response.next_cursor` until an empty page. This is what `WorkshopClient` does.
- **Tag casing**: the Workshop stores the CS2 tag as `Cs2`, not `CS2`. `filterKzMaps` matches the tag case-insensitively; titles remain strictly case-sensitive.
- **Server-side tag filters are unreliable** (`requiredtags` is silently ignored unless certain `query_type` values are set, and behaves wrongly even then), so the client enumerates the whole app-730 corpus and all filtering happens in the pure pipeline, as the spec intended.
- Full enumeration is ~1,400 requests and takes roughly 15-25 minutes; the CLI reports progress per page.
- The script is named `list` but must be invoked as `pnpm run list` — bare `pnpm list` is shadowed by pnpm's built-in `ls` command.
