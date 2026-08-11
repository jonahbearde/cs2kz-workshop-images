import type { WorkshopItem } from "../workshop/types.js";
import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { filterKzMaps } from "../pipeline/filter.js";
import { originalImageUrl } from "../pipeline/images.js";
import { rebuildIndexFile } from "../pipeline/indexer.js";
import { toJpeg } from "../pipeline/transcode.js";
import { pickWinners } from "../pipeline/winners.js";
import { WorkshopClient } from "../workshop/client.js";

const IMAGES_DIR = "images";
const INDEX_FILE = "index.json";

function parseLimit(argv: string[]): number | undefined {
  const index = argv.indexOf("--limit");
  if (index === -1) return undefined;
  const raw = argv[index + 1];
  if (raw === undefined) throw new Error("--limit requires a positive integer");
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`--limit must be a positive integer, got "${raw}"`);
  }
  return limit;
}

async function downloadOne(winner: WorkshopItem, target: string): Promise<void> {
  const url = originalImageUrl(winner.previewUrl);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const jpeg = await toJpeg(Buffer.from(await res.arrayBuffer()));
  // Write aside, then rename: an interrupted run never leaves a half-written image.
  const tmp = `${target}.tmp`;
  await writeFile(tmp, jpeg);
  await rename(tmp, target);
}

async function main(): Promise<void> {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) {
    console.error("STEAM_API_KEY environment variable is required.");
    process.exit(1);
  }

  const limit = parseLimit(process.argv.slice(2));

  const client = new WorkshopClient({
    apiKey,
    onProgress: (itemsSoFar) => {
      process.stderr.write(`\rSearching the Workshop for KZ maps... ${itemsSoFar} items`);
    },
  });
  console.error("Searching the Workshop for KZ maps (search_text=kz, one pass)...");
  const items = await client.enumerate();
  console.error(`\nSearch returned ${items.length} Workshop items.`);

  const winners = pickWinners(filterKzMaps(items));
  const entries = [...winners.entries()].sort(([a], [b]) => a.localeCompare(b));
  const selected = limit === undefined ? entries : entries.slice(0, limit);
  console.error(`Downloading previews for ${selected.length} of ${entries.length} KZ maps...`);

  await mkdir(IMAGES_DIR, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let noPreview = 0;
  const failures: string[] = [];

  for (const [name, winner] of selected) {
    const target = path.join(IMAGES_DIR, `${name}.jpg`);
    if (existsSync(target)) {
      skipped++;
      console.error(`skip     ${name} (already present)`);
      continue;
    }
    if (winner.previewUrl === "") {
      noPreview++;
      console.error(`skip     ${name} (no preview image in the Workshop)`);
      continue;
    }
    try {
      await downloadOne(winner, target);
      downloaded++;
      console.error(`download ${name}`);
    } catch (error) {
      failures.push(name);
      console.error(`FAILED   ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.error(
    `\nDone: ${downloaded} downloaded, ${skipped} skipped (present), ${noPreview} without preview, ${failures.length} failed.`,
  );

  // Rebuild index.json from the images on disk (source of truth), enriched
  // with this run's Workshop metadata (ADR 0002). The full winners map is
  // used, not the --limit slice, so every stored map gets its metadata.
  const index = await rebuildIndexFile({
    imagesDir: IMAGES_DIR,
    indexPath: INDEX_FILE,
    winners,
  });
  console.error(
    index.outcome === "updated"
      ? `index.json updated (${index.mapCount} maps).`
      : `index.json unchanged (${index.mapCount} maps).`,
  );

  if (failures.length > 0) {
    console.error(`Failed: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
