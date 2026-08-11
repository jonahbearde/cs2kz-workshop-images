export interface TelegramClientOptions {
  /** Bot token from BotFather (`TELEGRAM_BOT_TOKEN`). */
  botToken: string;
  /** Chat the Scan reports to (`TELEGRAM_CHAT_ID`), typically a private chat. */
  chatId: string;
}

interface SendMessageEnvelope {
  ok?: boolean;
  description?: string;
}

/** The only module that talks to Telegram. Wraps `sendMessage` on the Bot API. */
export class TelegramClient {
  constructor(private readonly options: TelegramClientOptions) {}

  /** Sends one text message to the configured chat; throws when Telegram rejects it. */
  async send(text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.options.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: this.options.chatId, text }),
    });

    let envelope: SendMessageEnvelope | undefined;
    try {
      envelope = (await res.json()) as SendMessageEnvelope;
    } catch {
      envelope = undefined;
    }
    if (envelope?.ok !== true) {
      const reason = envelope?.description ?? `HTTP ${res.status}`;
      throw new Error(`Telegram sendMessage failed: ${reason}`);
    }
  }
}
