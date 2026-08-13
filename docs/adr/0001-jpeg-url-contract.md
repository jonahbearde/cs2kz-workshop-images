# All-JPEG, filename-is-map-name public URL contract

> **Amended by [ADR 0005](0005-storable-map-names.md).** The URL shape and all-JPEG rule are unchanged, but the accepted filename set split into two predicates: Legal map name (`kz_`-only) governs everything the automation does, and a wider Storable map name governs what `pnpm check` accepts as a hand upload. Hand-uploaded non-kz images never enter `index.json`.

Consumers fetch images at `https://github.com/jonahbearde/cs2kz-workshop-images/raw/main/images/<map_name>.jpg`. We transcode every Workshop Preview image to JPEG (quality 90, original resolution) and name the file exactly after the Legal map name, so the URL is a pure function of the map name — no extension probing, no lookup required. Images live in a flat `images/` directory (nothing else in it), keeping the repo root clean; this layout was settled before the contract ever shipped, so no consumer references exist against an earlier root-level path. We trade away source-format fidelity (some previews are PNG/WebP) because a predictable, guessable URL is worth more to consumers than lossless storage of a preview image. Reversing this later means rewriting every consumer reference, so it is locked in deliberately.

## Considered Options

- Keep original extensions and ship an index consumers must consult first — rejected: turns a static URL into a two-step resolution.
- Git LFS — rejected: changes raw-URL behaviour and fights the "plain raw link" contract.
