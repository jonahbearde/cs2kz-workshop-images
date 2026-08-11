import { filterKzMaps } from "../pipeline/filter.js";
import type { WorkshopIndex } from "../pipeline/indexer.js";
import { pickWinners } from "../pipeline/winners.js";
import { diffRepo } from "../report/diff.js";
import type { SyncOutcome } from "../report/outcome.js";
import { renderReport, renderResult } from "../report/render.js";
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
  /** Delivers one message to the maintainer's Telegram chat. */
  send(text: string): Promise<void>;
  /** Waits between download attempts; injected so tests never actually sleep. */
  sleep(ms: number): Promise<void>;
}

export interface SyncResult {
  /** The report messages, in the order they were sent. */
  report: string[];
  /** What the download phase did. */
  outcome: SyncOutcome;
  /** The run-result messages, in the order they were sent. */
  result: string[];
  index: { outcome: "updated" | "unchanged"; mapCount: number };
  /** True when any Telegram send failed; the run still completed otherwise. */
  telegramFailed: boolean;
}

/**
 * One Sync run: enumerate → diff (with Stale detection) → report → download
 * Missing and Stale previews → result message → index rebuild. Both Telegram
 * messages are always attempted — silence never means "the job died" — but a
 * send failure never aborts the run: the store is the product, Telegram is
 * only the notification channel; `telegramFailed` lets the CLI mark the run
 * red instead. When a fatal stage fails, a notification naming the cause is
 * sent to the same chat as a best-effort final step, and the original error
 * is rethrown.
 */
export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  let telegramFailed = false;
  const sendBestEffort = async (text: string): Promise<void> => {
    try {
      await deps.send(text);
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

    const report = renderReport(diff);
    for (const message of report) {
      await sendBestEffort(message);
    }

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
    const outcome = await downloadAll(tasks, {
      download: deps.download,
      write: deps.write,
      sleep: deps.sleep,
    });

    const result = renderResult(outcome);
    for (const message of result) {
      await sendBestEffort(message);
    }

    const indexResult = await deps.rebuildIndex(winners);

    return { report, outcome, result, index: indexResult, telegramFailed };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await deps.send(`❌ Sync failed: ${reason}`).catch(() => {
      // Best-effort: never mask the original error with a notification failure.
    });
    throw error;
  }
}
