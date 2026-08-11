import { describe, expect, it, vi } from "vitest";
import { makeItem } from "../pipeline/fixtures.js";
import type { WorkshopIndex } from "../pipeline/indexer.js";
import { renderReport } from "../report/render.js";
import { diffRepo } from "../report/diff.js";
import type { WorkshopItem } from "../workshop/types.js";
import { runSync, type SyncDeps } from "./sync.js";

const defaultIndex: WorkshopIndex = {};

function deps(
  overrides: Partial<SyncDeps> & {
    items?: WorkshopItem[];
    repoMaps?: string[];
    index?: WorkshopIndex;
  } = {},
): {
  deps: SyncDeps;
  sent: string[];
  written: string[];
  rebuiltWith: Array<Map<string, WorkshopItem>>;
} {
  const sent: string[] = [];
  const written: string[] = [];
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
      download: overrides.download ?? (async (url) => Buffer.from(`jpeg:${url}`)),
      write:
        overrides.write ??
        (async (name) => {
          written.push(name);
        }),
      send: overrides.send ?? (async (text) => void sent.push(text)),
      sleep: overrides.sleep ?? (async () => {}),
    },
    sent,
    written,
    rebuiltWith,
  };
}

describe("runSync", () => {
  it("sends the report first, downloads missing and stale maps, then sends the result", async () => {
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
    const { deps: syncDeps, written } = deps({
      items,
      repoMaps: ["kz_have", "kz_stale"],
      index,
      send: async (text) => void events.push(`send:${text.split("\n")[0]}`),
      download: async (url) => {
        events.push(`download:${url}`);
        return Buffer.from(url);
      },
    });

    const result = await runSync(syncDeps);

    // report sent before any download; result after all of them
    expect(events[0]).toBe("send:✅ 1 | ⬇️ 1 | 🔄 1 | 🚫 1");
    expect(events.filter((e) => e.startsWith("download:"))).toEqual([
      "download:https://steamusercontent-a.akamaihd.net/ugc/3/abc.jpg/",
      "download:https://ugc.example/new.jpg/",
    ]);
    expect(events[events.length - 1]).toBe("send:⬇️ 1 | 🔄 1 | ❌ 0");
    expect(written.sort()).toEqual(["kz_miss", "kz_stale"]);
    expect(result.outcome.downloaded).toEqual(["kz_miss"]);
    expect(result.outcome.updated).toEqual(["kz_stale"]);
    expect(result.outcome.failures).toEqual([]);
    expect(result.telegramFailed).toBe(false);
    expect(result.report).toEqual(
      renderReport(
        diffRepo(
          new Map(items.map((item) => [item.title, item])),
          ["kz_have", "kz_stale"],
          index,
        ),
      ),
    );
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
      download: async () => {
        callOrder.push("download");
        return Buffer.from("jpeg");
      },
      rebuildIndex: async (winners) => {
        callOrder.push("rebuildIndex");
        rebuiltWith.push(winners);
        return { outcome: "updated", mapCount: 1 };
      },
    });

    const result = await runSync(syncDeps);

    expect(callOrder).toEqual(["readIndex", "download", "rebuildIndex"]);
    expect(result.outcome.updated).toEqual(["kz_a"]);
    expect(result.index).toEqual({ outcome: "updated", mapCount: 1 });
  });

  it("always sends the report and the result, even when there is nothing to do", async () => {
    const items = [makeItem({ id: "1", title: "kz_have" })];
    const { deps: syncDeps, sent } = deps({ items, repoMaps: ["kz_have"] });

    const result = await runSync(syncDeps);

    expect(sent).toEqual(["✅ 1 | ⬇️ 0 | 🔄 0 | 🚫 0", "✅ Nothing to do."]);
    expect(result.outcome).toEqual({ downloaded: [], updated: [], failures: [] });
  });

  it("keeps downloading when the report cannot be sent, and flags telegramFailed", async () => {
    const items = [makeItem({ id: "1", title: "kz_miss" })];
    const send = vi.fn(async (text: string) => {
      if (text.startsWith("✅")) throw new Error("Telegram sendMessage failed: Unauthorized");
    });
    const { deps: syncDeps, written } = deps({ items, send });

    const result = await runSync(syncDeps);

    expect(written).toEqual(["kz_miss"]);
    expect(result.telegramFailed).toBe(true);
    // the result message was still attempted
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("flags telegramFailed when the result message cannot be sent", async () => {
    const items = [makeItem({ id: "1", title: "kz_miss" })];
    const send = vi.fn(async (text: string) => {
      if (text.startsWith("⬇️")) throw new Error("Telegram sendMessage failed: Bad Request");
    });
    const { deps: syncDeps } = deps({ items, send });

    const result = await runSync(syncDeps);

    expect(result.telegramFailed).toBe(true);
    expect(result.outcome.downloaded).toEqual(["kz_miss"]);
  });

  it("collects download failures without aborting, and reports them in the result message", async () => {
    const items = [
      makeItem({ id: "1", title: "kz_bad", previewUrl: "https://ugc.example/bad.jpg/" }),
      makeItem({ id: "2", title: "kz_good", previewUrl: "https://ugc.example/good.jpg/" }),
    ];
    const { deps: syncDeps, sent } = deps({
      items,
      download: async (url) => {
        if (url.includes("bad")) throw new Error("HTTP 500 from https://ugc.example/bad.jpg/");
        return Buffer.from(url);
      },
    });

    const result = await runSync(syncDeps);

    expect(result.outcome.downloaded).toEqual(["kz_good"]);
    expect(result.outcome.failures).toEqual([
      { name: "kz_bad", reason: "HTTP 500 from https://ugc.example/bad.jpg/" },
    ]);
    expect(sent[sent.length - 1]).toContain("kz_bad: HTTP 500 from https://ugc.example/bad.jpg/");
  });

  it("sends a failure notification naming the cause when enumeration fails", async () => {
    const { deps: syncDeps, sent } = deps({
      enumerate: async () => {
        throw new Error("QueryFiles failed with HTTP 403");
      },
    });

    await expect(runSync(syncDeps)).rejects.toThrow("QueryFiles failed with HTTP 403");
    expect(sent).toEqual(["❌ Sync failed: QueryFiles failed with HTTP 403"]);
  });

  it("sends a failure notification when a download-phase dependency fails hard", async () => {
    const { deps: syncDeps, sent } = deps({
      items: [makeItem({ id: "1", title: "kz_a" })],
      rebuildIndex: async () => {
        throw new Error("index.json is not valid JSON; refusing to rebuild over it");
      },
    });

    await expect(runSync(syncDeps)).rejects.toThrow(/not valid JSON/);
    expect(sent).toEqual([
      ["✅ 0 | ⬇️ 1 | 🔄 0 | 🚫 0", "", "⬇️ Missing:", "kz_a: https://steamcommunity.com/sharedfiles/filedetails/?id=1"].join("\n"),
      ["⬇️ 1 | 🔄 0 | ❌ 0", "", "⬇️ Downloaded:", "kz_a"].join("\n"),
      "❌ Sync failed: index.json is not valid JSON; refusing to rebuild over it",
    ]);
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
