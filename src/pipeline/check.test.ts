import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { checkImagesDir } from "./check.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "cs2kz-check-"));
  tempDirs.push(dir);
  return dir;
}

async function png(width = 32, height = 32): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 120, b: 240 } },
  })
    .png()
    .toBuffer();
}

async function files(dir: string): Promise<string[]> {
  return (await readdir(dir)).sort();
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("checkImagesDir", () => {
  it("transcodes a non-JPEG upload to JPEG in place", async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, "kz_foo.png"), await png());

    const outcome = await checkImagesDir(dir);

    expect(outcome.problems).toEqual([]);
    expect(outcome.transcoded).toEqual(["kz_foo.png"]);
    expect(await files(dir)).toEqual(["kz_foo.jpg"]);
    const jpeg = await readFile(path.join(dir, "kz_foo.jpg"));
    expect(jpeg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    const meta = await sharp(jpeg).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(32);
    expect(meta.height).toBe(32);
  });

  it("leaves an existing .jpg with a legal name untouched", async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, "kz_bar.jpg"), Buffer.from([0xff, 0xd8]));

    const outcome = await checkImagesDir(dir);

    expect(outcome).toEqual({ transcoded: [], problems: [] });
    expect(await files(dir)).toEqual(["kz_bar.jpg"]);
  });

  it("accepts a hand upload with a non-kz storable name and transcodes it", async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, "de_dust2.png"), await png());

    const outcome = await checkImagesDir(dir);

    expect(outcome.problems).toEqual([]);
    expect(outcome.transcoded).toEqual(["de_dust2.png"]);
    expect(await files(dir)).toEqual(["de_dust2.jpg"]);
  });

  it("rejects a stem that is not storable and names the storable-name rule", async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, "2fort.jpg"), Buffer.from([0xff, 0xd8]));

    const outcome = await checkImagesDir(dir);

    expect(outcome.transcoded).toEqual([]);
    expect(outcome.problems).toHaveLength(1);
    expect(outcome.problems[0]).toContain("2fort.jpg");
    expect(outcome.problems[0]).toContain("^[a-z][a-z0-9_]*$");
  });

  it("rejects a file whose stem is not a storable map name, leaving it in place", async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, "KZ_Shouted.jpg"), Buffer.from([0xff, 0xd8]));
    await writeFile(path.join(dir, "my map.png"), await png());

    const outcome = await checkImagesDir(dir);

    expect(outcome.transcoded).toEqual([]);
    expect(outcome.problems).toHaveLength(2);
    expect(outcome.problems.join("\n")).toContain("KZ_Shouted.jpg");
    expect(outcome.problems.join("\n")).toContain("my map.png");
    expect(await files(dir)).toEqual(["KZ_Shouted.jpg", "my map.png"]);
  });

  it("refuses to transcode over an existing .jpg for the same map", async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, "kz_foo.jpg"), Buffer.from([0xff, 0xd8]));
    await writeFile(path.join(dir, "kz_foo.png"), await png());

    const outcome = await checkImagesDir(dir);

    expect(outcome.transcoded).toEqual([]);
    expect(outcome.problems.join("\n")).toContain("kz_foo");
    expect(await files(dir)).toEqual(["kz_foo.jpg", "kz_foo.png"]);
  });

  it("reports undecodable files with a legal stem instead of crashing", async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, "kz_notes.txt"), "not an image");

    const outcome = await checkImagesDir(dir);

    expect(outcome.transcoded).toEqual([]);
    expect(outcome.problems.join("\n")).toContain("kz_notes.txt");
    expect(await files(dir)).toEqual(["kz_notes.txt"]);
  });

  it("handles a mixed batch: transcode the good, reject the bad", async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, "kz_good.webp"), await png());
    await writeFile(path.join(dir, "Bad.jpg"), Buffer.from([0xff, 0xd8]));

    const outcome = await checkImagesDir(dir);

    expect(outcome.transcoded).toEqual(["kz_good.webp"]);
    expect(outcome.problems.join("\n")).toContain("Bad.jpg");
    expect(await files(dir)).toEqual(["Bad.jpg", "kz_good.jpg"]);
  });
});
