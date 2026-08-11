import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramClient } from "./client.js";

interface SentRequest {
  url: string;
  body: unknown;
}

/** Builds a `fetch` stub that records requests and replays the given responses in order. */
function mockFetch(responses: Array<{ status?: number; body: unknown }>): SentRequest[] {
  const requests: SentRequest[] = [];
  let call = 0;
  const stub = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const response = responses[call++];
    if (!response) throw new Error("more sendMessage calls than mocked responses");
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body)),
    });
    return Response.json(response.body, { status: response.status ?? 200 });
  };
  vi.stubGlobal("fetch", stub);
  return requests;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TelegramClient.send", () => {
  it("posts chat_id and text to the Bot API endpoint for the token", async () => {
    const requests = mockFetch([{ body: { ok: true, result: { message_id: 1 } } }]);
    const client = new TelegramClient({ botToken: "token-123", chatId: "-10042" });

    await client.send("✅ 3 | ⬆️ 1 | 🚫 0");

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.url).toBe("https://api.telegram.org/bottoken-123/sendMessage");
    expect(request.body).toEqual({ chat_id: "-10042", text: "✅ 3 | ⬆️ 1 | 🚫 0" });
  });

  it("throws with the API's description when Telegram rejects the call", async () => {
    mockFetch([
      {
        status: 401,
        body: { ok: false, error_code: 401, description: "Unauthorized" },
      },
    ]);
    const client = new TelegramClient({ botToken: "bad-token", chatId: "1" });

    await expect(client.send("hello")).rejects.toThrow(/Unauthorized/);
  });

  it("throws with the API's description when the chat id is wrong", async () => {
    mockFetch([
      {
        status: 400,
        body: { ok: false, error_code: 400, description: "Bad Request: chat not found" },
      },
    ]);
    const client = new TelegramClient({ botToken: "token", chatId: "bogus" });

    await expect(client.send("hello")).rejects.toThrow(/chat not found/);
  });

  it("reports the HTTP status when the body is not a Bot API envelope", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response("<html>gateway error</html>", { status: 502 }),
    );
    const client = new TelegramClient({ botToken: "token", chatId: "1" });

    await expect(client.send("hello")).rejects.toThrow(/502/);
  });
});
