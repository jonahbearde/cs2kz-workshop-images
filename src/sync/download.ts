import type { DownloadOutcome } from "../report/outcome.js";

/** One image the Sync must fetch: a Missing map or a Stale one. */
export interface DownloadTask {
  name: string;
  /** Raw preview URL of the Winner; original-resolution handling is the downloader's job. */
  previewUrl: string;
  /** Which bucket the task came from — decides how success is classified. */
  kind: "missing" | "stale";
}

/** The per-map result of the download phase, in task order. */
export interface DownloadTaskResult {
  name: string;
  kind: "missing" | "stale";
  /** Whether the image was fetched and stored. */
  ok: boolean;
  /** The final stored JPEG bytes (present when `ok`) — feeds the collage tiles. */
  jpeg: Buffer | undefined;
  /** The failure reason (present when `!ok`). */
  reason: string | undefined;
}

/** Everything the download phase needs from the outside world; wiring lives in the CLI. */
export interface DownloadDeps {
  /** Fetches one preview and returns the final JPEG bytes; throws on any failure. */
  download(previewUrl: string): Promise<Buffer>;
  /** Atomically stores the image for a map name. */
  write(name: string, jpeg: Buffer): Promise<void>;
  /** Waits between attempts; injected so tests never actually sleep. */
  sleep(ms: number): Promise<void>;
}

/** Total attempts per image, including the first one. */
export const DOWNLOAD_ATTEMPTS = 3;
/** Delay between attempts. */
export const RETRY_DELAY_MS = 2000;
/** Failure reasons ride in a Telegram line; keep them short. */
const MAX_REASON_LENGTH = 300;

/**
 * Runs every task with up to `DOWNLOAD_ATTEMPTS` attempts per image,
 * sleeping between attempts. One task's failure never stops the rest —
 * Steam UGC hiccups are routine, and tomorrow's Sync retries whatever
 * failed today. Downloads and writes both count against the attempt
 * budget; a persistently failing write is reported the same way as a
 * persistently failing fetch. The stored JPEGs ride back in the results so
 * the Sync can build the report collage without re-reading or re-fetching.
 */
export async function downloadAll(
  tasks: DownloadTask[],
  deps: DownloadDeps,
): Promise<{ outcome: DownloadOutcome; results: DownloadTaskResult[] }> {
  const outcome: DownloadOutcome = { downloaded: [], updated: [], failures: [] };
  const results: DownloadTaskResult[] = [];

  for (const task of tasks) {
    const result = await downloadWithRetry(task, deps);
    if (result.ok) {
      (task.kind === "missing" ? outcome.downloaded : outcome.updated).push(task.name);
      results.push({
        name: task.name,
        kind: task.kind,
        ok: true,
        jpeg: result.jpeg,
        reason: undefined,
      });
    } else {
      outcome.failures.push({ name: task.name, reason: truncate(result.reason) });
      results.push({
        name: task.name,
        kind: task.kind,
        ok: false,
        jpeg: undefined,
        reason: truncate(result.reason),
      });
    }
  }

  return { outcome, results };
}

async function downloadWithRetry(
  task: DownloadTask,
  deps: DownloadDeps,
): Promise<{ ok: true; jpeg: Buffer } | { ok: false; reason: string }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      const jpeg = await deps.download(task.previewUrl);
      await deps.write(task.name, jpeg);
      return { ok: true, jpeg };
    } catch (error) {
      lastError = error;
      // No delay after the final attempt: nothing follows it.
      if (attempt < DOWNLOAD_ATTEMPTS) await deps.sleep(RETRY_DELAY_MS);
    }
  }
  return { ok: false, reason: lastError instanceof Error ? lastError.message : String(lastError) };
}

function truncate(reason: string): string {
  return reason.length > MAX_REASON_LENGTH ? `${reason.slice(0, MAX_REASON_LENGTH)}…` : reason;
}