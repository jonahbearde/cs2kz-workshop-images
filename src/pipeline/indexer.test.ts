import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeItem } from "./fixtures.js";
import { buildIndex, listRepoMaps, parseIndex, rebuildIndexFile, renderIndex } from "./indexer.js";
import { pickWinners } from "./winners.js";

const tempDirs: string[] = [];

async function makeTempImagesDir(files: string[]): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "cs2kz-images-"));
  tempDirs.push(dir);
  for (const file of files) {
    // listRepoMaps only reads names; a dummy buffer is enough.
    await writeFile(path.join(dir, file), Buffer.from([0xff, 0xd8]));
  }
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("listRepoMaps", () => {
  it("returns sorted stems of the .jpg files in the directory", async () => {
    const dir = await makeTempImagesDir(["kz_b.jpg", "kz_a.jpg", "kz_c.jpg"]);
    expect(await listRepoMaps(dir)).toEqual(["kz_a", "kz_b", "kz_c"]);
  });

  it("ignores non-.jpg files", async () => {
    const dir = await makeTempImagesDir(["kz_a.jpg", "kz_b.png", "notes.txt"]);
    expect(await listRepoMaps(dir)).toEqual(["kz_a"]);
  });

  it("includes storable non-kz maps alongside kz maps", async () => {
    const dir = await makeTempImagesDir(["kz_ok.jpg", "de_dust2.jpg"]);
    expect(await listRepoMaps(dir)).toEqual(["de_dust2", "kz_ok"]);
  });

  it("drops .jpg files whose stem is not a storable map name", async () => {
    const dir = await makeTempImagesDir(["kz_ok.jpg", "Bad Name.jpg", "kz_Mixed.jpg", "2fort.jpg"]);
    expect(await listRepoMaps(dir)).toEqual(["kz_ok"]);
  });

  it("returns an empty list when the directory does not exist", async () => {
    expect(await listRepoMaps(path.join(tmpdir(), "no-such-dir-cs2kz"))).toEqual([]);
  });
});

describe("parseIndex", () => {
  it("returns an empty index for undefined or blank input", () => {
    expect(parseIndex(undefined)).toEqual({});
    expect(parseIndex("  \n")).toEqual({});
  });

  it("round-trips a rendered index", () => {
    const index = buildIndex({
      repoMaps: ["kz_a"],
      winners: pickWinners([makeItem({ title: "kz_a", id: "42" })]),
      previous: {},
    });
    expect(parseIndex(renderIndex(index))).toEqual(index);
  });

  it("rejects malformed JSON with a clear error", () => {
    expect(() => parseIndex("{ not json")).toThrow(/index\.json/);
  });

  it("rejects records with the wrong shape", () => {
    expect(() => parseIndex('{"kz_a": {"id": 42}}')).toThrow(/index\.json/);
  });
});

describe("buildIndex", () => {
  it("records the winner's Workshop metadata under the map name", () => {
    const winners = pickWinners([
      makeItem({
        title: "kz_ozark",
        id: "314",
        timeUpdated: 1_710_000_000,
        previewUrl: "https://ugc.example/1/abc.jpg/?imw=512&imh=512",
      }),
    ]);
    const index = buildIndex({ repoMaps: ["kz_ozark"], winners, previous: {} });
    expect(index).toEqual({
      kz_ozark: {
        id: "314",
        previewUrl: "https://ugc.example/1/abc.jpg/",
        timeUpdated: 1_710_000_000,
      },
    });
  });

  it("prefers the current winner over the previous record", () => {
    const winners = pickWinners([makeItem({ title: "kz_a", id: "2" })]);
    const previous = { kz_a: { id: "1", previewUrl: "https://old", timeUpdated: 1 } };
    expect(buildIndex({ repoMaps: ["kz_a"], winners, previous }).kz_a?.id).toBe("2");
  });

  it("keeps the previous record for a map whose Workshop item has vanished (ADR 0002)", () => {
    const previous = { kz_gone: { id: "7", previewUrl: "https://ugc.example/7/x.jpg/", timeUpdated: 99 } };
    const index = buildIndex({ repoMaps: ["kz_gone"], winners: new Map(), previous });
    expect(index.kz_gone).toEqual(previous.kz_gone);
  });

  it("falls back to an empty record for a hand-added map with no Workshop record", () => {
    const index = buildIndex({ repoMaps: ["kz_mine"], winners: new Map(), previous: {} });
    expect(index.kz_mine).toEqual({ id: "", previewUrl: "", timeUpdated: 0 });
  });

  it("only covers maps actually present in the repo", () => {
    const winners = pickWinners([
      makeItem({ title: "kz_a" }),
      makeItem({ title: "kz_not_in_repo" }),
    ]);
    const index = buildIndex({ repoMaps: ["kz_a"], winners, previous: {} });
    expect(Object.keys(index)).toEqual(["kz_a"]);
  });

  it("excludes storable non-kz maps from the index entirely", () => {
    const previous = { de_dust2: { id: "", previewUrl: "", timeUpdated: 0 } };
    const index = buildIndex({
      repoMaps: ["kz_a", "de_dust2"],
      winners: pickWinners([makeItem({ title: "kz_a", id: "1" })]),
      previous,
    });
    expect(Object.keys(index)).toEqual(["kz_a"]);
  });
});

describe("rebuildIndexFile", () => {
  it("creates the file on first run and reports it unchanged on the second", async () => {
    const dir = await makeTempImagesDir(["kz_a.jpg"]);
    const indexPath = path.join(dir, "index.json");
    const winners = pickWinners([makeItem({ title: "kz_a", id: "1" })]);

    const first = await rebuildIndexFile({ imagesDir: dir, indexPath, winners });
    expect(first).toEqual({ outcome: "updated", mapCount: 1 });

    const second = await rebuildIndexFile({ imagesDir: dir, indexPath, winners });
    expect(second).toEqual({ outcome: "unchanged", mapCount: 1 });
  });

  it("counts only index entries, not storable non-kz repo images", async () => {
    const dir = await makeTempImagesDir(["kz_a.jpg", "de_dust2.jpg"]);
    const indexPath = path.join(dir, "index.json");

    const result = await rebuildIndexFile({ imagesDir: dir, indexPath, winners: new Map() });
    expect(result).toEqual({ outcome: "updated", mapCount: 1 });
  });
});

describe("renderIndex", () => {
  it("is byte-identical across rebuilds of an unchanged repo", async () => {
    const dir = await makeTempImagesDir(["kz_b.jpg", "kz_a.jpg", "kz_old.jpg"]);
    const winners = pickWinners([
      makeItem({ title: "kz_b", id: "2" }),
      makeItem({ title: "kz_a", id: "1" }),
    ]);
    // kz_old is stored in the repo but its Workshop item has vanished.
    const previous = { kz_old: { id: "9", previewUrl: "", timeUpdated: 0 } };

    const first = renderIndex(
      buildIndex({ repoMaps: await listRepoMaps(dir), winners, previous }),
    );
    const second = renderIndex(
      buildIndex({ repoMaps: await listRepoMaps(dir), winners, previous }),
    );
    expect(second).toBe(first);
    // The vanished map is still there, keys are sorted, and the file ends with a newline.
    expect(first).toBe(
      JSON.stringify(
        {
          kz_a: { id: "1", previewUrl: winners.get("kz_a")!.previewUrl, timeUpdated: 1_700_000_000 },
          kz_b: { id: "2", previewUrl: winners.get("kz_b")!.previewUrl, timeUpdated: 1_700_000_000 },
          kz_old: { id: "9", previewUrl: "", timeUpdated: 0 },
        },
        null,
        2,
      ) + "\n",
    );
  });

  it("is independent of winners insertion order", () => {
    const a = makeItem({ title: "kz_a", id: "1" });
    const b = makeItem({ title: "kz_b", id: "2" });
    const one = renderIndex(
      buildIndex({ repoMaps: ["kz_a", "kz_b"], winners: pickWinners([a, b]), previous: {} }),
    );
    const two = renderIndex(
      buildIndex({ repoMaps: ["kz_b", "kz_a"], winners: pickWinners([b, a]), previous: {} }),
    );
    expect(two).toBe(one);
  });

  it("renders an empty index as an empty object", () => {
    expect(renderIndex({})).toBe("{}\n");
  });

  it("normalizes record key order coming from a hand-edited previous index", () => {
    const index = buildIndex({
      repoMaps: ["kz_a"],
      winners: new Map(),
      previous: parseIndex('{"kz_a": {"timeUpdated": 5, "id": "3", "previewUrl": ""}}'),
    });
    expect(renderIndex(index)).toBe(
      '{\n  "kz_a": {\n    "id": "3",\n    "previewUrl": "",\n    "timeUpdated": 5\n  }\n}\n',
    );
  });
});
