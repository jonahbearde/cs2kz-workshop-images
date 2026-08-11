import { describe, expect, it } from "vitest";
import { makeItem } from "../pipeline/fixtures.js";
import type { WorkshopIndex } from "../pipeline/indexer.js";
import { diffRepo } from "./diff.js";
import { TELEGRAM_MESSAGE_LIMIT, renderReport, renderResult, splitIntoMessages } from "./render.js";
import type { ScanDiff } from "./diff.js";
import type { SyncOutcome } from "./outcome.js";

const emptyDiff: ScanDiff = { have: [], missing: [], stale: [], noPreview: [] };

describe("renderReport", () => {
  it("renders a counts header even for an empty diff", () => {
    expect(renderReport(emptyDiff)).toEqual(["✅ 0 | ⬇️ 0 | 🔄 0 | 🚫 0"]);
  });

  it("shows all four counts in the header", () => {
    const index: WorkshopIndex = {
      kz_stale: { id: "8", previewUrl: "https://ugc.example/old.jpg/", timeUpdated: 1 },
    };
    const diff = diffRepo(
      new Map([
        ["kz_have", makeItem({ title: "kz_have" })],
        ["kz_miss", makeItem({ id: "7", title: "kz_miss" })],
        ["kz_stale", makeItem({ id: "8", title: "kz_stale", previewUrl: "https://ugc.example/new.jpg/" })],
        ["kz_none", makeItem({ title: "kz_none", previewUrl: "" })],
      ]),
      ["kz_have", "kz_stale"],
      index,
    );
    const [message] = renderReport(diff);
    expect(message!.split("\n")[0]).toBe("✅ 1 | ⬇️ 1 | 🔄 1 | 🚫 1");
  });

  it("pairs every missing map with its Workshop page link", () => {
    const diff = diffRepo(
      new Map([
        ["kz_b", makeItem({ id: "20", title: "kz_b" })],
        ["kz_a", makeItem({ id: "10", title: "kz_a" })],
      ]),
      [],
    );
    const [message] = renderReport(diff);
    expect(message).toContain("⬇️ Missing:");
    expect(message).toContain("kz_a: https://steamcommunity.com/sharedfiles/filedetails/?id=10");
    expect(message).toContain("kz_b: https://steamcommunity.com/sharedfiles/filedetails/?id=20");
    // sorted by map name
    expect(message!.indexOf("kz_a:")).toBeLessThan(message!.indexOf("kz_b:"));
  });

  it("lists no-preview maps in their own labelled section", () => {
    const diff = diffRepo(
      new Map([
        ["kz_gone", makeItem({ title: "kz_gone", previewUrl: "" })],
        ["kz_miss", makeItem({ id: "5", title: "kz_miss" })],
      ]),
      [],
    );
    const [message] = renderReport(diff);
    const noPreviewIndex = message!.indexOf("🚫 No preview:");
    expect(noPreviewIndex).toBeGreaterThan(-1);
    expect(message!.slice(noPreviewIndex)).toContain("kz_gone");
    // the no-preview section must not carry a Workshop link
    expect(message!.slice(noPreviewIndex)).not.toContain("steamcommunity.com");
  });

  it("pairs every stale map with its Workshop page link, in its own section", () => {
    const index: WorkshopIndex = {
      kz_b: { id: "20", previewUrl: "https://ugc.example/b-old.jpg/", timeUpdated: 1 },
      kz_a: { id: "10", previewUrl: "https://ugc.example/a-old.jpg/", timeUpdated: 1 },
    };
    const diff = diffRepo(
      new Map([
        ["kz_b", makeItem({ id: "20", title: "kz_b", previewUrl: "https://ugc.example/b-new.jpg/" })],
        ["kz_a", makeItem({ id: "10", title: "kz_a", previewUrl: "https://ugc.example/a-new.jpg/" })],
      ]),
      ["kz_a", "kz_b"],
      index,
    );
    const [message] = renderReport(diff);
    const staleIndex = message!.indexOf("🔄 Stale:");
    expect(staleIndex).toBeGreaterThan(-1);
    const staleSection = message!.slice(staleIndex);
    expect(staleSection).toContain("kz_a: https://steamcommunity.com/sharedfiles/filedetails/?id=10");
    expect(staleSection).toContain("kz_b: https://steamcommunity.com/sharedfiles/filedetails/?id=20");
    // sorted by map name
    expect(staleSection.indexOf("kz_a:")).toBeLessThan(staleSection.indexOf("kz_b:"));
  });

  it("omits sections that have nothing to report", () => {
    const diff = diffRepo(new Map([["kz_have", makeItem({ title: "kz_have" })]]), ["kz_have"]);
    const [message] = renderReport(diff);
    expect(message).not.toContain("⬇️ Missing:");
    expect(message).not.toContain("🔄 Stale:");
    expect(message).not.toContain("🚫 No preview:");
  });

  it("renders a small report as a single message", () => {
    const diff = diffRepo(
      new Map([
        ["kz_have", makeItem({ title: "kz_have" })],
        ["kz_miss", makeItem({ id: "9", title: "kz_miss" })],
      ]),
      ["kz_have"],
    );
    const messages = renderReport(diff);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toBe(
      [
        "✅ 1 | ⬇️ 1 | 🔄 0 | 🚫 0",
        "",
        "⬇️ Missing:",
        "kz_miss: https://steamcommunity.com/sharedfiles/filedetails/?id=9",
      ].join("\n"),
    );
  });

  it("splits a large report into multiple messages, each within the limit", () => {
    // Synthetic large corpus: 300 missing maps, ~100 chars per line -> ~30 kB.
    const winners = new Map(
      Array.from({ length: 300 }, (_, i) => {
        const item = makeItem({ id: String(1000 + i), title: `kz_synthetic_map_number_${i}` });
        return [item.title, item] as const;
      }),
    );
    const messages = renderReport(diffRepo(winners, []));
    expect(messages.length).toBeGreaterThan(1);
    for (const message of messages) {
      expect(message.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
      expect(message.length).toBeGreaterThan(0);
    }
    // The header rides in the first message.
    expect(messages[0]!.split("\n")[0]).toBe("✅ 0 | ⬇️ 300 | 🔄 0 | 🚫 0");
  });
});

describe("renderResult", () => {
  it("says nothing to do when every bucket is empty", () => {
    expect(renderResult({ downloaded: [], updated: [], failures: [] })).toEqual(["✅ Nothing to do."]);
  });

  it("renders counts, then one section per non-empty bucket", () => {
    const messages = renderResult({
      downloaded: ["kz_a", "kz_b"],
      updated: ["kz_c"],
      failures: [{ name: "kz_d", reason: "HTTP 503 from https://ugc.example/d.jpg/" }],
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toBe(
      [
        "⬇️ 2 | 🔄 1 | ❌ 1",
        "",
        "⬇️ Downloaded:",
        "kz_a",
        "kz_b",
        "",
        "🔄 Updated:",
        "kz_c",
        "",
        "❌ Failed:",
        "kz_d: HTTP 503 from https://ugc.example/d.jpg/",
      ].join("\n"),
    );
  });

  it("omits empty buckets", () => {
    const [message] = renderResult({ downloaded: ["kz_a"], updated: [], failures: [] });
    expect(message).toBe(["⬇️ 1 | 🔄 0 | ❌ 0", "", "⬇️ Downloaded:", "kz_a"].join("\n"));
  });

  it("splits long results on line boundaries, each message within the limit", () => {
    const outcome: SyncOutcome = {
      downloaded: Array.from({ length: 300 }, (_, i) => `kz_synthetic_map_number_${i}`),
      updated: [],
      failures: [],
    };
    const messages = renderResult(outcome);
    expect(messages.length).toBeGreaterThan(1);
    for (const message of messages) {
      expect(message.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
    }
    expect(messages[0]!.split("\n")[0]).toBe("⬇️ 300 | 🔄 0 | ❌ 0");
  });
});

describe("splitIntoMessages", () => {
  it("keeps short content as one message", () => {
    expect(splitIntoMessages(["a", "b"])).toEqual(["a\nb"]);
  });

  it("splits on line boundaries and preserves every line in order", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line-${i}-`.padEnd(100, "x"));
    const messages = splitIntoMessages(lines, 500);
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.flatMap((message) => message.split("\n"))).toEqual(lines);
    for (const message of messages) {
      expect(message.length).toBeLessThanOrEqual(500);
    }
  });

  it("refuses to emit a message over the limit when a single line is too long", () => {
    expect(() => splitIntoMessages(["x".repeat(4097)], 4096)).toThrow(/longer than/);
  });
});
