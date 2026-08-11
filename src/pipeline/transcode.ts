import sharp from "sharp";

/** JPEG quality for every stored Preview image (ADR 0001). */
export const JPEG_QUALITY = 90;

/**
 * Transcodes any source format (PNG/WebP/JPEG/…) to JPEG at original
 * resolution. No resize: the stored file is a pure format conversion.
 */
export async function toJpeg(image: Buffer): Promise<Buffer> {
  return sharp(image).jpeg({ quality: JPEG_QUALITY }).toBuffer();
}
