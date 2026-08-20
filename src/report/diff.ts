import type { WorkshopIndex } from "../pipeline/indexer.js";
import { originalImageUrl } from "../pipeline/images.js";
import type { WorkshopItem } from "../workshop/types.js";

/** A map the Sync must (re-)download, together with the link behind the change. */
export interface MissingMap {
  name: string;
  /** Workshop page of the Winner. */
  workshopUrl: string;
}

/**
 * The Sync's view of the world: every Winner partitioned against the images
 * already in the repo and the Index records behind them. Pure data —
 * rendering lives in `render.ts`.
 */
export interface ScanDiff {
  /** Winners whose stored `.jpg` still matches the winner's preview. */
  have: string[];
  /** Winners with a preview image but no repo image — download candidates. */
  missing: MissingMap[];
  /** Stored maps whose winner's preview URL no longer matches the Index record (ADR 0004). */
  stale: MissingMap[];
  /** Winners with no preview image at all; nothing can be downloaded for them. */
  noPreview: MissingMap[];
}

/** Workshop page a maintainer opens to see (and grab) an item's previews. */
export function workshopPageUrl(id: string): string {
  return `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`;
}

/**
 * Partitions every Winner against the repo's images. Repo maps with no
 * Winner (delisted or not enumerated this run) are ignored: the diff only
 * ever surfaces maps the Sync can act on. All buckets are sorted by map
 * name so rendering is deterministic. Every bucket carries name + Workshop
 * URL so the report can render every map name as a link.
 *
 * Stale detection (ADR 0004): a stored map is Stale when the winner's
 * current preview URL differs from the `previewUrl` recorded in the Index.
 * The Index records original-resolution URLs, so the winner's URL is
 * normalized before comparing. Maps with no record — or an empty one —
 * cannot be judged stale and are left alone; a winner that lost its
 * preview never displaces the stored image.
 */
export function diffRepo(
  winners: Map<string, WorkshopItem>,
  repoMaps: string[],
  index: WorkshopIndex = {},
): ScanDiff {
  const stored = new Set(repoMaps);
  const diff: ScanDiff = { have: [], missing: [], stale: [], noPreview: [] };

  for (const [name, winner] of [...winners.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (stored.has(name)) {
      if (winner.previewUrl !== "" && isStale(name, winner, index)) {
        diff.stale.push({ name, workshopUrl: workshopPageUrl(winner.id) });
      } else {
        diff.have.push(name);
      }
      continue;
    }
    if (winner.previewUrl === "") {
      diff.noPreview.push({ name, workshopUrl: workshopPageUrl(winner.id) });
    } else {
      diff.missing.push({ name, workshopUrl: workshopPageUrl(winner.id) });
    }
  }
  return diff;
}

function isStale(name: string, winner: WorkshopItem, index: WorkshopIndex): boolean {
  const recorded = index[name]?.previewUrl;
  if (recorded === undefined || recorded === "") return false;
  return originalImageUrl(winner.previewUrl) !== recorded;
}
