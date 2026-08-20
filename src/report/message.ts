/**
 * The single deliverable of a Sync run: one message to the maintainer's
 * Telegram chat. Either a composited collage photo with an HTML caption, or
 * a plain text message (used when the run produced no images at all, for
 * the failure notification, and by the Scan which never sends photos).
 */
export type ReportMessage =
  | { kind: "text"; text: string }
  | { kind: "photo"; photo: Buffer; caption: string };