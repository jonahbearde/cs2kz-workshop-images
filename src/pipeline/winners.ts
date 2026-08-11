import type { WorkshopItem } from "../workshop/types.js";

/**
 * Winner selection: for each legal map name, the item with the most recent
 * `time_updated` wins. Ties are broken deterministically in favour of the
 * higher publishedfileid (the later upload).
 */
export function pickWinners(maps: WorkshopItem[]): Map<string, WorkshopItem> {
  const winners = new Map<string, WorkshopItem>();
  for (const map of maps) {
    const current = winners.get(map.title);
    if (current === undefined || beats(map, current)) {
      winners.set(map.title, map);
    }
  }
  return winners;
}

function beats(candidate: WorkshopItem, incumbent: WorkshopItem): boolean {
  if (candidate.timeUpdated !== incumbent.timeUpdated) {
    return candidate.timeUpdated > incumbent.timeUpdated;
  }
  return BigInt(candidate.id) > BigInt(incumbent.id);
}
