import type { ReportMessage } from "../report/message.js";

export interface TelegramClientOptions {
  /** Bot token from BotFather (`TELEGRAM_BOT_TOKEN`). */
  botToken: string;
  /** Chat the Scan and Sync report to (`TELEGRAM_CHAT_ID`), typically a private chat. */
  chatId: string;
}

interface TelegramEnvelope {
  ok?: boolean;
  description?: string;
}

/**
 * The only module that talks to Telegram. Wraps `sendMessage` (text) and
 * `sendPhoto` (collage + HTML caption) on the Bot API, dispatching on the
 * report's message kind. Both endpoints mirror errors the same way: throw
 * with the API `description` when Telegram rejects the call.
 */
export class TelegramClient {
  constructor(private readonly options: TelegramClientOptions) {}

  /** Sends one report message to the configured chat; throws when Telegram rejects it. */
  async send(message: ReportMessage): Promise<void> {
    if (message.kind === "photo") {
      await this.sendPhoto(message.photo, message.caption);
      return;
    }
    await this.sendText(message.text);
  }

  /** One plain text message — the degraded, empty-run, and failure cases. */
  private async sendText(text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.options.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // parse_mode HTML like the photo path: the Scan's and degraded Sync's
      // text reports carry map names as HTML links.
      body: JSON.stringify({ chat_id: this.options.chatId, text, parse_mode: "HTML" }),
    });
    await this.assertOk(res, "sendMessage");
  }

  /**
   * One photo message: multipart/form-data carrying the photo bytes as a
   * file part, the caption, and `parse_mode: HTML` so map-name links below.
   */
  private async sendPhoto(photo: Buffer, caption: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.options.botToken}/sendPhoto`;
    const form = new FormData();
    form.append("chat_id", this.options.chatId);
    form.append("photo", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "report.jpg");
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    const res = await fetch(url, { method: "POST", body: form });
    await this.assertOk(res, "sendPhoto");
  }

  private async assertOk(res: Response, endpoint: string): Promise<void> {
    let envelope: TelegramEnvelope | undefined;
    try {
      envelope = (await res.json()) as TelegramEnvelope;
    } catch {
      envelope = undefined;
    }
    if (envelope?.ok !== true) {
      const reason = envelope?.description ?? `HTTP ${res.status}`;
      throw new Error(`Telegram ${endpoint} failed: ${reason}`);
    }
  }
}