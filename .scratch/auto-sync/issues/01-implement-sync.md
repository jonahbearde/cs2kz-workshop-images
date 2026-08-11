# 01 — Implement the automated Sync

**What to build:** turn the daily report-only Scan into the full Sync per `spec.md`: Stale detection in the diff (index `previewUrl` comparison), Stale bucket + run-result renderer, download orchestration with 3-attempt retries, `runSync` orchestration with non-blocking Telegram semantics, `pnpm sync` CLI, `sync.yml` workflow committing images + index in one commit, README/CONTEXT updates.

**Blocked by:** None — design fully settled in the grilling session (see `spec.md`).

**Status:** resolved

- [x] `diffRepo` accepts the Index and partitions stored maps into have/stale (previewUrl comparison; no record → have; winner without preview → have)
- [x] Report header shows four buckets; Stale section mirrors Missing; `pnpm scan` also sees Stale via the index
- [x] `renderResult` renders the run-result message (downloaded / updated / failed with reasons; "nothing to do" when empty), split-safe
- [x] `downloadAll` retries each image up to 3 times (2 s delay), classifies downloaded/updated/failed, one task's failure never stops the rest
- [x] `runSync`: report sent before downloads, result after; send failures never abort but are reported via `telegramFailed`; fatal errors send `❌ Sync failed: …` best-effort and rethrow
- [x] `pnpm sync` CLI exits non-zero on download failures, send failures, or fatal errors
- [x] `sync.yml` (renamed from `scan.yml`) runs `pnpm sync` and commits images + index.json in one `Sync: add N, update M image(s)` commit
- [x] README reflects the automated flow; hand upload demoted to fallback; ADR 0004 linked

## Comments

## Comments

Implemented 2026-08-11. Test-first throughout; 113 offline tests green, typecheck clean.

- Stale detection lives in `diffRepo` (`src/report/diff.ts`): a stored map is Stale when `originalImageUrl(winner.previewUrl)` differs from the Index record's `previewUrl`. Edge rules tested: no record / empty record → never stale; winner without preview → keep stored image.
- `runSync` (`src/sync/sync.ts`) reads the index BEFORE the rebuild (otherwise the winner would be compared against itself), sends the report first and the result message last, and never lets a Telegram failure abort the run — `telegramFailed` surfaces it instead. `downloadAll` (`src/sync/download.ts`) does 3 attempts per image with a 2 s delay; writes count against the attempt budget too.
- `fetchPreviewJpeg`/`writeImageAtomic` were extracted to `src/pipeline/store.ts` during code review (Duplicated Code) and are shared by the `download` and `sync` CLIs.
- `runScan` gained an optional `readIndex` dep so `pnpm scan` reports Stale too; the daily workflow is now `sync.yml` committing `Sync: add N, update M image(s)`.
- Known acceptable edge: an index-only change commits `Sync: add 0, update 0 image(s)` — accurate, not a bug.
- Not live-run locally (would send real Telegram messages and mutate the working tree); first real exercise is a manual `workflow_dispatch` of the Sync.
