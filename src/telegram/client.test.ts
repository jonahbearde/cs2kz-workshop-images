import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramClient } from "./client.js";

interface SentRequest {
  url: string;
  body: string | FormData | undefined;
}

/** Builds a `fetch` stub that records requests and replays the given responses in order. */
function mockFetch(responses: Array<{ status?: number; body: unknown }>): SentRequest[] {
  const requests: SentRequest[] = [];
  let call = 0;
  const stub = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const response = responses[call++];
    if (!response) throw new Error("more Telegram calls than mocked responses");
    requests.push({
      url: String(input),
      body: init?.body instanceof FormData ? init.body : JSON.parse(String(init?.body)),
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
  it("posts chat_id, text, and HTML parse mode to the sendMessage endpoint for the token", async () => {
    const requests = mockFetch([{ body: { ok: true, result: { message_id: 1 } } }]);
    const client = new TelegramClient({ botToken: "token-123", chatId: "-10042" });

    await client.send({ kind: "text", text: "In Stock: 3" });

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.url).toBe("https://api.telegram.org/bottoken-123/sendMessage");
    expect(request.body).toEqual({ chat_id: "-10042", text: "In Stock: 3", parse_mode: "HTML" });
  });

  it("posts the photo bytes, caption, and HTML parse mode to the sendPhoto endpoint", async () => {
    const requests = mockFetch([{ body: { ok: true, result: { message_id: 2 } } }]);
    const client = new TelegramClient({ botToken: "token-123", chatId: "-10042" });
    const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const caption = '<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=1">kz_a</a> ✓';

    await client.send({ kind: "photo", photo, caption });

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.url).toBe("https://api.telegram.org/bottoken-123/sendPhoto");
    const form = request.body as FormData;
    expect(form.get("chat_id")).toBe("-10042");
    expect(form.get("caption")).toBe(caption);
    expect(form.get("parse_mode")).toBe("HTML");
    const photoPart = form.get("photo") as File;
    expect(photoPart.name).toBe("report.jpg");
    expect(photoPart.type).toBe("image/jpeg");
    expect(Buffer.from(await photoPart.arrayBuffer())).toEqual(photo);
  });

  it("throws with the API's description when Telegram rejects the text send", async () => {
    mockFetch([
      {
        status: 401,
        body: { ok: false, error_code: 401, description: "Unauthorized" },
      },
    ]);
    const client = new TelegramClient({ botToken: "bad-token", chatId: "1" });

    await expect(client.send({ kind: "text", text: "hello" })).rejects.toThrow(/Unrecognized|Unauthorized/);
  });

  it("throws with the API's description when Telegram rejects the photo send", async () => {
    mockFetch([
      {
        status: 400,
        body: { ok: false, error_code: 400, description: "Bad Request: PHOTO_INVALID_DIMENSIONS" },
      },
    ]);
    const client = new TelegramClient({ botToken: "token", chatId: "1" });

    await expect(
      client.send({ kind: "photo", photo: Buffer.from([0xff, 0xd8]), caption: "In Stock: 1" }),
    ).rejects.toThrow(/PHOTO_INVALID_DIMENSIONS/);
  });

  it("reports the HTTP status when the body is not a Bot API envelope", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response("<html>gateway error</html>", { status: 502 }),
    );
    const client = new TelegramClient({ botToken: "token", chatId: "1" });

    await expect(client.send({ kind: "text", text: "hello" })).rejects.toThrow(/502/);
  });
});