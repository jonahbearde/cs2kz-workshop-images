Status: done

# Spec: Single-message Telegram report (collage + inline status)

## Problem Statement

The daily Sync currently sends two things to the maintainer's Telegram chat: a scan report message *before* the download phase (emoji counts header, Missing/Stale/No-preview sections with raw Workshop URLs), then a run-result message *after* it (Downloaded/Updated/Failed counts). On large runs this spreads across several messages (the first real sync delivered eight). The report uses emoji icons, shows no images, and never tells the maintainer whether a given map's download actually succeeded. The maintainer wants the whole report to be **one message per run** that reads as a factual changelog: stock count, new maps with their preview images, updated maps with before/after images, per-map download status, no icons, and map names as Workshop-page links rather than bare URLs.

## Solution

One post-download message per Sync run, sent as a single Telegram `sendPhoto` whose photo is a sharp-composited **collage** of the run's images and whose HTML caption carries the report text (map names as Workshop-page links). When a run produces no images at all, the message degrades to a single plain text message with the same content; an empty run still sends the stock count alone, preserving the repo's "silence never means the job died" principle. Each New/Updated line carries a `✓` or `✗` showing whether that map's image was downloaded and stored; failed maps show no image in the collage. No-preview maps get their own linked-name section. The same no-icon, linked-name style applies to the `pnpm scan` report and to failure notifications, which drop their `❌`.

## User Stories

1. As the maintainer, I want each Sync run to deliver exactly one Telegram message, so that my chat stays uncluttered no matter how many maps changed.
2. As the maintainer, I want that one message to arrive after the download phase, so that it reports facts ("these were added") rather than intentions.
3. As the maintainer, I want an `In Stock: N` header equal to the `have` count of the scan, so that I can see the pre-run stock at a glance without it being confused with post-run totals.
4. As the maintainer, I want a `New (M):` section listing every newly discovered map, so that I can see what the Workshop gained along with the count.
5. As the maintainer, I want each new map's name to be a link to its Workshop page, so that I can open the map directly without seeing the raw URL in the message.
6. As the maintainer, I want each new map to show its Preview image, so that I can recognize the map before opening it.
7. As the maintainer, I want an `Updated (P):` section listing every Stale map whose stored image was replaced, so that I can see which maps changed upstream.
8. As the maintainer, I want each updated map to show its old image and its new image side by side, so that I can compare what changed without opening Workshop.
9. As the maintainer, I want a `→` arrow drawn between the old and new halves of each updated pair, so that the direction of change is unambiguous even with no other annotation.
10. As the maintainer, I want the old half of an updated pair to be the image that was actually stored before this run and the new half to be the Winner's fresh Preview, so that the comparison shows exactly what the Sync did.
11. As the maintainer, I want a `✓` after each New/Updated map whose image was successfully downloaded and stored this run, so that I can confirm the run did its job.
12. As the maintainer, I want a `✗` after each New/Updated map whose download failed, so that I know exactly which maps need attention.
13. As the maintainer, I want a failed map to show no image in the collage, so that the report never presents a broken or missing visual as if it were real.
14. As the maintainer, I want the `New (M):` and `Updated (P):` counts to reflect the attempted maps (including `✗` ones), so that the numbers always reconcile with the marked lines.
15. As the maintainer, I want a `No preview (Q):` section listing maps whose Winner has no Preview at all, one linked name per line, so that I keep seeing this signal without it looking like a fixable-by-download case.
16. As the maintainer, I want no icons in the message text (the `✓`/`✗` marks are the only exception), so that the report reads like a clean changelog rather than a feed of emoji.
17. As the maintainer, I want every map name in the message to be a Workshop-page link and nowhere to see the Workshop URL spelled out, so that the message is compact and clickable on my phone.
18. As the maintainer, I want an empty run (nothing new, nothing updated) to still send `In Stock: N` alone, so that silence never means the job died.
19. As the maintainer, I want very large runs (tens or hundreds of new maps) to show a capped collage and name list with a trailing `…and K more` line, so that the message stays useful instead of a wall of images.
20. As the maintainer, I want the counts in the header to stay exact even when the collage and name list are capped, so that truncation never misrepresents the run.
21. As the maintainer, I want the caption to never exceed Telegram's 1024-character photo-caption limit, so that the message is always delivered intact.
22. As the maintainer, I want the message to be a single photo even when both New and Updated maps exist, so that one report genuinely means one message.
23. As the maintainer, I want the report to degrade to one plain text message when there are no images to show, so that stock-only and no-preview-only days still report cleanly.
24. As the maintainer, I want a Telegram send failure to leave the store work done and mark the run red, exactly as today, so that a flaky notification never loses images.
25. As the maintainer, I want a fatal job failure to still notify me in the same chat, so that silence never means the job died.
26. As the maintainer, I want the failure notification to say `Sync failed: <reason>` / `Scan failed: <reason>` without the `❌` icon, so that no icons appear anywhere in my chat.
27. As the maintainer, I want my manual `pnpm scan` dry-run to send the same no-icon, linked-name report (text only — it never downloads), so that manual previews match the style of the automated report.
28. As a future reader of this repo, I want the domain language updated (the Sync no longer sends a "report followed by a run-result"), an ADR explaining the collage report, and the README flow corrected, so that the docs describe what the code actually does.

## Implementation Decisions

### Message shape

- The synced report and the run-result are **one message**. The run-result vocabulary (`renderResult`, `SyncOutcome`, "run-result message") retires; what used to be the run-result's information is expressed by the per-line `✓`/`✗` marks against the New/Updated sections.
- A `ReportMessage` union is the single deliverable: `{ kind: "text"; text: string }` or `{ kind: "photo"; photo: Buffer; caption: string }`. The Sync's send dependency accepts this union (used for the report and for the failure notification); the Scan's send dependency uses the text variant only.
- The mark meaning is fixed: `✓` = "this map's image was downloaded and stored successfully in this run", `✗` = "the download failed after all attempts". Marks appear **only** on New and Updated lines. In Stock and No-preview lines never carry marks.
- Counts in `In Stock:`/`New (M):`/`Updated (P):`/`No preview (Q):` always represent the full scan buckets; the 8-tile collage cap and the name truncation never change the numbers.

### Caption format (API contract)

- Section order and spacing: `In Stock: N`, then blank line, then each non-empty section (`New (M):`, `Updated (P):`, `No preview (Q):`), each header followed by one line per map, blank line between sections. Sections appear only when non-empty; the `In Stock` line always appears.
- Map lines: the map name rendered as an HTML link to its Workshop page (the Winner's `filedetails` URL), with ` ✓` or ` ✗` appended for New/Updated maps and nothing for No-preview maps.
- HTML parse mode with escaping of `&`, `<`, `>` in hrefs and names. No icons or emoji anywhere in the caption — `✓`/`✗` are the sole exception.
- Truncation: when the name list would exceed the collage tile cap (8), stop after the maps whose images are in the collage and append a blank line plus `…and K more` (K = the exact remaining count). Caption length is thereby bounded well under Telegram's 1024-character caption limit.
- Empty run: caption is exactly `In Stock: N` and the message is a plain text message (no collage exists to attach).

### Collage

- A sharp-based compositor inside the report module takes the run's image tiles and the cap (8) and returns one JPEG buffer. Zero tiles → no collage (text message).
- New maps contribute a single 16:9 thumbnail tile; Updated maps contribute one pair tile (stored old image left, fresh Winner preview right) with a `→` (U+2192) between the halves and tiny plain-text `old`/`new` labels beneath each half; pairs separated by a small vertical gap; tiles arranged with thin gaps so pairs stay visually distinct.
- The arrow is drawn into the image as an SVG overlay (rendered by sharp) rather than a font glyph, so rendering does not depend on a font covering U+2192. No arrow glyphs or icons appear in caption text.
- Failed (`✗`) maps contribute no tile. In Stock and No-preview maps contribute no tiles.
- Tiles beyond the cap are dropped; the caption's `…and K more` keeps the report honest.

### Sync orchestration

- To show a Stale map's old half, the Sync snapshots the stored image **before** the new download overwrites it: the Sync's dependencies gain a read-image service for that purpose, wired to the stored `.jpg`.
- The download phase still fetches and writes per map, in the existing order; the per-map `✓`/`✗` is the fetch+write result. Composition and sending happen after the download phase completes, exactly once.
- Telegram send failures still never abort the store work and still set the run red; the failure notification (`Sync failed: <reason>`, no icon) is unchanged in spirit.
- Success/`✗` outcomes, stock counts, and the collage are all produced from data already in memory or in the repo — no extra network beyond the existing download phase.

### Telegram client

- The client gains a photo-send capability: multipart/form-data POST to the Bot API photo endpoint carrying `chat_id`, the photo bytes, `caption`, and `parse_mode: HTML`. Error surfacing mirrors the existing text path (throw with the API `description`).
- The text send path stays for the degraded/failure cases; both accept the same client options.

### Diff and report inputs

- The diff's No-preview bucket changes from bare names to name + Workshop URL, so No-preview lines can carry the same link every other map line has.
- The report renderer takes the diff plus the per-map download outcomes; the Sync renderer additionally takes the collage tiles. The Scan renderer is a text-only variant (linked names, same sections, no marks, no images — the Scan never downloads).
- The shared "silence never means the job died" invariants are preserved everywhere: always-sent reports, best-effort failure notifications with a non-zero exit.

### Docs

- `CONTEXT.md`: the Sync and Scan entries are rewritten (the Sync sends *one* report after downloads; the Scan sends a text-only report), "run result" retires as a concept, and the chat-facing aliases — `In Stock` ≡ `have`, `New` ≡ `Missing`, `Updated` ≡ `Stale`, `No preview` ≡ `No-preview` — are recorded as presentation mapping, not new domain nouns.
- A new ADR (0006) records the single-photo collage report: why multiple images in one message require a composited photo (Telegram renders at most one link preview per text message), the merger of report and run-result, and the 8-tile cap as both a usability and a caption-length guard.
- README flow sections describing the two-message report are corrected to the one-message report.
- No change to the GitHub Actions workflow file: it still runs `pnpm sync`.

## Testing Decisions

- A good test asserts external behavior: given fixture Workshop data, fixture repo state, and stubbed download/write outcomes, expect the right message count, content, marks, and ordering. No assertions on internal helper structure, no network (Telegram and Steam boundaries stay stubbed), no real filesystem except the repo IO seams' existing temp-dir patterns.
- **Sync orchestration seam** (highest): exactly one send per run; the send happens after every download call; `✗` marks appear for failed downloads and `✓` for successful ones; a Telegram failure still flags the run red without aborting the store work; the failure notification carries no icon; an empty run sends `In Stock: N` exactly once. Prior art: the existing orchestration tests with injected dependencies.
- **Report module seam**: caption content as pure-function assertions — section presence/order, link markup and escaping, `✓`/`✗` placement, In Stock equal to the have count, no icons anywhere except the marks, truncation tail with exact K, correctness of the text-only degradation. The collage compositor is tested here with tiny sharp-generated JPEG fixtures: tile count obeys the cap, failed maps are absent, updated pairs combine old and new buffers, an updated pair yields a wider image than a new tile, output is a valid JPEG. Prior art: existing report rendering tests; the sharp smoke-test style already used for transcoding.
- **Telegram client seam**: the photo-send wire format — correct endpoint, multipart body carrying photo bytes and caption, `parse_mode: HTML` present, API rejection surfaced as an error with the description. Prior art: the existing stubbed-fetch client tests.
- Not tested: live Telegram delivery, live Steam, pixel-level appearance of the collage, and the exact look of the `→` overlay (its presence is asserted, its aesthetics are not).
- CI stays fast and network-free; typecheck + tests still gate the workflow.

## Out of Scope

- Media groups / photo albums — multiple underlying messages, rejected (the requirement is exactly one message).
- Images for `In Stock` maps or a stock section — the header is a number only, no wall of images.
- Any icons or emoji in message text beyond the sanctioned `✓`/`✗`, including in the collage's arrow treatment (the arrow is an image glyph, not text).
- Failure reasons in the message — `✗` signals the failure; the reason stays in the run's logs/Actions output.
- Retrying failed downloads or failed sends beyond today's behavior.
- Any change to what the Sync stores, the flat-`images/` URL contract (ADR 0001), overwrite semantics (ADR 0004), or Storable/Index rules (ADR 0002, ADR 0005).
- Telegram threads, reply-to, editing, polls, or fan-out to multiple chats.
- Changes to the `sync.yml` workflow file itself.
- Pixel-perfect collage aesthetics or interactive/clickable image maps in the collage.

## Further Notes

- The 8-tile cap is also the caption guard: eight linked name lines are roughly 900 characters, safely under Telegram's 1024-character caption limit, so caption overflow is structurally impossible; real runs exceeding 8 changes exist in the commit history (e.g. 60 additions in one run), which is why truncation matters despite being rare.
- The old halves of updated pairs come from the stored images, so no extra network traffic: everything the collage needs is either already in memory (fresh downloads) or already on disk (pre-overwrite snapshots).
- The report describes what the run did, so the message necessarily arrives after downloads; a run that dies before sending still produces its failure notification, preserving the "silence never means the job died" invariant.
- Chat-facing aliases (`In Stock`/`New`/`Updated`/`No preview`) are presentation of the existing domain buckets — they do not change the domain model (`have`/`Missing`/`Stale`/`No-preview`) and are recorded as a mapping, not as new terms.