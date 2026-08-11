import type { ScanDiff } from "./diff.js";
import type { SyncOutcome } from "./outcome.js";

/** Telegram's hard cap on a single `sendMessage` text. */
export const TELEGRAM_MESSAGE_LIMIT = 4096;

/**
 * Turns a diff into Telegram-ready messages: a counts header, one line per
 * Missing map paired with its Workshop page link, a Stale section of the
 * same shape, a labelled No-preview section, and automatic splitting on
 * line boundaries so no message exceeds Telegram's limit. Empty sections
 * are omitted; the header is always sent, so silence never means "the job
 * died".
 */
export function renderReport(diff: ScanDiff): string[] {
  const lines: string[] = [
    `✅ ${diff.have.length} | ⬇️ ${diff.missing.length} | 🔄 ${diff.stale.length} | 🚫 ${diff.noPreview.length}`,
  ];

  if (diff.missing.length > 0) {
    lines.push("", "⬇️ Missing:");
    for (const entry of diff.missing) {
      lines.push(`${entry.name}: ${entry.workshopUrl}`);
    }
  }

  if (diff.stale.length > 0) {
    lines.push("", "🔄 Stale:");
    for (const entry of diff.stale) {
      lines.push(`${entry.name}: ${entry.workshopUrl}`);
    }
  }

  if (diff.noPreview.length > 0) {
    lines.push("", "🚫 No preview:");
    lines.push(...diff.noPreview);
  }

  return splitIntoMessages(lines, TELEGRAM_MESSAGE_LIMIT);
}

/**
 * Renders the run-result message sent after the download phase: a counts
 * header, then one section per non-empty bucket (downloaded, updated,
 * failed with reasons). Always produces at least one message — an empty
 * outcome still arrives as "nothing to do", so silence never means "the
 * job died".
 */
export function renderResult(outcome: SyncOutcome): string[] {
  if (outcome.downloaded.length === 0 && outcome.updated.length === 0 && outcome.failures.length === 0) {
    return ["✅ Nothing to do."];
  }

  const lines: string[] = [
    `⬇️ ${outcome.downloaded.length} | 🔄 ${outcome.updated.length} | ❌ ${outcome.failures.length}`,
  ];

  if (outcome.downloaded.length > 0) {
    lines.push("", "⬇️ Downloaded:", ...outcome.downloaded);
  }
  if (outcome.updated.length > 0) {
    lines.push("", "🔄 Updated:", ...outcome.updated);
  }
  if (outcome.failures.length > 0) {
    lines.push("", "❌ Failed:");
    for (const failure of outcome.failures) {
      lines.push(`${failure.name}: ${failure.reason}`);
    }
  }

  return splitIntoMessages(lines, TELEGRAM_MESSAGE_LIMIT);
}

/**
 * Packs lines into messages of at most `limit` characters (Telegram's limit
 * by default), joining with newlines and only ever splitting on line boundaries. Lines are never
 * broken mid-way; a single line longer than the limit is an error rather
 * than silently truncated.
 */
export function splitIntoMessages(lines: string[], limit: number = TELEGRAM_MESSAGE_LIMIT): string[] {
  const messages: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const line of lines) {
    if (line.length > limit) {
      throw new Error(
        `report line is longer than the ${limit}-character message limit: "${line.slice(0, 60)}…"`,
      );
    }
    // +1 for the newline separator between this line and the previous one.
    if (current.length > 0 && currentLength + line.length + 1 > limit) {
      messages.push(current.join("\n"));
      current = [line];
      currentLength = line.length;
    } else {
      currentLength += current.length === 0 ? line.length : line.length + 1;
      current.push(line);
    }
  }

  if (current.length > 0) messages.push(current.join("\n"));
  return messages;
}
