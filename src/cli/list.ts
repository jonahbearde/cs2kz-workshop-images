import { filterKzMaps } from "../pipeline/filter.js";
import { pickWinners } from "../pipeline/winners.js";
import { WorkshopClient } from "../workshop/client.js";

async function main(): Promise<void> {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) {
    console.error("STEAM_API_KEY environment variable is required.");
    process.exit(1);
  }

  const client = new WorkshopClient({
    apiKey,
    onProgress: (itemsSoFar) => {
      process.stderr.write(`\rSearching the Workshop for KZ maps... ${itemsSoFar} items`);
    },
  });
  console.error("Searching the Workshop for KZ maps (search_text=kz, one pass)...");
  const items = await client.enumerate();
  console.error(`\nSearch returned ${items.length} Workshop items.`);

  const kzMaps = filterKzMaps(items);
  const winners = pickWinners(kzMaps);
  const names = [...winners.keys()].sort();

  for (const name of names) {
    console.log(name);
  }
  console.error(`\nTotal: ${names.length} KZ maps (${kzMaps.length} items before Winner selection).`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
