Status: ready-for-agent

# Spec: CS2 KZ Workshop Image Store

## Problem Statement

Other applications need a preview image for every CS2 Workshop KZ map, addressable by a predictable URL. Today these images only exist scattered across Steam Workshop pages, at thumbnail-sized parameterized URLs, and nobody knows which maps are missing an image. The maintainer wants one GitHub repo holding one image per KZ map, with a daily automated report telling him exactly which maps he still needs to supply an image for, delivered to his phone via Telegram.

## Solution

A public GitHub repo (`jonahbearde/cs2kz-workshop-images`) that stores exactly one JPEG per KZ map in a flat `images/` directory, named after the map. A one-shot local script populates it from the Steam Web API. A daily GitHub Actions job re-enumerates the Workshop, diffs it against the repo, and posts a report to Telegram listing what is Missing and what is No-preview. The maintainer uploads Missing images by hand; the Scan never writes images.

## User Stories

1. As a consumer application, I want to fetch a map's preview image at `https://github.com/jonahbearde/cs2kz-workshop-images/raw/main/images/<name>.jpg`, so that I can render map thumbnails without scraping Steam.
2. As a consumer application, I want the URL to be a pure function of the map name (always `.jpg`), so that I never need to probe for the correct file extension.
3. As a consumer application, I want images at original resolution, so that my thumbnails stay crisp at any display size.
4. As a consumer application, I want an `index.json` mapping each map name to its Workshop metadata, so that I can link back to the Workshop page.
5. As the maintainer, I want to run one local command that downloads every existing Preview image in one pass, so that I can seed the repo without clicking through hundreds of Workshop pages.
6. As the maintainer, I want the initial download to skip images already present, so that I can interrupt and re-run it safely.
7. As the maintainer, I want the initial download to reject any title that is not a Legal map name, so that the repo never contains files I can't account for.
8. As the maintainer, I want titles carrying a CS2 tag but from CS:GO-era items filtered out via tag rules, so that legacy content never enters the repo.
9. As the maintainer, I want duplicate map names resolved to the Winner automatically, so that I never have to choose between re-uploads by hand.
10. As the maintainer, I want every stored image converted to JPEG regardless of source format, so that the consumer URL contract holds for every map.
11. As the maintainer, I want a daily Telegram report of Maps that are Missing, so that I can see from my phone what still needs an image.
12. As the maintainer, I want each Missing entry in the report to include the Workshop page link, so that I can open the map directly and grab its image.
13. As the maintainer, I want the report to include summary counts (have / Missing / No-preview), so that I can gauge progress at a glance.
14. As the maintainer, I want the report every day even when nothing changed, so that silence never means "the job died".
15. As the maintainer, I want a failure notification on Telegram when the Scan itself errors, so that I can distinguish a broken job from a quiet day.
16. As the maintainer, I want No-preview maps reported in their own section, so that I don't waste time looking for images that don't exist on the Workshop.
17. As the maintainer, I want the `index.json` regenerated and committed automatically by the Scan, so that my hand uploads never leave the index stale.
18. As the maintainer, I want images for delisted maps to stay in the repo and their index records preserved, so that consumer URLs never break under me.
19. As the maintainer, I want a local check command that validates my hand-added files (legal name, JPEG) and rebuilds the index, so that I catch format mistakes before pushing.
20. As the maintainer, I want the Telegram report delivered to a private chat with my own bot, so that no group or channel setup is needed.
21. As the maintainer, I want very long reports split into multiple Telegram messages automatically, so that nothing is lost to the 4096-character message limit.
22. As the maintainer, I want the whole pipeline driven by a Steam Web API key I own, so that enumeration is stable and doesn't depend on scraping.
23. As a future reader of this repo, I want ADRs recording the JPEG contract and the Actions-generated index, so that the non-obvious choices stay explained.

## Implementation Decisions

### Data model & domain rules

- Domain vocabulary is fixed by `CONTEXT.md`: **KZ map**, **Legal map name**, **Winner**, **Preview image**, **Scan**, **Missing**, **No-preview**, **Index**. Implementation must use these terms.
- A KZ map requires the `CS2` tag. No KZ tag is required. KZ map = `CS2` tag ∧ title matches `^kz_[a-z0-9_]+$`. Matching is strict: no lowercasing, no separator normalization; non-matching titles are dropped.
- Winner among same-named items: most recent `time_updated`.
- **Enumeration is a single search pass** (`search_text=kz`, `appid=730`, cursor-paginated to exhaustion; see ADR 0003). One pass empirically misses 5-17% of KZ candidates, which is acceptable because the repo is additive-only: the Scan only surfaces maps new to the repo and never removes images or index records, so a miss merely delays discovery. Accepted consequences: the one-shot seed is probabilistically complete, and daily report counts fluctuate between runs (deliberately not smoothed).
- Preview image = the first preview image of the Winner (the single `preview_url` returned by the Workshop API).
- Original-resolution URL = API `preview_url` with the entire query string stripped, **keeping the trailing slash** (dropping it yields 404).
- All images transcoded to JPEG, quality 90, no resize.

### Modules

- **WorkshopClient** — the only module that touches the network for Steam. Wraps `IPublishedFileService/QueryFiles` as a single search pass (`search_text=kz`, `appid=730`, cursor-paginated until exhausted) and returns `WorkshopItem[]` (`id`, `title`, `tags`, `timeUpdated`, `previewUrl`). Steam Web API key from `STEAM_API_KEY` env.
- **Pipeline core (pure functions)** — `filterKzMaps(items)`, `pickWinners(maps)` (name → Winner), `originalImageUrl(previewUrl)`, `diffRepo(winners, repoImages)` → `{ have, missing, noPreview }`, `renderReport(diff)` → `string[]` (Telegram messages, each ≤ 4096 chars; header with counts, then one line per Missing entry `name → workshop page URL`, then a No-preview section), `buildIndex(repoImages, winners, previousIndex)` → index keyed by map name; prefers fresh Workshop metadata, falls back to the previous record for delisted maps.
- **Repo IO seam** — thin interface over "which `.jpg` files exist under `images/`" and "read/write `index.json`", so pipeline tests can inject in-memory fakes.
- **Image processing** — sharp-based download-and-transcode; smoke-tested only.
- **Telegram sender** — thin wrapper over the Bot API `sendMessage`; given a `string[]`, sends each element in order. Secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

### CLI commands (pnpm scripts)

- `pnpm download` — one-shot local seeder: enumerate → filter → Winners → download Preview images (skip existing files) → transcode → write `images/<name>.jpg` → generate `index.json`.
- `pnpm check` — local validator for hand uploads: verify filenames are Legal map names, transcode non-JPEGs in place to JPEG, rebuild `index.json`. _(Amended by ADR 0005: `pnpm check` now accepts the wider Storable map name, and non-kz maps never enter `index.json`.)_
- `pnpm scan` — what the workflow runs: enumerate → diff against repo → rebuild and write `index.json` → print report → send Telegram messages.

### GitHub Actions workflow

- Schedule: `0 1 * * *` UTC (09:00 Beijing). Also allow `workflow_dispatch`.
- Runs `pnpm scan`. On any failure, sends a failure notification to the same Telegram chat (best-effort, in the failure path).
- After scanning, commits `index.json` back **only if it changed**, using the default `GITHUB_TOKEN` with `contents: write`. The workflow never commits images.
- Secrets: `STEAM_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

### Report format

- Header line: `✅ have N | ⬆️ missing N | 🚫 no-preview N`.
- Missing section: one line per map, `kz_name → https://steamcommunity.com/sharedfiles/filedetails/?id=<id>`.
- No-preview section: same shape, clearly labelled as unfixable-by-download.
- Messages split at 4096 chars on line boundaries.
- Sent every run, including "nothing missing" (report still lists No-preview and counts).

### Repo layout & contract

- Public repo `jonahbearde/cs2kz-workshop-images`; images flat under `images/` (JPEGs only, one per Legal map name); `index.json` at root; scripts under `scripts/` (or `src/`), workflow under `.github/workflows/`.
- Stack: Node + TypeScript + pnpm + sharp. Node version pinned via `packageManager` / engines.

### ADRs to be created

- `docs/adr/0001-…`: all-JPEG + filename-is-map-name public URL contract (trade: source-format fidelity for a predictable URL).
- `docs/adr/0002-…`: `index.json` is regenerated by the Scan from the repo's actual images and committed back; repo images are the source of truth, the Workshop is metadata only.

## Testing Decisions

- Good test = asserts on external behavior of the pure pipeline: given fixture Workshop data and a fixture repo state, expect the right diff / report / index. No assertions on internal helper structure; no network; no real filesystem outside temp dirs for the IO seam's real implementation.
- Two seams only: the Steam network boundary (WorkshopClient) and the repo filesystem boundary. Tests inject fixtures across seam 1 and fakes/temp dirs across seam 2.
- Test matrix:
  - Filtering: strict regex (reject `KZ_x`, `kz-x`, `kz_x (final)`), CS2 tag required, CS:GO-era rejected via tags.
  - Winner: same name → latest `time_updated`; deterministic tie-break.
  - `originalImageUrl`: strips all query params, **keeps trailing slash**.
  - Diff: correct partition into have / Missing / No-preview; empty `previewUrl` → No-preview.
  - Report rendering: counts header, entry format, ≤4096-char splitting on line boundaries.
  - Index building: repo-image-driven; delisted map keeps previous record; unchanged repo yields byte-identical output (no commit churn).
  - Image transcoding: single smoke test — PNG fixture in, valid JPEG out.
- Not tested: live Steam HTTP, Telegram delivery, pixel-level output of sharp.
- Tests run in CI alongside the build/typecheck; they must be fast and network-free.

## Out of Scope

- Updating an existing image when the Winner's preview changes upstream.
- Removing images when a map is delisted.
- Automatic downloading/uploading of Missing images (always manual).
- Requiring a KZ tag in the filter.
- Repo size management / Git LFS (corpus is ~300-400 maps at tens of KB each).
- Multiple preview images per map (only the first).
- Any consumer-facing versioning of the URL contract.

## Further Notes

- The maintainer has **no Telegram bot yet**. Implementation must include a step-by-step setup guide (BotFather → token → private chat → obtain chat id) as part of the docs, written for someone doing this for the first time.
- The Steam Web API key is supplied by the maintainer; it must be documented as a prerequisite for both the local seeder and the workflow.
- Corpus is small (~300-400 maps); pagination and rate limits are real but not a design pressure.
