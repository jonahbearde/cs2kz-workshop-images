import type { WorkshopItem } from "../workshop/types.js";

/** A Missing map together with the link the maintainer needs to act on it. */
export interface MissingMap {
  name: string;
  /** Workshop page of the Winner. */
  workshopUrl: string;
}

/**
 * The Scan's view of the world: every Winner partitioned against the images
 * already in the repo. Pure data — rendering lives in `render.ts`.
 */
export interface ScanDiff {
  /** Winners whose `.jpg` is already stored in the repo. */
  have: string[];
  /** Winners with a preview image but no repo image — hand-upload candidates. */
  missing: MissingMap[];
  /** Winners with no preview image at all; nothing can be downloaded for them. */
  noPreview: string[];
}

/** Workshop page a maintainer opens to see (and grab) an item's previews. */
export function workshopPageUrl(id: string): string {
  return `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`;
}

/**
 * Partitions every Winner against the repo's images. Repo maps with no
 * Winner (delisted or not enumerated this run) are ignored: the diff only
 * ever surfaces maps new to the repo. All buckets are sorted by map name so
 * rendering is deterministic.
 */
export function diffRepo(winners: Map<string, WorkshopItem>, repoMaps: string[]): ScanDiff {
  const stored = new Set(repoMaps);
  const diff: ScanDiff = { have: [], missing: [], noPreview: [] };

  for (const [name, winner] of [...winners.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (stored.has(name)) {
      diff.have.push(name);
      continue;
    }
    if (winner.previewUrl === "") {
      diff.noPreview.push(name);
    } else {
      diff.missing.push({ name, workshopUrl: workshopPageUrl(winner.id) });
    }
  }
  return diff;
}
