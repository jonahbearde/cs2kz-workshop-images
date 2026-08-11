/** One published Workshop item as returned by `IPublishedFileService/QueryFiles`. */
export interface WorkshopItem {
  /** Workshop publishedfileid (uint64, kept as a string to preserve precision). */
  id: string;
  title: string;
  tags: string[];
  /** Unix seconds of the item's last update. */
  timeUpdated: number;
  /** First preview image URL, or "" when the item has no preview image. */
  previewUrl: string;
}
