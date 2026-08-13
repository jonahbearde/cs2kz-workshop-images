# 09 — Non-kz maps as permanent hand-upload-only images

**What to build:** the repo accepts hand-uploaded images whose names are not KZ map names (e.g. `de_dust2`). These images are a permanent exception: they are never enumerated, downloaded, overwritten, or indexed by the Workshop machinery — only `pnpm check` and the URL contract apply to them.

**Blocked by:** 03 — index.json generation + `pnpm check`.

**Status:** resolved

- [x] Two predicates: Workshop eligibility stays `^kz_[a-z0-9_]+$`; a new Storable map name `^[a-z][a-z0-9_]*$` governs what `pnpm check` accepts into `images/`
- [x] `index.json` never contains non-kz maps (index rebuild filters by the kz predicate; `mapCount` counts index entries)
- [x] `listRepoMaps` returns every storable map (kz and non-kz), so the Sync's diff sees them and ignores them (stored maps with no Winner are already ignored by `diffRepo`)
- [x] ADR 0005 records the decision; ADR 0001 gets an amended banner
- [x] README URL-contract section and CONTEXT.md vocabulary updated

## Decisions (grilling session)

- Exception scope: the storage predicate is open (`^[a-z][a-z0-9_]*$`), not a `de_`-only whitelist — but Workshop-side eligibility is unchanged, so nothing new can be auto-synced.
- Non-kz images are permanent, not stopgaps: the Sync can never see them as Winners, never judges them Stale, and never re-downloads them.
- `index.json` stays pure KZ Workshop metadata; consumers address non-kz images by URL alone.
- Repo name and overall positioning unchanged; the exception is documented, not branded.
- Commit split: (1) code + tests + ADR + docs, (2) the actual `de_*` images.

## Comments

Implemented 2026-08-13. The predicate split lives in `src/pipeline/filter.ts` (`isLegalMapName` unchanged for the Workshop side, new `isStorableMapName` for storage); `check` gates on the storable predicate, `listRepoMaps` returns every storable map, and `buildIndex` skips non-legal names so the index stays KZ-only (`mapCount` now counts index entries). Verified with `pnpm check` over seven `de_*` uploads: all accepted, `index.json` unchanged at 415 kz maps. Passed a two-axis review (Standards + Spec); follow-ups applied — check-error wording uses "storable map name", README hand-upload sentence scoped to KZ uploads, CONTEXT.md vocabulary list completed. The seven `de_*` images ship in a separate commit per the grilling decision.
