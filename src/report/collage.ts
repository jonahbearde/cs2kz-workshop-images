import sharp from "sharp";
import { JPEG_QUALITY } from "../pipeline/transcode.js";

/**
 * One image in the report's collage. New maps contribute a single 16:9
 * thumbnail tile; Updated maps contribute one pair tile whose left half is
 * the previously stored image and whose right half is the Winner's fresh
 * preview, with a drawn arrow between them.
 */
export interface CollageTile {
  name: string;
  kind: "new" | "updated";
  /** `new`: the downloaded JPEG; `updated`: [stored old, fresh winner]. */
  images: [Buffer] | [Buffer, Buffer];
}

/**
 * The maximum number of tiles in one collage. It doubles as the caption's
 * name-list cap: every collaged map is named in the caption and vice versa,
 * and eight linked lines stay well under Telegram's 1024-character photo
 * caption limit, so caption overflow is structurally impossible.
 */
export const COLLAGE_TILE_CAP = 8;

/** Layout geometry — exported so tests can assert the observable canvas size. */
export const NEW_TILE_WIDTH = 320;
export const NEW_TILE_HEIGHT = 180;
export const PAIR_TILE_WIDTH = 680;
export const PAIR_TILE_HEIGHT = 196;
/** Thin vertical gap between tiles so pairs stay visually distinct. */
export const TILE_GAP = 6;

/** One half of an Updated pair (16:9); a whole New tile is the same size. */
const HALF_W = NEW_TILE_WIDTH;
const HALF_H = NEW_TILE_HEIGHT;
/** Horizontal zone between the halves, where the arrow is drawn. */
const ARROW_ZONE = PAIR_TILE_WIDTH - 2 * HALF_W;
/** Strip beneath each half carrying the tiny `old`/`new` labels. */
const LABEL_H = PAIR_TILE_HEIGHT - HALF_H;

const BACKGROUND = { r: 16, g: 17, b: 20 };

/**
 * Composites the given tiles into one JPEG collage, at most `cap` tiles —
 * tiles beyond the cap are dropped (the caption's `…and K more` line keeps
 * the report honest). New tiles are 16:9 thumbnails; Updated tiles are one
 * pair each (old left, drawn arrow, new right, `old`/`new` labels beneath).
 * The canvas is as wide as its widest tile and as tall as the stacked
 * tiles plus gaps. Zero tiles is an error: callers degrade to a text
 * message instead of ever calling this with none.
 */
export async function composeCollage(
  tiles: CollageTile[],
  cap: number = COLLAGE_TILE_CAP,
): Promise<Buffer> {
  if (tiles.length === 0) {
    throw new Error("cannot compose a collage from zero tiles");
  }
  const shown = tiles.slice(0, cap);
  const width = shown.some((tile) => tile.kind === "updated")
    ? PAIR_TILE_WIDTH
    : NEW_TILE_WIDTH;
  const layers: { input: Buffer; left: number; top: number }[] = [];
  let height = 0;
  for (const [i, tile] of shown.entries()) {
    const rendered = await renderTile(tile);
    const tileHeight = tile.kind === "updated" ? PAIR_TILE_HEIGHT : NEW_TILE_HEIGHT;
    layers.push({ input: rendered, left: 0, top: height });
    height += tileHeight + (i < shown.length - 1 ? TILE_GAP : 0);
  }
  return sharp({
    create: { width, height, channels: 3, background: BACKGROUND },
  })
    .composite(layers)
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

async function renderTile(tile: CollageTile): Promise<Buffer> {
  if (tile.kind === "new") {
    return thumbnail(tile.images[0]);
  }
  const [oldHalf, newHalf] = tile.images;
  return sharp({
    create: { width: PAIR_TILE_WIDTH, height: PAIR_TILE_HEIGHT, channels: 3, background: BACKGROUND },
  })
    .composite([
      { input: await thumbnail(oldHalf!), left: 0, top: 0 },
      { input: await thumbnail(newHalf!), left: HALF_W + ARROW_ZONE, top: 0 },
      { input: Buffer.from(pairOverlaySvg()), left: 0, top: 0 },
    ])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/** A 16:9 cover-cropped thumbnail of one image half. */
function thumbnail(image: Buffer): Promise<Buffer> {
  return sharp(image)
    .resize(HALF_W, HALF_H, { fit: "cover" })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * The `→` arrow between the halves of an Updated pair plus the `old`/`new`
 * labels beneath them. The arrow is drawn as an SVG path — vector shapes
 * rendered by sharp — rather than a font glyph, so rendering never depends
 * on a font covering U+2192, and no arrow glyph appears in the caption text.
 * The overlay itself is transparent except for the drawn marks.
 */
export function pairOverlaySvg(): string {
  const midY = HALF_H / 2;
  const left = HALF_W + 6;
  const headX = HALF_W + ARROW_ZONE - 8;
  return [
    `<svg width="${PAIR_TILE_WIDTH}" height="${PAIR_TILE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">`,
    // Arrow shaft + arrowhead, drawn as vector shapes.
    `<path d="M${left} ${midY} L${headX} ${midY}" stroke="#ffffff" stroke-width="4" fill="none"/>`,
    `<path d="M${headX} ${midY} L${headX - 10} ${midY - 9} L${headX - 10} ${midY + 9} Z" fill="#ffffff"/>`,
    `<text x="10" y="${HALF_H + LABEL_H - 4}" font-family="sans-serif" font-size="11" fill="#ffffff">old</text>`,
    `<text x="${HALF_W + ARROW_ZONE + 10}" y="${HALF_H + LABEL_H - 4}" font-family="sans-serif" font-size="11" fill="#ffffff">new</text>`,
    "</svg>",
  ].join("");
}