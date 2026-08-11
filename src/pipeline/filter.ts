import type { WorkshopItem } from "../workshop/types.js";

/**
 * Legal map name: the title itself, matched strictly.
 * No lowercasing, no separator normalization — non-matching titles are
 * rejected outright, never normalized.
 */
const LEGAL_MAP_NAME = /^kz_[a-z0-9_]+$/;

/** A KZ map requires the CS2 tag. A KZ tag is not required. */
const CS2_TAG = "CS2";

export function isLegalMapName(title: string): boolean {
  return LEGAL_MAP_NAME.test(title);
}

export function isKzMap(item: WorkshopItem): boolean {
  return item.tags.includes(CS2_TAG) && isLegalMapName(item.title);
}

/** Keeps only items that are KZ maps; drops everything else. */
export function filterKzMaps(items: WorkshopItem[]): WorkshopItem[] {
  return items.filter(isKzMap);
}
