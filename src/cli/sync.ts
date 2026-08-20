import path from "node:path";
import { listRepoMaps, readIndexFile, rebuildIndexFile } from "../pipeline/indexer.js";
import { fetchPreviewJpeg, readImageFile, writeImageAtomic } from "../pipeline/store.js";
import { runSync } from "../sync/sync.js";
import { TelegramClient } from "../telegram/client.js";
import { WorkshopClient } from "../workshop/client.js";

const IMAGES_DIR = "images";
const INDEX_FILE = "index.json";

/**
 * The daily Sync, runnable end-to-end on the maintainer's machine:
 * enumerate the Workshop, diff against images/ (with Stale detection),
 * download every Missing preview and re-download every Stale one, send the
 * single collage report, and rebuild index.json. Telegram never blocks the
 * run — the store is the product — but any failed send or download marks
 * the run red via a non-zero exit. On a fatal error a notification naming
 * the cause goes to the same chat before exiting non-zero.
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

  console.error("Syncing with the Workshop (search_text=kz, one pass)...");
  const result = await runSync({
    enumerate: () => client.enumerate(),
    listRepoMaps: () => listRepoMaps(IMAGES_DIR),
    readIndex: () => readIndexFile(INDEX_FILE),
    rebuildIndex: (winners) =>
      rebuildIndexFile({ imagesDir: IMAGES_DIR, indexPath: INDEX_FILE, winners }),
    download: (previewUrl) => fetchPreviewJpeg(previewUrl),
    write: (name, jpeg) => writeImageAtomic(path.join(IMAGES_DIR, `${name}.jpg`), jpeg),
    readImage: (name) => readImageFile(path.join(IMAGES_DIR, `${name}.jpg`)),
    send: (message) => telegram.send(message),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });

  console.error("");
  console.log(result.message.kind === "photo" ? result.message.caption : result.message.text);
  console.error(
    `\n${result.outcome.downloaded.length} downloaded, ${result.outcome.updated.length} updated, ` +
      `${result.outcome.failures.length} failed; index.json ${result.index.outcome} ` +
      `(${result.index.mapCount} maps); telegram ${result.telegramFailed ? "FAILED" : "ok"}.`,
  );

  if (result.outcome.failures.length > 0 || result.telegramFailed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  // exitCode, not exit(): process.exit() after a fetch can trip a libuv
  // assertion crash on Windows (Node 24), and by this point the failure
  // notification has already been sent inside runSync.
  process.exitCode = 1;
});
