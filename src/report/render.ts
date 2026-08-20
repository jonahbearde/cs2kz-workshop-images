import { COLLAGE_TILE_CAP, composeCollage, type CollageTile } from "./collage.js";
import type { ScanDiff, MissingMap } from "./diff.js";
import type { ReportMessage } from "./message.js";

/** Telegram's hard cap on a single `sendMessage` text. */
export const TELEGRAM_MESSAGE_LIMIT = 4096;
/** Telegram's hard cap on a `sendPhoto` caption. */
export const TELEGRAM_CAPTION_LIMIT = 1024;

/**
 * The only non-ASCII characters allowed anywhere in a report message.
 * Everything else is plain ASCII text — no icons, no emoji.
 */
const OK_MARK = "✓";
const FAIL_MARK = "✗";

/** Everything the Sync renderer needs beyond the diff: outcomes and the collage. */
export interface SyncReportInput {
  diff: ScanDiff;
  /** Names whose image was downloaded and stored successfully this run. */
  ok: Set<string>;
  /** Collage tiles in display order (already capped); the caption names exactly these maps when truncated. */
  tiles: CollageTile[];
}

/**
 * Renders the Sync's single report message. With image tiles this is a
 * collage photo whose HTML caption describes the run; with no tiles at all
 * (every change failed, or nothing changed) it degrades to one plain text
 * message with the same content, so a daily run always arrives as exactly
 * one message.
 */
export async function renderSyncReport(input: SyncReportInput): Promise<ReportMessage> {
  const caption = buildCaption(input);
  if (input.tiles.length === 0) {
    // No collage exists to attach; the text message carries the full report.
    return { kind: "text", text: caption };
  }
  const photo = await composeCollage(input.tiles);
  return { kind: "photo", photo, caption };
}

/**
 * Renders the Scan's report: the same no-icon, linked-name sections as the
 * Sync's caption, but text only — the Scan never downloads, so it has no
 * marks and no collage. Splits on line boundaries so no message exceeds
 * Telegram's text limit.
 */
export function renderScanReport(diff: ScanDiff): string[] {
  return splitIntoMessages(
    reportLines(diff, { marks: false, shown: null }),
    TELEGRAM_MESSAGE_LIMIT,
  );
}

function buildCaption(input: SyncReportInput): string {
  const expected = input.diff.missing.length + input.diff.stale.length;
  // The collage shows at most the cap; the caption names exactly the maps
  // whose images are in it, whether or not the caller already capped the
  // list, so the two can never disagree.
  const collaged = input.tiles.slice(0, COLLAGE_TILE_CAP);
  // Truncation: when the name list would exceed the collage tile cap, stop
  // after the maps whose images are in the collage. The counts in the
  // headers always stay exact; `…and K more` carries the hidden remainder.
  const truncate = collaged.length > 0 && expected > COLLAGE_TILE_CAP;
  const shown = truncate ? new Set(collaged.map((tile) => tile.name)) : null;
  const tail = truncate ? expected - collaged.length : 0;
  const lines = reportLines(input.diff, { marks: true, ok: input.ok, shown, tail });
  // A photo run's name list is at most the 8 collaged maps plus any
  // no-preview lines, so the caption stays bounded; should it ever exceed
  // Telegram's limit despite that (many simultaneous no-preview maps),
  // Telegram rejects the send and the run is marked red like any other
  // send failure — the store work is never undone.
  return lines.join("\n");
}

interface LineOptions {
  marks: boolean;
  ok?: Set<string>;
  /** `null` shows every line (no truncation) — the Scan and text-degraded runs. */
  shown: Set<string> | null;
  /** Lines to fold into a trailing `…and K more` after the New/Updated sections. */
  tail?: number;
}

function reportLines(diff: ScanDiff, options: LineOptions): string[] {
  const lines: string[] = [`In Stock: ${diff.have.length}`];

  pushSection(lines, diff.missing, `New (${diff.missing.length}):`, options);
  pushSection(lines, diff.stale, `Updated (${diff.stale.length}):`, options);

  if ((options.tail ?? 0) > 0) {
    lines.push("", `…and ${options.tail} more`);
  }

  // No-preview maps are never marks and never part of the collage, so they
  // are never truncated: a missing preview is a signal, not a download.
  pushSection(
    lines,
    diff.noPreview,
    `No preview (${diff.noPreview.length}):`,
    { marks: false, shown: null },
  );

  return lines;
}

function pushSection(
  lines: string[],
  entries: MissingMap[],
  header: string,
  options: LineOptions,
): void {
  const selected =
    options.shown === null ? entries : entries.filter((entry) => options.shown!.has(entry.name));
  // Sections appear only when non-empty (truncation can empty a section).
  if (selected.length === 0) return;
  lines.push("", header);
  for (const entry of selected) {
    const mark = options.marks
      ? ` ${options.ok!.has(entry.name) ? OK_MARK : FAIL_MARK}`
      : "";
    lines.push(`${linkFor(entry)}${mark}`);
  }
}

/** Map names render as Workshop-page links, with `& < >` escaped everywhere. */
export function linkFor(entry: MissingMap): string {
  return `<a href="${escapeHtml(entry.workshopUrl)}">${escapeHtml(entry.name)}</a>`;
}

/** Escapes the three characters Telegram's HTML parse mode treats specially. */
export function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
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