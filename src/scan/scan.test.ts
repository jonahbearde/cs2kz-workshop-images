import { describe, expect, it, vi } from "vitest";
import { makeItem } from "../pipeline/fixtures.js";
import { diffRepo } from "../report/diff.js";
import { renderReport } from "../report/render.js";
import type { WorkshopItem } from "../workshop/types.js";
import { runScan } from "./scan.js";
import type { ScanDeps } from "./scan.js";

function deps(overrides: Partial<ScanDeps> & { items?: WorkshopItem[]; repoMaps?: string[] } = {}): {
  deps: ScanDeps;
  sent: string[];
  rebuiltWith: Array<Map<string, WorkshopItem>>;
} {
  const sent: string[] = [];
  const rebuiltWith: Array<Map<string, WorkshopItem>> = [];
  const items = overrides.items ?? [];
  const repoMaps = overrides.repoMaps ?? [];
  return {
    deps: {
      enumerate: overrides.enumerate ?? (async () => items),
      listRepoMaps: overrides.listRepoMaps ?? (async () => repoMaps),
      rebuildIndex:
        overrides.rebuildIndex ??
        (async (winners) => {
          rebuiltWith.push(winners);
          return { outcome: "unchanged", mapCount: repoMaps.length };
        }),
      send: overrides.send ?? (async (text) => void sent.push(text)),
    },
    sent,
    rebuiltWith,
  };
}

describe("runScan", () => {
  it("sends the rendered report for the diff, in order", async () => {
    const items = [
      makeItem({ id: "1", title: "kz_have" }),
      makeItem({ id: "2", title: "kz_miss" }),
      makeItem({ id: "3", title: "kz_none", previewUrl: "" }),
    ];
    const { deps: scanDeps, sent, rebuiltWith } = deps({ items, repoMaps: ["kz_have"] });

    const result = await runScan(scanDeps);

    expect(sent).toEqual(
      renderReport(
        diffRepo(
          new Map([
            ["kz_have", items[0]!],
            ["kz_miss", items[1]!],
            ["kz_none", items[2]!],
          ]),
          ["kz_have"],
        ),
      ),
    );
    expect(result.messages).toEqual(sent);
    expect(rebuiltWith).toHaveLength(1);
    expect([...rebuiltWith[0]!.keys()].sort()).toEqual(["kz_have", "kz_miss", "kz_none"]);
  });

  it("sends multi-message reports in order, one send per message", async () => {
    // 300 missing maps force the renderer to split across Telegram's limit.
    const items = Array.from({ length: 300 }, (_, i) =>
      makeItem({ id: String(1000 + i), title: `kz_synthetic_map_number_${i}` }),
    );
    const sendOrder: string[] = [];
    const { deps: scanDeps } = deps({
      items,
      send: async (text) => void sendOrder.push(text),
    });

    await runScan(scanDeps);

    expect(sendOrder.length).toBeGreaterThan(1);
    expect(sendOrder).toEqual(renderReport(diffRepo(new Map(items.map((i) => [i.title, i])), [])));
  });

  it("still sends the full report when nothing changed since yesterday", async () => {
    const items = [makeItem({ id: "1", title: "kz_have" })];
    const { deps: scanDeps, sent } = deps({ items, repoMaps: ["kz_have"] });

    await runScan(scanDeps);

    expect(sent).toEqual(["✅ 1 | ⬆️ 0 | 🚫 0"]);
  });

  it("sends a failure notification naming the cause when enumeration fails", async () => {
    const { deps: scanDeps, sent } = deps({
      enumerate: async () => {
        throw new Error("QueryFiles failed with HTTP 403");
      },
    });

    await expect(runScan(scanDeps)).rejects.toThrow("QueryFiles failed with HTTP 403");
    expect(sent).toEqual(["❌ Scan failed: QueryFiles failed with HTTP 403"]);
  });

  it("sends a failure notification when the index rebuild fails", async () => {
    const { deps: scanDeps, sent } = deps({
      items: [makeItem({ id: "1", title: "kz_a" })],
      rebuildIndex: async () => {
        throw new Error("index.json is not valid JSON; refusing to rebuild over it");
      },
    });

    await expect(runScan(scanDeps)).rejects.toThrow(/not valid JSON/);
    expect(sent).toEqual(["❌ Scan failed: index.json is not valid JSON; refusing to rebuild over it"]);
  });

  it("keeps the original error when the failure notification itself cannot be sent", async () => {
    const send = vi
      .fn(async (text: string) => {
        if (text.startsWith("❌")) throw new Error("Telegram sendMessage failed: Unauthorized");
      });
    const { deps: scanDeps } = deps({
      enumerate: async () => {
        throw new Error("boom");
      },
      send,
    });

    await expect(runScan(scanDeps)).rejects.toThrow("boom");
  });
});
