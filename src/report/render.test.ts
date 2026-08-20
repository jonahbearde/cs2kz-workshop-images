import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { COLLAGE_TILE_CAP, type CollageTile } from "./collage.js";
import type { MissingMap, ScanDiff } from "./diff.js";
import {
  escapeHtml,
  linkFor,
  renderScanReport,
  renderSyncReport,
  splitIntoMessages,
  TELEGRAM_CAPTION_LIMIT,
  TELEGRAM_MESSAGE_LIMIT,
} from "./render.js";

const emptyDiff: ScanDiff = { have: [], missing: [], stale: [], noPreview: [] };

function section(
  names: string[],
  kind: "missing" | "stale" | "noPreview",
): MissingMap[] {
  const base = kind === "missing" ? 1000 : kind === "stale" ? 2000 : 3000;
  return names.map((name, i) => ({
    name,
    workshopUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${base + i}`,
  }));
}

function diffOf(options: {
  have?: string[];
  missing?: string[];
  stale?: string[];
  noPreview?: string[];
} = {}): ScanDiff {
  return {
    have: options.have ?? [],
    missing: section(options.missing ?? [], "missing"),
    stale: section(options.stale ?? [], "stale"),
    noPreview: section(options.noPreview ?? [], "noPreview"),
  };
}

/** A tiny valid JPEG fixture; the seed just varies the colour. */
async function jpeg(seed: number): Promise<Buffer> {
  return sharp({
    create: {
      width: 48,
      height: 27,
      channels: 3,
      background: { r: (seed * 13) % 255, g: 80, b: 140 },
    },
  })
    .jpeg()
    .toBuffer();
}

async function makeTiles(names: string[], kind: "new" | "updated"): Promise<CollageTile[]> {
  const tiles: CollageTile[] = [];
  for (const [i, name] of names.entries()) {
    const image = await jpeg(i + 1);
    tiles.push(
      kind === "new"
        ? { name, kind, images: [image] }
        : { name, kind, images: [await jpeg(i + 40), image] },
    );
  }
  return tiles;
}

function textOf(message: Awaited<ReturnType<typeof renderSyncReport>>): string {
  return message.kind === "photo" ? message.caption : message.text;
}

describe("renderScanReport", () => {
  it("renders the stock header even for an empty diff", () => {
    expect(renderScanReport(emptyDiff)).toEqual(["In Stock: 0"]);
  });

  it("links every map name and keeps the section order In Stock → New → Updated → No preview", () => {
    const diff = diffOf({
      have: ["kz_have_a", "kz_have_b"],
      missing: ["kz_new"],
      stale: ["kz_changed"],
      noPreview: ["kz_nopic"],
    });
    const [message] = renderScanReport(diff);
    expect(message).toBe(
      [
        "In Stock: 2",
        "",
        "New (1):",
        '<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=1000">kz_new</a>',
        "",
        "Updated (1):",
        '<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=2000">kz_changed</a>',
        "",
        "No preview (1):",
        '<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3000">kz_nopic</a>',
      ].join("\n"),
    );
  });

  it("omits sections that have nothing to report", () => {
    const [message] = renderScanReport(diffOf({ have: ["kz_have"] }));
    expect(message).toBe("In Stock: 1");
  });

  it("never carries marks: the Scan never downloads", () => {
    const [message] = renderScanReport(
      diffOf({ have: ["kz_have"], missing: ["kz_new"] }),
    );
    expect(message).not.toContain("✓");
    expect(message).not.toContain("✗");
  });

  it("escapes & < > in names and hrefs", () => {
    expect(escapeHtml('a&b<c>d"')).toBe('a&amp;b&lt;c&gt;d"');
    expect(linkFor({ name: "kz_a<b>&", workshopUrl: "https://x.test/?id=1&z=2" })).toBe(
      '<a href="https://x.test/?id=1&amp;z=2">kz_a&lt;b&gt;&amp;</a>',
    );
  });

  it("splits a large report into multiple messages, each within the limit", () => {
    const winners300 = section(
      Array.from({ length: 300 }, (_, i) => `kz_synthetic_map_number_${i}`),
      "missing",
    );
    const messages = renderScanReport({ ...emptyDiff, missing: winners300 });
    expect(messages.length).toBeGreaterThan(1);
    for (const message of messages) {
      expect(message.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
      expect(message.length).toBeGreaterThan(0);
    }
    expect(messages[0]!.split("\n")[0]).toBe("In Stock: 0");
  });
});

describe("renderSyncReport", () => {
  it("sends a photo message with an HTML caption when tiles exist", async () => {
    const diff = diffOf({ have: ["kz_have"], missing: ["kz_new"] });
    const tiles = await makeTiles(["kz_new"], "new");
    const message = await renderSyncReport({
      diff,
      ok: new Set(["kz_new"]),
      tiles,
    });

    expect(message.kind).toBe("photo");
    if (message.kind !== "photo") return;
    expect(message.caption).toBe(
      [
        "In Stock: 1",
        "",
        "New (1):",
        '<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=1000">kz_new</a> ✓',
      ].join("\n"),
    );
    const meta = await sharp(message.photo).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("marks failed downloads ✗ and successful ones ✓, on the same line", async () => {
    const diff = diffOf({ missing: ["kz_good", "kz_bad"] });
    const tiles = await makeTiles(["kz_good"], "new");
    const message = await renderSyncReport({
      diff,
      ok: new Set(["kz_good"]),
      tiles,
    });

    const caption = textOf(message);
    expect(caption).toContain('<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=1000">kz_good</a> ✓');
    expect(caption).toContain('<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=1001">kz_bad</a> ✗');
    // the failed map has no image: the collage holds a single thumbnail tile
    expect(message.kind).toBe("photo");
    if (message.kind === "photo") {
      const meta = await sharp(message.photo).metadata();
      expect(meta.height).toBeLessThan(400);
    }
  });

  it("degrades to one plain text message when a run produces no images at all", async () => {
    const diff = diffOf({ missing: ["kz_a", "kz_b"] });
    const message = await renderSyncReport({
      diff,
      ok: new Set(),
      tiles: [],
    });

    expect(message).toEqual({
      kind: "text",
      text: [
        "In Stock: 0",
        "",
        "New (2):",
        '<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=1000">kz_a</a> ✗',
        '<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=1001">kz_b</a> ✗',
      ].join("\n"),
    });
  });

  it("sends the stock count alone for an empty run", async () => {
    const message = await renderSyncReport({
      diff: diffOf({ have: ["kz_have"] }),
      ok: new Set(),
      tiles: [],
    });
    expect(message).toEqual({ kind: "text", text: "In Stock: 1" });
  });

  it("never marks In Stock or No-preview lines", async () => {
    const diff = diffOf({
      have: ["kz_have"],
      missing: ["kz_new"],
      noPreview: ["kz_nopic"],
    });
    const tiles = await makeTiles(["kz_new"], "new");
    const caption = textOf(
      await renderSyncReport({ diff, ok: new Set(["kz_new"]), tiles }),
    );

    const noPreviewLine = caption.split("\n").find((l) => l.includes("kz_nopic"))!;
    expect(noPreviewLine).toBe(
      '<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3000">kz_nopic</a>',
    );
    expect(caption.split("\n")[0]).toBe("In Stock: 1");
  });

  it("truncates to the collaged maps with an exact …and K more tail, keeping the counts exact", async () => {
    const names = Array.from({ length: 10 }, (_, i) => `kz_map_${i}`);
    const diff = diffOf({ missing: names });
    const tiles = await makeTiles(names, "new");
    const caption = textOf(
      await renderSyncReport({
        diff,
        ok: new Set(names),
        tiles, // caller already capped? no — pass all 10; renderer caps for both
      }),
    );

    expect(caption).toContain("New (10):");
    expect((caption.match(/ ✓/g) ?? []).length).toBe(COLLAGE_TILE_CAP);
    for (const name of names.slice(0, COLLAGE_TILE_CAP)) {
      expect(caption).toContain(`>${name}</a> ✓`);
    }
    expect(caption).toContain(`…and ${names.length - COLLAGE_TILE_CAP} more`);
    // truncated names never appear
    expect(caption).not.toContain("kz_map_9");
  });

  it("truncates across New and Updated sections alike, stopping at the collaged maps", async () => {
    const missing = Array.from({ length: 5 }, (_, i) => `kz_new_${i}`);
    const stale = Array.from({ length: 5 }, (_, i) => `kz_changed_${i}`);
    const diff = diffOf({ missing, stale });
    // Two failed maps anywhere among the ten; the collaged prefix is the
    // first 8 successes in download order: all five news then three staleds.
    const ok = new Set([...missing, ...stale]);
    const tiles = await makeTiles([...missing, ...stale], "updated");
    const caption = textOf(
      await renderSyncReport({ diff, ok, tiles }),
    );

    expect(caption).toContain("New (5):");
    expect(caption).toContain("Updated (5):");
    expect((caption.match(/ ✓/g) ?? []).length).toBe(COLLAGE_TILE_CAP);
    expect(caption).toContain("kz_changed_2</a> ✓");
    expect(caption).not.toContain("kz_changed_3");
    expect(caption).not.toContain("kz_changed_4");
    expect(caption).toContain(`…and ${10 - COLLAGE_TILE_CAP} more`);
  });

  it("keeps the caption under the 1024-character photo caption limit", async () => {
    const missing = Array.from({ length: 8 }, (_, i) => `kz_map_${i}`);
    const stale = Array.from({ length: 8 }, (_, i) => `kz_changed_${i}`);
    const diff = diffOf({
      have: ["kz_have"],
      missing,
      stale,
      noPreview: ["kz_nopic"],
    });
    const tiles = await makeTiles([...missing, ...stale], "updated");
    const caption = textOf(
      await renderSyncReport({
        diff,
        ok: new Set([...missing, ...stale]),
        tiles,
      }),
    );

    expect(caption.length).toBeLessThanOrEqual(TELEGRAM_CAPTION_LIMIT);
  });

  it("carries no icons anywhere except the ✓/✗ marks", async () => {
    const diff = diffOf({
      have: ["kz_have"],
      missing: ["kz_new"],
      stale: ["kz_changed"],
      noPreview: ["kz_nopic"],
    });
    const tiles = await makeTiles(["kz_new"], "new");
    const caption = textOf(
      await renderSyncReport({
        diff,
        ok: new Set(["kz_new"]),
        tiles,
      }),
    );

    expect(caption).not.toMatch(/[✅⬇️🔄🚫❌➡️😄]/);
    expect(caption).toContain("✓");
    expect(caption).toContain("✗");
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