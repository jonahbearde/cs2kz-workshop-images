import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkshopClient } from "./client.js";

interface MockPage {
  details: Record<string, unknown>[];
  nextCursor?: string;
}

/** Builds a `fetch` stub that replays the given pages in order; returns the request URLs. */
function mockFetch(pages: MockPage[]): string[] {
  const urls: string[] = [];
  let call = 0;
  const stub = async (input: string | URL | Request): Promise<Response> => {
    urls.push(String(input));
    const page = pages[call++];
    if (!page) throw new Error("more QueryFiles calls than mocked pages");
    return Response.json({
      response: {
        publishedfiledetails: page.details,
        ...(page.nextCursor !== undefined ? { next_cursor: page.nextCursor } : {}),
      },
    });
  };
  vi.stubGlobal("fetch", stub);
  return urls;
}

function detail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    publishedfileid: "1",
    title: "kz_a",
    tags: [{ tag: "Cs2" }],
    time_updated: 1_700_000_000,
    preview_url: "https://example.com/p.jpg",
    result: 1,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorkshopClient.enumerate", () => {
  it("queries with search_text=kz, appid=730 and the initial cursor", async () => {
    const urls = mockFetch([{ details: [detail()] }]);
    const client = new WorkshopClient({ apiKey: "test-key" });

    await client.enumerate();

    const url = new URL(urls[0]!);
    expect(url.origin + url.pathname).toBe(
      "https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/",
    );
    expect(url.searchParams.get("search_text")).toBe("kz");
    expect(url.searchParams.get("appid")).toBe("730");
    expect(url.searchParams.get("cursor")).toBe("*");
    expect(url.searchParams.get("key")).toBe("test-key");
  });

  it("follows next_cursor until an empty page ends the pass", async () => {
    const urls = mockFetch([
      { details: [detail({ publishedfileid: "1", title: "kz_a" })], nextCursor: "c1" },
      { details: [detail({ publishedfileid: "2", title: "kz_b" })], nextCursor: "c2" },
      { details: [], nextCursor: "c3" },
    ]);
    const client = new WorkshopClient({ apiKey: "test-key" });

    const items = await client.enumerate();

    expect(items.map((i) => i.title)).toEqual(["kz_a", "kz_b"]);
    expect(urls.map((u) => new URL(u).searchParams.get("cursor"))).toEqual(["*", "c1", "c2"]);
  });

  it("stops as soon as a reply carries no next_cursor", async () => {
    const urls = mockFetch([
      { details: [detail({ publishedfileid: "1", title: "kz_a" })] },
      { details: [detail({ publishedfileid: "2", title: "kz_b" })] },
    ]);
    const client = new WorkshopClient({ apiKey: "test-key" });

    const items = await client.enumerate();

    expect(items.map((i) => i.title)).toEqual(["kz_a"]);
    expect(urls).toHaveLength(1);
  });

  it("drops partial records whose result is not EResult.OK", async () => {
    mockFetch([
      {
        details: [
          detail({ publishedfileid: "1", title: "kz_a" }),
          detail({ publishedfileid: "2", result: 9 }),
        ],
      },
    ]);
    const client = new WorkshopClient({ apiKey: "test-key" });

    const items = await client.enumerate();

    expect(items.map((i) => i.title)).toEqual(["kz_a"]);
  });

  it("reports progress after every page", async () => {
    mockFetch([
      { details: [detail({ publishedfileid: "1" }), detail({ publishedfileid: "2" })], nextCursor: "c1" },
      { details: [detail({ publishedfileid: "3" })] },
    ]);
    const progress: number[] = [];
    const client = new WorkshopClient({ apiKey: "test-key", onProgress: (n) => progress.push(n) });

    await client.enumerate();

    expect(progress).toEqual([2, 3]);
  });
});
