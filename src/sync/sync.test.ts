import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { makeItem } from "../pipeline/fixtures.js";
import type { WorkshopIndex } from "../pipeline/indexer.js";
import type { ReportMessage } from "../report/message.js";
import type { WorkshopItem } from "../workshop/types.js";
import { runSync, type SyncDeps } from "./sync.js";

const defaultIndex: WorkshopIndex = {};

/** A tiny valid JPEG so the capture collage can actually be built. */
async function fixtureJpeg(seed = 1): Promise<Buffer> {
  return sharp({
    create: {
      width: 32,
      height: 18,
      channels: 3,
      background: { r: (seed * 29) % 255, g: 100, b: 150 },
    },
  })
    .jpeg()
    .toBuffer();
}

function deps(
  overrides: Partial<SyncDeps> & {
    items?: WorkshopItem[];
    repoMaps?: string[];
    index?: WorkshopIndex;
  } = {},
): {
  deps: SyncDeps;
  sent: ReportMessage[];
  written: string[];
  readImages: string[];
  rebuiltWith: Array<Map<string, WorkshopItem>>;
} {
  const sent: ReportMessage[] = [];
  const written: string[] = [];
  const readImages: string[] = [];
  const rebuiltWith: Array<Map<string, WorkshopItem>> = [];
  const items = overrides.items ?? [];
  const repoMaps = overrides.repoMaps ?? [];
  const index = overrides.index ?? defaultIndex;
  return {
    deps: {
      enumerate: overrides.enumerate ?? (async () => items),
      listRepoMaps: overrides.listRepoMaps ?? (async () => repoMaps),
      readIndex: overrides.readIndex ?? (async () => index),
      rebuildIndex:
        overrides.rebuildIndex ??
        (async (winners) => {
          rebuiltWith.push(winners);
          return { outcome: "unchanged", mapCount: repoMaps.length };
        }),
      download: overrides.download ?? (async () => fixtureJpeg()),
      write:
        overrides.write ??
        (async (name) => {
          written.push(name);
        }),
      readImage:
        overrides.readImage === undefined
          ? (async (name) => {
              readImages.push(name);
              return fixtureJpeg(3);
            })
          : (async (name) => {
              readImages.push(name);
              return overrides.readImage!(name);
            }),
      send: overrides.send ?? (async (message) => void sent.push(message)),
      sleep: overrides.sleep ?? (async () => {}),
    },
    sent,
    written,
    readImages,
    rebuiltWith,
  };
}

function textOf(message: ReportMessage): string {
  return message.kind === "photo" ? message.caption : message.text;
}

describe("runSync", () => {
  it("delivers exactly one message, after downloads, carrying per-map marks and the collage", async () => {
    const index: WorkshopIndex = {
      kz_stale: { id: "2", previewUrl: "https://ugc.example/old.jpg/", timeUpdated: 1 },
      kz_have: { id: "1", previewUrl: "https://ugc.example/have.jpg/", timeUpdated: 1 },
    };
    const items = [
      makeItem({ id: "1", title: "kz_have", previewUrl: "https://ugc.example/have.jpg/" }),
      makeItem({ id: "2", title: "kz_stale", previewUrl: "https://ugc.example/new.jpg/" }),
      makeItem({ id: "3", title: "kz_miss" }),
      makeItem({ id: "4", title: "kz_none", previewUrl: "" }),
    ];
    const events: string[] = [];
    const { deps: syncDeps, written, readImages } = deps({
      items,
      repoMaps: ["kz_have", "kz_stale"],
      index,
      send: async (message) => void events.push(`send:${message.kind}`),
      download: async (url) => {
        events.push(`download:${url}`);
        return fixtureJpeg();
      },
      readImage: async (name) => {
        events.push(`read:${name}`);
        return fixtureJpeg(3);
      },
    });

    const result = await runSync(syncDeps);

    // the Stale snapshot is read before any download overwrites it, and the
    // single report is sent only after every download completed
    expect(events).toEqual([
      "read:kz_stale",
      "download:https://steamusercontent-a.akamaihd.net/ugc/3/abc.jpg/",
      "download:https://ugc.example/new.jpg/",
      "send:photo",
    ]);
    expect(events.filter((event) => event.startsWith("send"))).toEqual(["send:photo"]);
    expect(readImages).toEqual(["kz_stale"]);
    expect(written.sort()).toEqual(["kz_miss", "kz_stale"]);
    expect(result.outcome.downloaded).toEqual(["kz_miss"]);
    expect(result.outcome.updated).toEqual(["kz_stale"]);
    expect(result.outcome.failures).toEqual([]);
    expect(result.telegramFailed).toBe(false);
    expect(result.message.kind).toBe("photo");

    const caption = textOf(result.message);
    expect(caption).toBe(
      [
        "In Stock: 1",
        "",
        "New (1):",
        '<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3">kz_miss</a> ✓',
        "",
        "Updated (1):",
        '<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=2">kz_stale</a> ✓',
        "",
        "No preview (1):",
        '<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=4">kz_none</a>',
      ].join("\n"),
    );
  });

  it("marks failed downloads ✗, stores nothing for them, and keeps them off the collage", async () => {
    const items = [
      makeItem({ id: "1", title: "kz_bad", previewUrl: "https://ugc.example/bad.jpg/" }),
      makeItem({ id: "2", title: "kz_good", previewUrl: "https://ugc.example/good.jpg/" }),
    ];
    const { deps: syncDeps, written, sent } = deps({
      items,
      download: async (url) => {
        if (url.includes("bad")) throw new Error("HTTP 500 from https://ugc.example/bad.jpg/");
        return fixtureJpeg();
      },
    });

    const result = await runSync(syncDeps);

    expect(result.outcome.downloaded).toEqual(["kz_good"]);
    expect(result.outcome.failures).toEqual([
      { name: "kz_bad", reason: "HTTP 500 from https://ugc.example/bad.jpg/" },
    ]);
    expect(written).toEqual(["kz_good"]);
    expect(result.message.kind).toBe("photo");
    const caption = textOf(result.message);
    expect(caption).toContain("New (2):");
    expect(caption).toContain("kz_bad</a> ✗");
    expect(caption).toContain("kz_good</a> ✓");
    expect(sent).toHaveLength(1);
  });

  it("detects staleness against the index read BEFORE the rebuild, and rebuilds after the downloads", async () => {
    const index: WorkshopIndex = {
      kz_a: { id: "1", previewUrl: "https://ugc.example/old.jpg/", timeUpdated: 1 },
    };
    const callOrder: string[] = [];
    const { deps: syncDeps, rebuiltWith } = deps({
      items: [makeItem({ id: "1", title: "kz_a", previewUrl: "https://ugc.example/new.jpg/" })],
      repoMaps: ["kz_a"],
      index,
      readIndex: async () => {
        callOrder.push("readIndex");
        return index;
      },
      readImage: async () => {
        callOrder.push("readImage");
        return fixtureJpeg(3);
      },
      download: async () => {
        callOrder.push("download");
        return fixtureJpeg();
      },
      rebuildIndex: async (winners) => {
        callOrder.push("rebuildIndex");
        rebuiltWith.push(winners);
        return { outcome: "updated", mapCount: 1 };
      },
    });

    const result = await runSync(syncDeps);

    expect(callOrder).toEqual(["readIndex", "readImage", "download", "rebuildIndex"]);
    expect(result.outcome.updated).toEqual(["kz_a"]);
    expect(result.index).toEqual({ outcome: "updated", mapCount: 1 });
  });

  it("sends an empty run's stock count exactly once, as a plain text message", async () => {
    const items = [makeItem({ id: "1", title: "kz_have" })];
    const { deps: syncDeps, sent } = deps({ items, repoMaps: ["kz_have"] });

    const result = await runSync(syncDeps);

    expect(sent).toEqual([{ kind: "text", text: "In Stock: 1" }]);
    expect(result.message).toEqual({ kind: "text", text: "In Stock: 1" });
    expect(result.outcome).toEqual({ downloaded: [], updated: [], failures: [] });
    expect(result.telegramFailed).toBe(false);
  });

  it("caps the collage and name list at 8 with an exact …and K more tail", async () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ id: String(100 + i), title: `kz_map_${i}` }),
    );
    const { deps: syncDeps, sent } = deps({ items });

    const result = await runSync(syncDeps);

    expect(result.outcome.downloaded).toHaveLength(10);
    expect(result.outcome.updated).toEqual([]);
    expect(result.message.kind).toBe("photo");
    const caption = textOf(result.message);
    expect(caption).toContain("New (10):");
    expect((caption.match(/ ✓/g) ?? []).length).toBe(8);
    expect(caption).toContain("…and 2 more");
    expect(caption).not.toContain("kz_map_9");
    expect(sent).toHaveLength(1);
  });

  it("still stores and reports a stale map whose old-half snapshot cannot be read", async () => {
    const index: WorkshopIndex = {
      kz_stale: { id: "2", previewUrl: "https://ugc.example/old.jpg/", timeUpdated: 1 },
    };
    const items = [
      makeItem({ id: "2", title: "kz_stale", previewUrl: "https://ugc.example/new.jpg/" }),
    ];
    const { deps: syncDeps, written } = deps({
      items,
      repoMaps: ["kz_stale"],
      index,
      readImage: async () => {
        throw new Error("EIO: i/o error");
      },
    });

    const result = await runSync(syncDeps);

    // the unreadable old half never aborts the run or the download
    expect(written).toEqual(["kz_stale"]);
    expect(result.outcome.updated).toEqual(["kz_stale"]);
    expect(result.message.kind).toBe("photo");
    expect(textOf(result.message)).toContain("kz_stale</a> ✓");
    // the fallback tile is a single thumbnail of the fresh preview
    if (result.message.kind === "photo") {
      const meta = await sharp(result.message.photo).metadata();
      expect(meta.width).toBeLessThan(400);
    }
  });

  it("keeps the store work done when Telegram fails, flags the run red, and sends no extra notification", async () => {
    const items = [makeItem({ id: "1", title: "kz_miss" })];
    const send = vi.fn(async () => {
      throw new Error("Telegram sendPhoto failed: Bad Request");
    });
    const { deps: syncDeps, written, rebuiltWith } = deps({ items, send });

    const result = await runSync(syncDeps);

    expect(written).toEqual(["kz_miss"]);
    expect(rebuiltWith).toHaveLength(1);
    expect(result.telegramFailed).toBe(true);
    expect(result.outcome.downloaded).toEqual(["kz_miss"]);
    // the failure notification belongs to fatal stages only; a failed send
    // is reported through the exit status instead
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends a failure notification without an icon when enumeration fails", async () => {
    const { deps: syncDeps, sent } = deps({
      enumerate: async () => {
        throw new Error("QueryFiles failed with HTTP 403");
      },
    });

    await expect(runSync(syncDeps)).rejects.toThrow("QueryFiles failed with HTTP 403");
    expect(sent).toEqual([{ kind: "text", text: "Sync failed: QueryFiles failed with HTTP 403" }]);
  });

  it("sends a failure notification when a download-phase dependency fails hard", async () => {
    const { deps: syncDeps, sent } = deps({
      items: [makeItem({ id: "1", title: "kz_a" })],
      rebuildIndex: async () => {
        throw new Error("index.json is not valid JSON; refusing to rebuild over it");
      },
    });

    await expect(runSync(syncDeps)).rejects.toThrow(/not valid JSON/);
    expect(sent).toHaveLength(2);
    expect(textOf(sent[0]!)).toContain("kz_a</a> ✓");
    expect(sent[1]).toEqual({
      kind: "text",
      text: "Sync failed: index.json is not valid JSON; refusing to rebuild over it",
    });
  });

  it("keeps the original error when the failure notification itself cannot be sent", async () => {
    const send = vi.fn(async () => {
      throw new Error("Telegram sendMessage failed: Unauthorized");
    });
    const { deps: syncDeps } = deps({
      enumerate: async () => {
        throw new Error("boom");
      },
      send,
    });

    await expect(runSync(syncDeps)).rejects.toThrow("boom");
  });
});