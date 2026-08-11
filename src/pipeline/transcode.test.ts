import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { toJpeg } from "./transcode.js";

describe("toJpeg", () => {
  it("transcodes a PNG to a valid JPEG at original resolution", async () => {
    // Runtime PNG fixture: solid colour, 120x80.
    const png = await sharp({
      create: { width: 120, height: 80, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .png()
      .toBuffer();

    const jpeg = await toJpeg(png);

    // Smoke test only: valid JPEG container, no pixel-level assertions.
    expect(jpeg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    const meta = await sharp(jpeg).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(80);
  });
});
