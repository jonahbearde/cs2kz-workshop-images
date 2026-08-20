# CS2 KZ Workshop Images

A GitHub-hosted image store: one preview image per CS2 Workshop KZ climb map, referenced by other applications via raw URLs like `https://github.com/<owner>/cs2kz-workshop-images/raw/main/images/kz_ozark.jpg`.

## Language

### Domain

**KZ map**:
A CS2 Workshop item whose title starts with `kz_` and otherwise contains only lowercase letters, digits, and underscores. The CS2 tag is required; a KZ tag is not.
_Avoid_: climb map, kz 图

**Legal map name**:
A map title matching `^kz_[a-z0-9_]+$`. It is also the image filename stem (`<name>.jpg`). Titles that don't match are rejected outright, never normalized. This is the Workshop-side predicate: enumeration, download, Stale detection, and the Index only ever see Legal map names. Storage is governed by the wider Storable map name.
_Avoid_: normalized name

**Storable map name**:
A name matching `^[a-z][a-z0-9_]*$` — what `pnpm check` accepts into `images/`. Every Legal map name is Storable, plus hand-uploaded non-kz names (e.g. `de_dust2`). Storable-but-not-legal images are permanent: the Sync never discovers, overwrites, or indexes them.
_Avoid_: legal name, filename

**Winner**:
When several Workshop items share one legal map name, the one with the most recent `time_updated`. It is the only item whose preview image is stored.
_Avoid_: canonical entry, 正主

**Preview image**:
The first preview image of a Workshop item, at original resolution (all `imw`/`imh`/`ima`/`impolicy` query parameters stripped from the UGC URL). Always stored as JPEG regardless of the source format.
_Avoid_: thumbnail, screenshot

### Sync

**Sync**:
The daily scheduled job that brings this repo up to date with the Workshop: re-discovers KZ maps, diffs them against the images in this repo, downloads Missing previews, replaces Stale images, sends the single collage report to Telegram, commits the result, and rebuilds the Index. The report always arrives after the download phase, so it reports facts, not intentions.
_Avoid_: crawl, pipeline

**Scan**:
The first phase of the Sync: enumerates the Workshop, diffs it against the repo, rebuilds the Index, and sends a text-only report to Telegram. The Scan itself never downloads or writes images, so its report carries no `✓`/`✗` marks.
_Avoid_: sync, crawl

**Report**:
The one Telegram message a Sync run sends after its downloads — a sharp-composited collage photo with an HTML caption, or a plain text message when the run produced no images at all. The caption's chat-facing labels are presentation of the domain buckets, not new domain nouns: `In Stock: N` is the `have` count, `New` lists the `Missing` maps, `Updated` lists the `Stale` maps, and `No preview` lists the `No-preview` bucket. Per-line `✓`/`✗` marks say whether that map's image was downloaded and stored this run, and every map name is a link to its Workshop page. The caption carries no other icons.
_Avoid_: run result, scan report followed by run-result message

**Missing**:
A KZ map whose winner has a preview image in the Workshop but no corresponding `.jpg` in this repo. The Sync downloads it automatically.
_Avoid_: to-download, hand-upload candidate

**Stale**:
A KZ map whose `.jpg` exists in this repo but whose winner's preview URL differs from the `previewUrl` recorded in the Index. The Sync re-downloads the winner's preview and overwrites the stored image.
_Avoid_: outdated, changed

**Hand upload**:
An image supplied by the maintainer instead of the Sync. For KZ maps it is a stopgap for when the Steam API misbehaves: the next Scan enriches its Index record with the winner's metadata, and a later Sync overwrites it whenever it diverges from the winner's preview. For non-kz maps (Storable but not Legal) it is permanent: the image never enters the Index and the Sync never touches it.
_Avoid_: manual sync

**No-preview**:
A KZ map whose winner has no preview image at all in the Workshop. Reported separately from Missing; nothing can be downloaded for it.
_Avoid_: broken, empty

**Index**:
The `index.json` at the repo root mapping each legal map name to its Workshop metadata. Generated artifact, not hand-edited. Contains KZ maps only — hand-uploaded non-kz images never appear in it.
_Avoid_: manifest, registry
