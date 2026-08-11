# 04 — Diff and report rendering (fully offline)

**What to build:** the reporting brain of the Scan, delivered as pure functions with zero network or filesystem coupling. Given the Winners from an enumeration and the list of images in the repo, the diff partitions every KZ map into have / Missing / No-preview (a Winner with no preview image at all is No-preview, reported separately because nothing can be downloaded for it). The renderer turns that partition into Telegram-ready messages: a counts header (`✅ have | ⬆️ missing | 🚫 no-preview`), one line per Missing entry pairing the map name with its Workshop page link, a labelled No-preview section, and automatic splitting on line boundaries so no message exceeds Telegram's 4096-character limit.

**Blocked by:** 01 — Project scaffold + Workshop enumeration tracer bullet (needs only the Winner/item types, not the download pipeline).

**Status:** ready-for-agent

- [ ] Diff correctly partitions fixture data into have / Missing / No-preview, including the empty-preview-URL case
- [ ] Report header shows all three counts; Missing entries carry Workshop page links
- [ ] No-preview entries appear in their own clearly labelled section
- [ ] Rendering splits into multiple messages on line boundaries when the content exceeds 4096 characters (fixture test with a synthetic large corpus)
- [ ] Everything runs offline from fixtures; no test touches the network or real repo
