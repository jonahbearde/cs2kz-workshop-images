# One message per Sync run: a single-photo collage report

The Sync used to send two things to the maintainer's Telegram chat: a scan report before the download phase (emoji counts, `Missing`/`Stale`/`No-preview` sections with raw Workshop URLs) and a run-result message after it (`Downloaded`/`Updated`/`Failed` counts). On the first real run that spread across eight messages, showed no images, and never said whether any individual map's download had succeeded. The report is now **one message per run, sent after the download phase**: a `sendPhoto` whose photo is a sharp-composited collage of the run's images and whose HTML caption is the report text, with every map name a Workshop-page link and each `New`/`Updated` line carrying a `✓` (downloaded and stored this run) or `✗` (download failed after all attempts). Runs with no images at all degrade to one plain text message with the same content, and an empty run still sends `In Stock: N` alone — silence never means the job died.

## Why a composited photo instead of multiple messages

The alternative everyone reaches for first is a media group / photo album: separate photo messages with a caption each. That was rejected because Telegram delivers a media group as several underlying messages, and the requirement is exactly one message per run — uncluttered chat no matter how many maps changed. Photographs also cannot be captioned individually per New/Updated line, and Telegram renders at most one link preview per text message, so a text-only report is compact but link-blind; a single `sendPhoto` gives us one deliverable that can show images and carry rich HTML text at the same time. The collage therefore is the report's image half: `New` maps contribute one 16:9 thumbnail of their fresh preview; `Updated` maps contribute one pair tile whose left half is the image stored before this run and whose right half is the Winner's fresh preview, with a drawn arrow between them, so the direction of change is unambiguous. Nothing extra is fetched: the old halves are snapshots of the stored `.jpg` taken before the run overwrites them, and the new halves are already in memory from the download phase.

## The merger of report and run-result

The report and the run-result are the same message now. The run-result vocabulary (`renderResult`, `SyncOutcome`, "run-result message") is retired; what it used to say is expressed by the per-line `✓`/`✗` marks against the `New`/`Updated` sections. The counts stay honest: `In Stock`, `New (M)`, `Updated (P)`, and `No preview (Q)` always report the full scan buckets — truncation never changes the numbers. The mark means one thing: `✓` = this map's image was downloaded and stored successfully in this run, `✗` = the download failed after all attempts; `In Stock` and `No preview` lines never carry marks.

## Why the 8-tile cap exists

The collage is capped at eight tiles, and the caption names exactly the collaged maps. That bound is simultaneously a usability guard (a wall of hundreds of images is useless on a phone) and a caption-length guard: eight linked name lines are roughly 900 characters, structurally under Telegram's 1024-character `sendPhoto` caption limit, and the caption renders with `parse_mode: HTML` where map names are links. Real runs exceeding eight changes exist in the commit history (60 additions in one run), hence the trailing `…and K more` line with the exact remaining count; the counts in the headers never lie, so truncation can never masquerade as "nothing else happened". The `No preview` lines ride along uncapped — in the extreme (many maps simultaneously lacking previews) the caption could still exceed 1024 characters; that surfaces as a plain Telegram send failure (run marked red, store work intact), never as a reason to abort the run. Runs with no images skip the collage entirely and send the same report as one plain text message, which has Telegram's looser 4096-character text limit.

## The arrow and the no-icon rule

The caption and the failure notifications carry no icons or emoji anywhere; the `✓`/`✗` marks are the sole exception. The `→` between the halves of an Updated pair is drawn into the image as an SVG overlay — vector paths rendered by sharp, not a font glyph — so rendering never depends on a font covering U+2192, and no arrow glyph appears in the text. The old/new halves are labelled with tiny plain-text `old`/`new` captions beneath each half.

## What did not change

The Sync still fetches and writes per map in the same order with the same retry budget; a Telegram send failure still never aborts the store work and still marks the run red via the exit status; a fatal job failure still sends `Sync failed: <reason>` / `Scan failed: <reason>` (now without the `❌`) to the same chat before exiting non-zero; the `pnpm scan` dry-run sends the same no-icon, linked-name report as text only, since it never downloads. The GitHub Actions workflow file is unchanged — it still runs `pnpm sync`.

## Considered Options

- **Media group / photo album** — rejected: multiple underlying messages, violating the one-message requirement; no per-map caption text.
- **Text-only report with Workshop URLs** — rejected: the URLs dominate the message and no images are shown; a single link preview per text message makes the report link-blind.
- **A text message plus one large attached image** — rejected: `sendPhoto` already does both in one deliverable, with a caption designed for exactly this.
- **Letting the caption repeat the raw URL per map** — rejected: map names as links are shorter, clickable on a phone, and keep the message compact.
- **Showing `✗` maps in the collage with a placeholder** — rejected: the report must never present a broken or missing visual as if it were real; a `✗` map is named, its absence from the collage is the signal.

## Consequences

- The maintainer's chat receives exactly one message per Sync run, after the downloads, describing what the run did.
- The store work and the notification channel stay decoupled exactly as before: flaky Telegram never loses images, and the run still reports its own failures.
- Consumers see no change at all — the URL contract, the stored JPEGs, the Index, and the workflow are untouched.