import type { WorkshopItem } from "../workshop/types.js";

/**
 * Legal map name: the title itself, matched strictly.
 * No lowercasing, no separator normalization — non-matching titles are
 * rejected outright, never normalized. This is the Workshop-side
 * predicate: it decides what the enumeration can discover, download,
 * overwrite, and index (ADR 0005).
 */
const LEGAL_MAP_NAME = /^kz_[a-z0-9_]+$/;

/**
 * Storable map name: what `pnpm check` accepts into `images/` (ADR 0005).
 * Wider than the Legal map name — hand uploads may carry other prefixes
 * (e.g. official `de_` maps). Storable-but-not-legal images are permanent:
 * the Sync never discovers, overwrites, or indexes them.
 */
const STORABLE_MAP_NAME = /^[a-z][a-z0-9_]*$/;

/** A KZ map requires the CS2 tag. A KZ tag is not required. */
const CS2_TAG = "cs2";

function hasCs2Tag(item: WorkshopItem): boolean {
  // Steam tags are case-insensitive; the Workshop stores the tag as "Cs2".
  return item.tags.some((tag) => tag.toLowerCase() === CS2_TAG);
}

export function isLegalMapName(title: string): boolean {
  return LEGAL_MAP_NAME.test(title);
}

export function isStorableMapName(title: string): boolean {
  return STORABLE_MAP_NAME.test(title);
}

export function isKzMap(item: WorkshopItem): boolean {
  return hasCs2Tag(item) && isLegalMapName(item.title);
}

/** Keeps only items that are KZ maps; drops everything else. */
export function filterKzMaps(items: WorkshopItem[]): WorkshopItem[] {
  return items.filter(isKzMap);
}
