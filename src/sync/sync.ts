import { filterKzMaps } from "../pipeline/filter.js";
import type { WorkshopIndex } from "../pipeline/indexer.js";
import { pickWinners } from "../pipeline/winners.js";
import { COLLAGE_TILE_CAP, type CollageTile } from "../report/collage.js";
import { diffRepo } from "../report/diff.js";
import type { ReportMessage } from "../report/message.js";
import type { DownloadOutcome } from "../report/outcome.js";
import { renderSyncReport } from "../report/render.js";
import type { WorkshopItem } from "../workshop/types.js";
import { downloadAll, type DownloadTask } from "./download.js";

/** Everything the Sync needs from the outside world; wiring lives in the CLI. */
export interface SyncDeps {
  /** One search pass over the Workshop (ADR 0003). */
  enumerate(): Promise<WorkshopItem[]>;
  /** Map names stored in this repo, read from images/. */
  listRepoMaps(): Promise<string[]>;
  /** The Index as recorded before this run — the baseline for Stale detection (ADR 0004). */
  readIndex(): Promise<WorkshopIndex>;
  /** Rebuilds index.json from repo images enriched with this run's Winners. */
  rebuildIndex(winners: Map<string, WorkshopItem>): Promise<{
    outcome: "updated" | "unchanged";
    mapCount: number;
  }>;
  /** Fetches one preview and returns the final JPEG bytes; throws on any failure. */
  download(previewUrl: string): Promise<Buffer>;
  /** Atomically stores the image for a map name. */
  write(name: string, jpeg: Buffer): Promise<void>;
  /** Reads a stored image (the pre-overwrite snapshot that becomes an Updated pair's old half). */
  readImage(name: string): Promise<Buffer>;
  /** Delivers one message to the maintainer's Telegram chat. */
  send(message: ReportMessage): Promise<void>;
  /** Waits between download attempts; injected so tests never actually sleep. */
  sleep(ms: number): Promise<void>;
}

export interface SyncResult {
  /** The single message sent after the download phase. */
  message: ReportMessage;
  /** What the download phase did. */
  outcome: DownloadOutcome;
  index: { outcome: "updated" | "unchanged"; mapCount: number };
  /** True when the Telegram send failed; the run still completed otherwise. */
  telegramFailed: boolean;
}

/**
 * One Sync run: enumerate → diff (with Stale detection) → download Missing
 * and Stale previews → send **one** report message (collage photo with a
 * linked-name HTML caption, or a plain text message when the run produced
 * no images) → index rebuild. The message always arrives after the download
 * phase, so it reports facts; a failed download shows as a `✗` mark on its
 * line and no image in the collage. The message is always attempted —
 * silence never means "the job died" — but a send failure never aborts the
 * run: the store is the product, Telegram is only the notification channel;
 * `telegramFailed` lets the CLI mark the run red instead. When a fatal
 * stage fails, a notification naming the cause is sent to the same chat as
 * a best-effort final step, and the original error is rethrown.
 */
export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  let telegramFailed = false;
  const sendBestEffort = async (message: ReportMessage): Promise<void> => {
    try {
      await deps.send(message);
    } catch {
      telegramFailed = true;
    }
  };

  try {
    const items = await deps.enumerate();
    const winners = pickWinners(filterKzMaps(items));
    const repoMaps = await deps.listRepoMaps();
    // Staleness is judged against the index recorded BEFORE this run;
    // rebuilding first would always compare the winner against itself.
    const index = await deps.readIndex();
    const diff = diffRepo(winners, repoMaps, index);

    const tasks: DownloadTask[] = [
      ...diff.missing.map((entry) => ({
        name: entry.name,
        previewUrl: winners.get(entry.name)!.previewUrl,
        kind: "missing" as const,
      })),
      ...diff.stale.map((entry) => ({
        name: entry.name,
        previewUrl: winners.get(entry.name)!.previewUrl,
        kind: "stale" as const,
      })),
    ];
    // Snapshot the stored images of Stale maps BEFORE the downloads overwrite
    // them: the report's Updated pairs need those old halves, and everything
    // else the collage needs is already in memory from this run's writes. A
    // snapshot that cannot be read only costs that map its old half — it
    // renders as a single tile showing the fresh preview — it never aborts
    // the run or the downloads.
    const oldHalves = new Map<string, Buffer>();
    for (const entry of diff.stale) {
      try {
        oldHalves.set(entry.name, await deps.readImage(entry.name));
      } catch {
        // keep going without the old half
      }
    }

    const { outcome, results } = await downloadAll(tasks, {
      download: deps.download,
      write: deps.write,
      sleep: deps.sleep,
    });

    // Tiles: every successfully stored map contributes one tile in download
    // order (New thumbnails first, then Updated pairs), capped at 8. Failed
    // maps contribute nothing — a `✗` line names them, the collage never
    // pretends a broken download produced an image.
    const ok = new Set([...outcome.downloaded, ...outcome.updated]);
    const tiles: CollageTile[] = [];
    for (const result of results) {
      if (!result.ok || tiles.length >= COLLAGE_TILE_CAP) continue;
      const oldHalf = oldHalves.get(result.name);
      // With its old half available an Updated map renders as a pair tile;
      // without it (unreadable snapshot) it falls back to a single tile of
      // the fresh preview, like a New map would.
      tiles.push(
        result.kind === "stale" && oldHalf !== undefined
          ? { name: result.name, kind: "updated", images: [oldHalf, result.jpeg!] }
          : { name: result.name, kind: "new", images: [result.jpeg!] },
      );
    }

    const message = await renderSyncReport({ diff, ok, tiles });
    // The one message, after the download phase, sent exactly once.
    await sendBestEffort(message);

    const indexResult = await deps.rebuildIndex(winners);

    return { message, outcome, index: indexResult, telegramFailed };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await deps.send({ kind: "text", text: `Sync failed: ${reason}` }).catch(() => {
      // Best-effort: never mask the original error with a notification failure.
    });
    throw error;
  }
}