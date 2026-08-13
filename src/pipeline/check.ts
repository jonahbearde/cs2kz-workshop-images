import { existsSync } from "node:fs";
import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isStorableMapName } from "./filter.js";
import { toJpeg } from "./transcode.js";

export interface CheckOutcome {
  /** Basenames that were transcoded to `<stem>.jpg`. */
  transcoded: string[];
  /** Human-readable problems; any entry means the run should fail. */
  problems: string[];
}

/**
 * Prepares `images/` for hand uploads: rejects files whose stem is not a
 * Storable map name (never normalized) and transcodes non-JPEG files to JPEG
 * in place, replacing the original. Already-correct `.jpg` files are
 * untouched. Storable names are wider than Legal map names (ADR 0005): a
 * hand upload may carry a non-kz prefix.
 */
export async function checkImagesDir(imagesDir: string): Promise<CheckOutcome> {
  const outcome: CheckOutcome = { transcoded: [], problems: [] };
  const entries = await readdir(imagesDir, { withFileTypes: true });

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    const stem = stemOf(name);

    if (!isStorableMapName(stem)) {
      outcome.problems.push(`not a storable map name: "${name}" (must match ^[a-z][a-z0-9_]*$)`);
      continue;
    }
    if (name === `${stem}.jpg`) continue; // already the stored form

    const target = path.join(imagesDir, `${stem}.jpg`);
    if (existsSync(target)) {
      outcome.problems.push(`conflict: both "${name}" and "${stem}.jpg" exist; resolve by hand`);
      continue;
    }

    try {
      const source = path.join(imagesDir, name);
      const jpeg = await toJpeg(await readFile(source));
      // Write aside, then rename: an interrupted run never leaves a half-written image.
      const tmp = `${target}.tmp`;
      await writeFile(tmp, jpeg);
      await rename(tmp, target);
      await rm(source);
      outcome.transcoded.push(name);
    } catch (error) {
      outcome.problems.push(
        `cannot transcode "${name}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return outcome;
}

/** Filename without its final extension; extension-less names are their own stem. */
function stemOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name : name.slice(0, dot);
}
