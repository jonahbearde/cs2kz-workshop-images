import { rename, writeFile } from "node:fs/promises";
import { originalImageUrl } from "./images.js";
import { toJpeg } from "./transcode.js";

/**
 * Fetches a Winner's preview at original resolution and transcodes it to
 * the stored JPEG. Throws with the offending URL on any HTTP failure.
 */
export async function fetchPreviewJpeg(previewUrl: string): Promise<Buffer> {
  const url = originalImageUrl(previewUrl);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return toJpeg(Buffer.from(await res.arrayBuffer()));
}

/** Write aside, then rename: an interrupted run never leaves a half-written image. */
export async function writeImageAtomic(target: string, bytes: Buffer): Promise<void> {
  const tmp = `${target}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, target);
}
