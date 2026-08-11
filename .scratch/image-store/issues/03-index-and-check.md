# 03 — index.json generation + `pnpm check`

**What to build:** the Index becomes a real, maintained artifact. `download` now also writes `index.json` keyed by map name with Workshop metadata. Generation is repo-image-driven — the files under `images/` are the source of truth — and maps whose Workshop item has vanished keep their previous index record (per ADR 0002). Generation is stable: an unchanged repo yields byte-identical output, so later automated commits cause no churn. Additionally, a `check` command supports hand uploads: it validates that filenames are Legal map names, transcodes non-JPEG files to JPEG in place, and rebuilds the index.

**Blocked by:** 02 — Original-image download pipeline (`pnpm download`).

**Status:** resolved

- [x] `pnpm download` produces `index.json` alongside the images, keyed by map name with Workshop metadata
- [x] A map present in the repo but absent from the enumeration keeps its previous index record
- [x] Rebuilding the index twice over an unchanged repo produces byte-identical output (fixture test)
- [x] `pnpm check` fixes a non-JPEG upload in place (transcoded to JPEG) and rejects a file with an illegal name
- [x] `pnpm check` rebuilds `index.json` to reflect hand-added images

## Comments

Implemented 2026-08-11. `src/pipeline/indexer.ts` builds the index repo-image-driven (files under `images/` are the source of truth): current Winner > previous index record > empty fallback record for hand uploads never seen in the Workshop. Serialization is deterministic (sorted keys, fixed record key order, 2-space indent, trailing newline) so automated commits cause no churn. `src/pipeline/check.ts` validates filename stems and transcodes non-JPEG files in place; it refuses to overwrite an existing `.jpg` for the same map. `pnpm check` is deliberately offline — no Steam API — so hand uploads stay a one-command local fix; the daily Scan enriches fallback records later (ADR 0002). Verified live: `pnpm download --limit 5` enriched the seeded 5 maps with real Workshop metadata, and a following `pnpm check` reported the index unchanged.
