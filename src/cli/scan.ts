import { listRepoMaps, rebuildIndexFile } from "../pipeline/indexer.js";
import { runScan } from "../scan/scan.js";
import { TelegramClient } from "../telegram/client.js";
import { WorkshopClient } from "../workshop/client.js";

const IMAGES_DIR = "images";
const INDEX_FILE = "index.json";

/**
 * The daily Scan, runnable end-to-end on the maintainer's machine:
 * enumerate the Workshop, diff against images/, rebuild index.json, and
 * deliver the report to Telegram. The report is always sent, so silence
 * never means "the job died"; on failure a notification naming the cause
 * goes to the same chat before exiting non-zero.
 */
async function main(): Promise<void> {
  const apiKey = process.env.STEAM_API_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!apiKey) {
    console.error("STEAM_API_KEY environment variable is required.");
    process.exit(1);
  }
  if (!botToken) {
    console.error("TELEGRAM_BOT_TOKEN environment variable is required.");
    process.exit(1);
  }
  if (!chatId) {
    console.error("TELEGRAM_CHAT_ID environment variable is required.");
    process.exit(1);
  }

  const client = new WorkshopClient({
    apiKey,
    onProgress: (itemsSoFar) => {
      process.stderr.write(`\rSearching the Workshop for KZ maps... ${itemsSoFar} items`);
    },
  });
  const telegram = new TelegramClient({ botToken, chatId });

  console.error("Scanning the Workshop (search_text=kz, one pass)...");
  const result = await runScan({
    enumerate: () => client.enumerate(),
    listRepoMaps: () => listRepoMaps(IMAGES_DIR),
    rebuildIndex: (winners) =>
      rebuildIndexFile({ imagesDir: IMAGES_DIR, indexPath: INDEX_FILE, winners }),
    send: (text) => telegram.send(text),
  });

  console.error("");
  for (const [i, message] of result.messages.entries()) {
    if (i > 0) console.log("");
    console.log(message);
  }
  console.error(
    `\nindex.json ${result.index.outcome} (${result.index.mapCount} maps). ` +
      `${result.messages.length} message(s) sent to Telegram.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  // exitCode, not exit(): process.exit() after a fetch can trip a libuv
  // assertion crash on Windows (Node 24), and by this point the failure
  // notification has already been sent inside runScan.
  process.exitCode = 1;
});
