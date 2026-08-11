# 03 — index.json generation + `pnpm check`

**What to build:** the Index becomes a real, maintained artifact. `download` now also writes `index.json` keyed by map name with Workshop metadata. Generation is repo-image-driven — the files under `images/` are the source of truth — and maps whose Workshop item has vanished keep their previous index record (per ADR 0002). Generation is stable: an unchanged repo yields byte-identical output, so later automated commits cause no churn. Additionally, a `check` command supports hand uploads: it validates that filenames are Legal map names, transcodes non-JPEG files to JPEG in place, and rebuilds the index.

**Blocked by:** 02 — Original-image download pipeline (`pnpm download`).

**Status:** ready-for-agent

- [ ] `pnpm download` produces `index.json` alongside the images, keyed by map name with Workshop metadata
- [ ] A map present in the repo but absent from the enumeration keeps its previous index record
- [ ] Rebuilding the index twice over an unchanged repo produces byte-identical output (fixture test)
- [ ] `pnpm check` fixes a non-JPEG upload in place (transcoded to JPEG) and rejects a file with an illegal name
- [ ] `pnpm check` rebuilds `index.json` to reflect hand-added images
