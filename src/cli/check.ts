import { mkdir } from "node:fs/promises";
import { checkImagesDir } from "../pipeline/check.js";
import { rebuildIndexFile } from "../pipeline/indexer.js";

const IMAGES_DIR = "images";
const INDEX_FILE = "index.json";

/**
 * Supports hand uploads, fully offline (no Steam API):
 *  1. rejects files whose stem is not a Legal map name,
 *  2. transcodes non-JPEG files to JPEG in place,
 *  3. rebuilds index.json from what images/ holds (ADR 0002) — maps with no
 *     known Workshop record keep their previous index entry, or get an empty
 *     one until the next Scan enriches it.
 */
async function main(): Promise<void> {
  await mkdir(IMAGES_DIR, { recursive: true });

  const outcome = await checkImagesDir(IMAGES_DIR);
  for (const name of outcome.transcoded) {
    console.error(`transcode ${name}`);
  }
  for (const problem of outcome.problems) {
    console.error(`REJECT    ${problem}`);
  }

  const index = await rebuildIndexFile({
    imagesDir: IMAGES_DIR,
    indexPath: INDEX_FILE,
    winners: new Map(),
  });
  console.error(
    index.outcome === "updated"
      ? `index.json updated (${index.mapCount} maps).`
      : `index.json unchanged (${index.mapCount} maps).`,
  );

  if (outcome.problems.length > 0) {
    console.error(`\n${outcome.problems.length} problem(s) found; fix them by hand and re-run.`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
