# 02 — Original-image download pipeline (`pnpm download`)

**What to build:** the maintainer can run one command that downloads the Preview image for every Winner and writes it to the repo root as `<name>.jpg`. This lands original-resolution URL handling (strip the entire query string, keep the trailing slash — dropping it yields 404), JPEG transcoding via sharp (quality 90, no resize), and the seeder's idempotency: files already present are skipped, so the run can be interrupted and resumed, and hand-uploaded images are never overwritten. A `--limit N` option exists purely so small-batch verification is possible before seeding the whole corpus.

**Blocked by:** 01 — Project scaffold + Workshop enumeration tracer bullet.

**Status:** ready-for-agent

- [ ] `originalImageUrl` strips all query parameters while keeping the trailing slash; covered by unit tests
- [ ] `pnpm download --limit 5` produces five correctly named JPEGs at the repo root from live Workshop data
- [ ] Source images in any format (PNG/WebP/JPEG) come out as valid JPEG, original resolution preserved
- [ ] Re-running the same command skips existing files instead of re-downloading or overwriting
- [ ] Transcoding has a single smoke test (PNG fixture in → valid JPEG out); no pixel-level assertions
