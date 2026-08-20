import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  COLLAGE_TILE_CAP,
  NEW_TILE_HEIGHT,
  NEW_TILE_WIDTH,
  PAIR_TILE_HEIGHT,
  PAIR_TILE_WIDTH,
  TILE_GAP,
  composeCollage,
  pairOverlaySvg,
  type CollageTile,
} from "./collage.js";

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

async function newTiles(count: number): Promise<CollageTile[]> {
  const tiles: CollageTile[] = [];
  for (let i = 0; i < count; i++) {
    tiles.push({ name: `kz_new_${i}`, kind: "new", images: [await jpeg(i + 1)] });
  }
  return tiles;
}

async function pairTiles(count: number): Promise<CollageTile[]> {
  const tiles: CollageTile[] = [];
  for (let i = 0; i < count; i++) {
    tiles.push({
      name: `kz_changed_${i}`,
      kind: "updated",
      images: [await jpeg(i + 40), await jpeg(i + 90)],
    });
  }
  return tiles;
}

/** Stacked height of `n` tiles of the given height, with gaps between them. */
function stacked(n: number, tileHeight: number): number {
  return n * tileHeight + (n - 1) * TILE_GAP;
}

describe("composeCollage", () => {
  it("produces a valid JPEG for a single new tile", async () => {
    const collage = await composeCollage(await newTiles(1), 1);

    expect(collage.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    const meta = await sharp(collage).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(NEW_TILE_WIDTH);
    expect(meta.height).toBe(NEW_TILE_HEIGHT);
  });

  it("caps the tile count at 8 no matter how many tiles arrive", async () => {
    const collage = await composeCollage(await newTiles(10), COLLAGE_TILE_CAP);
    const meta = await sharp(collage).metadata();

    expect(meta.width).toBe(NEW_TILE_WIDTH);
    // eight stacked thumbnail tiles with thin gaps; two extra tiles dropped
    expect(meta.height).toBe(stacked(COLLAGE_TILE_CAP, NEW_TILE_HEIGHT));
  });

  it("renders only as many tiles as the cap permits, respecting pair heights", async () => {
    const collage = await composeCollage(await pairTiles(10), COLLAGE_TILE_CAP);
    const meta = await sharp(collage).metadata();

    expect(meta.width).toBe(PAIR_TILE_WIDTH);
    expect(meta.height).toBe(stacked(COLLAGE_TILE_CAP, PAIR_TILE_HEIGHT));
  });

  it("makes an updated pair a wider image than a new tile", async () => {
    const onlyNew = await sharp(await composeCollage(await newTiles(1), 1)).metadata();
    const withPair = await sharp(await composeCollage(await pairTiles(1), 1)).metadata();

    expect(onlyNew.width).toBe(NEW_TILE_WIDTH);
    expect(withPair.width).toBe(PAIR_TILE_WIDTH);
    expect(withPair.width!).toBeGreaterThan(onlyNew.width!);
  });

  it("combines the old and new halves of an updated pair into one tile", async () => {
    const [oldHalf, newHalf] = [await jpeg(1), await jpeg(2)];
    const collage = await composeCollage(
      [{ name: "kz_changed", kind: "updated", images: [oldHalf, newHalf] }],
      1,
    );
    const meta = await sharp(collage).metadata();

    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(PAIR_TILE_WIDTH);
    expect(meta.height).toBe(PAIR_TILE_HEIGHT);
  });

  it("mixes new thumbnails and updated pairs, sizing the canvas to the widest tile", async () => {
    const collage = await composeCollage(
      [...(await newTiles(1)), ...(await pairTiles(1))],
      8,
    );
    const meta = await sharp(collage).metadata();

    expect(meta.width).toBe(PAIR_TILE_WIDTH);
    expect(meta.height).toBe(NEW_TILE_HEIGHT + TILE_GAP + PAIR_TILE_HEIGHT);
  });

  it("rejects an empty tile list", async () => {
    await expect(composeCollage([], 8)).rejects.toThrow(/zero tiles/);
  });
});

describe("pairOverlaySvg", () => {
  it("draws the arrow as SVG vector paths, not a font glyph", () => {
    const svg = pairOverlaySvg();
    expect(svg).toContain("<path");
    // the arrowhead's filled triangle shape is present
    expect(svg).toMatch(/Z\s*"/);
    // if it were a font glyph it would reference the U+2192 character
    expect(svg).not.toContain("→");
    expect(svg).not.toContain("&#8594;");
  });

  it("labels the halves old and new", () => {
    expect(pairOverlaySvg()).toContain(">old</text>");
    expect(pairOverlaySvg()).toContain(">new</text>");
  });
});