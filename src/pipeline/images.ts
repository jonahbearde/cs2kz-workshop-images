/**
 * Original-resolution URL of a Workshop Preview image.
 *
 * Steam returns preview URLs carrying resize parameters
 * (`imw`/`imh`/`ima`/`impolicy`). The original is served at the same path
 * with the entire query string stripped. The trailing slash must stay —
 * dropping it yields a 404 from the UGC CDN.
 */
export function originalImageUrl(previewUrl: string): string {
  const queryIndex = previewUrl.indexOf("?");
  return queryIndex === -1 ? previewUrl : previewUrl.slice(0, queryIndex);
}
