import type { WorkshopItem } from "./types.js";

const QUERY_FILES_URL = "https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/";
const DEFAULT_NUM_PER_PAGE = 100;
/** Safety valve so a broken cursor can never loop forever. */
const MAX_PAGES = 10_000;

export interface WorkshopClientOptions {
  /** Steam Web API key (`STEAM_API_KEY`). */
  apiKey: string;
  /**
   * Server-side prefilter. Defaults to the CS2 tag, which bounds the
   * enumerable corpus to items that can possibly be KZ maps.
   */
  requiredTags?: string[];
  numPerPage?: number;
}

interface PublishedFileDetail {
  publishedfileid?: string | number;
  title?: string;
  tags?: { tag?: string }[];
  time_updated?: number;
  preview_url?: string;
  result?: number;
}

interface QueryFilesEnvelope {
  response?: {
    total?: number;
    next_cursor?: string;
    publishedfiledetails?: PublishedFileDetail[];
  };
}

/** The only module that talks to Steam. Wraps `IPublishedFileService/QueryFiles`. */
export class WorkshopClient {
  private readonly options: Required<Pick<WorkshopClientOptions, "apiKey" | "requiredTags" | "numPerPage">>;

  constructor(options: WorkshopClientOptions) {
    this.options = {
      apiKey: options.apiKey,
      requiredTags: options.requiredTags ?? ["CS2"],
      numPerPage: options.numPerPage ?? DEFAULT_NUM_PER_PAGE,
    };
  }

  /** Enumerates the whole Workshop corpus, paginating `QueryFiles` to exhaustion. */
  async enumerate(): Promise<WorkshopItem[]> {
    const items: WorkshopItem[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const envelope = await this.queryFiles(cursor);
      const details = envelope.response?.publishedfiledetails ?? [];
      for (const detail of details) {
        const item = toItem(detail);
        if (item !== undefined) items.push(item);
      }
      cursor = envelope.response?.next_cursor;
      if (details.length === 0 || !cursor) return items;
    }
    throw new Error(`QueryFiles pagination did not exhaust after ${MAX_PAGES} pages`);
  }

  private async queryFiles(cursor: string | undefined): Promise<QueryFilesEnvelope> {
    const params = new URLSearchParams({
      key: this.options.apiKey,
      numperpage: String(this.options.numPerPage),
      return_tags: "true",
    });
    for (const tag of this.options.requiredTags) {
      params.append("requiredtags", tag);
    }
    if (cursor !== undefined) params.set("cursor", cursor);

    const res = await fetch(`${QUERY_FILES_URL}?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`QueryFiles failed with HTTP ${res.status}`);
    }
    return (await res.json()) as QueryFilesEnvelope;
  }
}

function toItem(detail: PublishedFileDetail): WorkshopItem | undefined {
  // result !== 1 (EResult.OK) means a partial/failed record without fields.
  if (detail.result !== undefined && detail.result !== 1) return undefined;
  if (detail.publishedfileid === undefined) return undefined;
  return {
    id: String(detail.publishedfileid),
    title: detail.title ?? "",
    tags: (detail.tags ?? [])
      .map((t) => t.tag)
      .filter((tag): tag is string => tag !== undefined),
    timeUpdated: detail.time_updated ?? 0,
    previewUrl: detail.preview_url ?? "",
  };
}
