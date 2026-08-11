import { filterKzMaps } from "../pipeline/filter.js";
import { pickWinners } from "../pipeline/winners.js";
import { diffRepo } from "../report/diff.js";
import { renderReport } from "../report/render.js";
import type { WorkshopItem } from "../workshop/types.js";

/** Everything the Scan needs from the outside world; wiring lives in the CLI. */
export interface ScanDeps {
  /** One search pass over the Workshop (ADR 0003). */
  enumerate(): Promise<WorkshopItem[]>;
  /** Map names stored in this repo, read from images/. */
  listRepoMaps(): Promise<string[]>;
  /** Rebuilds index.json from repo images enriched with this run's Winners. */
  rebuildIndex(winners: Map<string, WorkshopItem>): Promise<{
    outcome: "updated" | "unchanged";
    mapCount: number;
  }>;
  /** Delivers one message to the maintainer's Telegram chat. */
  send(text: string): Promise<void>;
}

export interface ScanResult {
  /** The report messages, in the order they were sent. */
  messages: string[];
  index: { outcome: "updated" | "unchanged"; mapCount: number };
}

/**
 * One Scan run: enumerate → diff against the repo → index rebuild → report →
 * send. The report is always sent — an unchanged result still arrives, so
 * silence never means "the job died". When any stage fails, a failure
 * notification naming the cause is sent to the same chat as a best-effort
 * final step, and the original error is rethrown.
 */
export async function runScan(deps: ScanDeps): Promise<ScanResult> {
  try {
    const items = await deps.enumerate();
    const winners = pickWinners(filterKzMaps(items));
    const repoMaps = await deps.listRepoMaps();
    const diff = diffRepo(winners, repoMaps);
    const index = await deps.rebuildIndex(winners);
    const messages = renderReport(diff);
    // Sequential awaits: messages arrive in order.
    for (const message of messages) {
      await deps.send(message);
    }
    return { messages, index };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await deps.send(`❌ Scan failed: ${reason}`).catch(() => {
      // Best-effort: never mask the original error with a notification failure.
    });
    throw error;
  }
}
