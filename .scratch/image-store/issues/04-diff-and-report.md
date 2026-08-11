# 04 — Diff and report rendering (fully offline)

**What to build:** the reporting brain of the Scan, delivered as pure functions with zero network or filesystem coupling. Given the Winners from an enumeration and the list of images in the repo, the diff partitions every KZ map into have / Missing / No-preview (a Winner with no preview image at all is No-preview, reported separately because nothing can be downloaded for it). The renderer turns that partition into Telegram-ready messages: a counts header (`✅ have | ⬆️ missing | 🚫 no-preview`), one line per Missing entry pairing the map name with its Workshop page link, a labelled No-preview section, and automatic splitting on line boundaries so no message exceeds Telegram's 4096-character limit.

**Blocked by:** 01 — Project scaffold + Workshop enumeration tracer bullet (needs only the Winner/item types, not the download pipeline).

**Note:** enumeration is a single search sample (ADR 0003), so the report counts fluctuate between runs even when the repo is unchanged. This is expected and deliberately not smoothed — the diff and renderer stay pure functions of their inputs.

**Status:** resolved

- [x] Diff correctly partitions fixture data into have / Missing / No-preview, including the empty-preview-URL case
- [x] Report header shows all three counts; Missing entries carry Workshop page links
- [x] No-preview entries appear in their own clearly labelled section
- [x] Rendering splits into multiple messages on line boundaries when the content exceeds 4096 characters (fixture test with a synthetic large corpus)
- [x] Everything runs offline from fixtures; no test touches the network or real repo

## Comments

Implemented 2026-08-11. `src/report/diff.ts` partitions the Winners against the repo's images into have / Missing / No-preview (a Winner with an empty preview URL is No-preview; repo maps with no Winner are ignored — the diff only surfaces maps new to the repo). `src/report/render.ts` renders the partition into Telegram-ready messages: counts header (`✅ have | ⬆️ missing | 🚫 no-preview`), one `<name>: <workshop page>` line per Missing map, a labelled `🚫 No preview:` section, and greedy packing on line boundaries under the 4096-character limit (a single oversized line is an error, never truncated). Both modules are pure functions of their inputs; the header is always emitted even for an empty diff, so issue 05's "always send" guarantee holds. All 18 new tests run offline from fixtures, including a synthetic 300-map corpus that forces multi-message splitting.
