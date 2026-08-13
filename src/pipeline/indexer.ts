import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import type { WorkshopItem } from "../workshop/types.js";
import { isLegalMapName, isStorableMapName } from "./filter.js";
import { originalImageUrl } from "./images.js";

/**
 * Workshop metadata for one stored image. The map name itself is the index
 * key, so it is not repeated inside the record.
 */
export interface IndexRecord {
  /** Workshop publishedfileid, or "" when unknown (hand upload, item delisted). */
  id: string;
  /** Original-resolution preview URL, or "" when unknown. */
  previewUrl: string;
  /** Unix seconds of the item's last update, or 0 when unknown. */
  timeUpdated: number;
}

/** The `index.json` content: legal map name -> Workshop metadata. */
export type WorkshopIndex = Record<string, IndexRecord>;

/**
 * The map names this repo actually stores — read from the `.jpg` files under
 * `images/`, the source of truth for the index (ADR 0002). Stems that are
 * not even Storable map names are dropped. Storable-but-not-legal names
 * (hand-uploaded non-kz images) stay in the list so the Sync's diff can see
 * and ignore them, but they never enter the index itself (ADR 0005).
 */
export async function listRepoMaps(imagesDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(imagesDir);
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.endsWith(".jpg"))
    .map((entry) => entry.slice(0, -".jpg".length))
    .filter(isStorableMapName)
    .sort();
}

/** Parses an existing `index.json`; absent or blank file means empty index. */
export function parseIndex(json: string | undefined): WorkshopIndex {
  if (json === undefined || json.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("index.json is not valid JSON; refusing to rebuild over it");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("index.json must be an object keyed by map name");
  }
  const index: WorkshopIndex = {};
  for (const [name, raw] of Object.entries(parsed as Record<string, unknown>)) {
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof (raw as IndexRecord).id !== "string" ||
      typeof (raw as IndexRecord).previewUrl !== "string" ||
      typeof (raw as IndexRecord).timeUpdated !== "number"
    ) {
      throw new Error(`index.json record for "${name}" has the wrong shape`);
    }
    index[name] = normalize(raw as IndexRecord);
  }
  return index;
}

/**
 * Rebuilds the index from what the repo holds, not what the Workshop
 * currently has (ADR 0002). For each stored map the metadata resolves as:
 * current Winner > previous index record > empty record (hand upload whose
 * Workshop item was never seen here). Storable-but-not-legal map names
 * (hand-uploaded non-kz images) are skipped: the index only ever contains
 * KZ maps (ADR 0005).
 */
export function buildIndex(options: {
  repoMaps: string[];
  winners: Map<string, WorkshopItem>;
  previous: WorkshopIndex;
}): WorkshopIndex {
  const index: WorkshopIndex = {};
  for (const name of [...options.repoMaps].sort()) {
    if (!isLegalMapName(name)) continue;
    const winner = options.winners.get(name);
    if (winner !== undefined) {
      index[name] = {
        id: winner.id,
        previewUrl: originalImageUrl(winner.previewUrl),
        timeUpdated: winner.timeUpdated,
      };
      continue;
    }
    const kept = options.previous[name];
    index[name] = kept ?? { id: "", previewUrl: "", timeUpdated: 0 };
  }
  return index;
}

/**
 * Serializes the index deterministically: keys sorted lexicographically,
 * fixed record key order, two-space indent, trailing newline. An unchanged
 * repo therefore always renders to byte-identical output.
 */
export function renderIndex(index: WorkshopIndex): string {
  const ordered: WorkshopIndex = {};
  for (const name of Object.keys(index).sort()) {
    ordered[name] = normalize(index[name]!);
  }
  return JSON.stringify(ordered, null, 2) + "\n";
}

/** Reads and parses `index.json`; an absent file means an empty index. */
export async function readIndexFile(indexPath: string): Promise<WorkshopIndex> {
  let json: string | undefined;
  try {
    json = await readFile(indexPath, "utf8");
  } catch {
    return {};
  }
  return parseIndex(json);
}

/**
 * Writes `index.json` atomically, skipping the write when the content is
 * unchanged so repeated runs leave the file (and git) untouched.
 */
export async function writeIndexFile(indexPath: string, rendered: string): Promise<"updated" | "unchanged"> {
  let current: string | undefined;
  try {
    current = await readFile(indexPath, "utf8");
  } catch {
    current = undefined;
  }
  if (current === rendered) return "unchanged";
  const tmp = `${indexPath}.tmp`;
  await writeFile(tmp, rendered);
  await rename(tmp, indexPath);
  return "updated";
}

/**
 * One index rebuild: read images/ (source of truth), merge Workshop metadata
 * with the previous records, and write index.json if it changed.
 */
export async function rebuildIndexFile(options: {
  imagesDir: string;
  indexPath: string;
  winners: Map<string, WorkshopItem>;
}): Promise<{ outcome: "updated" | "unchanged"; mapCount: number }> {
  const repoMaps = await listRepoMaps(options.imagesDir);
  const previous = await readIndexFile(options.indexPath);
  const index = buildIndex({ repoMaps, winners: options.winners, previous });
  const rendered = renderIndex(index);
  const outcome = await writeIndexFile(options.indexPath, rendered);
  return { outcome, mapCount: Object.keys(index).length };
}

/** Fixed key order and no stray fields, even for hand-edited records. */
function normalize(record: IndexRecord): IndexRecord {
  return {
    id: record.id,
    previewUrl: record.previewUrl,
    timeUpdated: record.timeUpdated,
  };
}
