# CS2 KZ Workshop Images

A GitHub-hosted image store: one preview image per CS2 Workshop KZ climb map, referenced by other applications via raw URLs like `https://github.com/<owner>/cs2kz-workshop-images/raw/main/kz_ozark.jpg`.

## Language

### Domain

**KZ map**:
A CS2 Workshop item whose title starts with `kz_` and otherwise contains only lowercase letters, digits, and underscores. The CS2 tag is required; a KZ tag is not.
_Avoid_: climb map, kz 图

**Legal map name**:
A map title matching `^kz_[a-z0-9_]+$`. It is also the image filename stem (`<name>.jpg`). Titles that don't match are rejected outright, never normalized.
_Avoid_: normalized name

**Winner**:
When several Workshop items share one legal map name, the one with the most recent `time_updated`. It is the only item whose preview image is stored.
_Avoid_: canonical entry, 正主

**Preview image**:
The first preview image of a Workshop item, at original resolution (all `imw`/`imh`/`ima`/`impolicy` query parameters stripped from the UGC URL). Always stored as JPEG regardless of the source format.
_Avoid_: thumbnail, screenshot

### Scanning

**Scan**:
The daily scheduled job that enumerates all KZ maps in the Workshop, diffs them against the images in this repo, and reports the result to Telegram. It never downloads or writes images.
_Avoid_: sync, crawl

**Missing**:
A KZ map whose winner has a preview image in the Workshop but no corresponding `.jpg` in this repo. These are what the maintainer uploads by hand.
_Avoid_: to-download

**No-preview**:
A KZ map whose winner has no preview image at all in the Workshop. Reported separately from Missing; nothing can be downloaded for it.
_Avoid_: broken, empty

**Index**:
The `index.json` at the repo root mapping each legal map name to its Workshop metadata. Generated artifact, not hand-edited.
_Avoid_: manifest, registry
