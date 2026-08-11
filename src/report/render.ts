import type { ScanDiff } from "./diff.js";

/** Telegram's hard cap on a single `sendMessage` text. */
export const TELEGRAM_MESSAGE_LIMIT = 4096;

/**
 * Turns a diff into Telegram-ready messages: a counts header, one line per
 * Missing map paired with its Workshop page link, a labelled No-preview
 * section, and automatic splitting on line boundaries so no message exceeds
 * Telegram's limit. Empty sections are omitted; the header is always sent,
 * so silence never means "the job died".
 */
export function renderReport(diff: ScanDiff): string[] {
  const lines: string[] = [
    `✅ ${diff.have.length} | ⬆️ ${diff.missing.length} | 🚫 ${diff.noPreview.length}`,
  ];

  if (diff.missing.length > 0) {
    lines.push("", "⬆️ Missing:");
    for (const entry of diff.missing) {
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
