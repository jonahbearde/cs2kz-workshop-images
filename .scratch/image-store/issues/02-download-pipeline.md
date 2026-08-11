# 02 — Original-image download pipeline (`pnpm download`)

**What to build:** the maintainer can run one command that downloads the Preview image for every Winner and writes it under `images/` as `<name>.jpg`. This lands original-resolution URL handling (strip the entire query string, keep the trailing slash — dropping it yields 404), JPEG transcoding via sharp (quality 90, no resize), and the seeder's idempotency: files already present are skipped, so the run can be interrupted and resumed, and hand-uploaded images are never overwritten. A `--limit N` option exists purely so small-batch verification is possible before seeding the whole corpus.

**Blocked by:** 01 — Project scaffold + Workshop enumeration tracer bullet; 08 — Search-based enumeration.

**Note:** enumeration is a single search pass (ADR 0003), so the initial seed is probabilistically complete — maps the sample misses are surfaced by later Scans. Nothing is ever deleted.

**Status:** resolved

- [x] `originalImageUrl` strips all query parameters while keeping the trailing slash; covered by unit tests
- [x] `pnpm download --limit 5` produces five correctly named JPEGs under `images/` from live Workshop data
- [x] Source images in any format (PNG/WebP/JPEG) come out as valid JPEG, original resolution preserved
- [x] Re-running the same command skips existing files instead of re-downloading or overwriting
- [x] Transcoding has a single smoke test (PNG fixture in → valid JPEG out); no pixel-level assertions

## Comments

Implemented 2026-08-11.

- `originalImageUrl` (`src/pipeline/images.ts`): strips everything from `?` onward, leaves the path — trailing slash included — untouched. Seven unit tests, including the 404 case the spec warns about (dropping the trailing slash).
- `toJpeg` (`src/pipeline/transcode.ts`): `sharp(image).jpeg({ quality: 90 })`, no resize. Smoke test builds a PNG fixture at runtime (solid colour via sharp `create`), transcodes it, and asserts only JPEG magic bytes, `metadata().format === "jpeg"`, and unchanged dimensions — no pixel-level assertions.
- `pnpm run download [--limit N]` (`src/cli/download.ts`): enumerates via the existing search pass (ADR 0003), filters, picks Winners, then downloads each Winner's preview at its original-resolution URL and writes `images/<name>.jpg`. Existing files are skipped up front, so the run is resumable and hand-uploaded images are never overwritten. Each image is written to `<name>.jpg.tmp` then renamed, so an interrupted run can't leave a half-written image. Winners without a preview are counted and skipped; per-image download failures are collected and reported, exiting non-zero if any failed.
- Live verification with a real `STEAM_API_KEY`: search pass returned 1,266 items, 353 KZ maps; `pnpm run download --limit 5` wrote five valid JPEGs (`kz_11342` … `kz_16pillars`). Stored dimensions match the live original-resolution source exactly (555×312). A second run skipped all five with byte-identical files (md5-verified). In the current corpus every Winner's preview is already JPEG at the source, so the non-JPEG branch is covered by the offline PNG smoke test rather than a live case.
