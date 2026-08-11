import type { WorkshopItem } from "./types.js";

const QUERY_FILES_URL = "https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/";
/** CS2 (and CS:GO before it) Workshop lives under app 730. */
const DEFAULT_APP_ID = 730;
const DEFAULT_NUM_PER_PAGE = 100;
/**
 * QueryFiles only cursor-paginates past its ~500-page cap when a cursor is
 * supplied; "*" starts at the beginning and unlocks `next_cursor` in replies.
 */
const INITIAL_CURSOR = "*";
/** Safety valve so a broken cursor can never loop forever. */
const MAX_PAGES = 10_000;

export interface WorkshopClientOptions {
  /** Steam Web API key (`STEAM_API_KEY`). */
  apiKey: string;
  /** Workshop corpus to enumerate; defaults to the CS2 app. */
  appId?: number;
  numPerPage?: number;
  /** Called after every page; used by the CLI for progress reporting. */
  onProgress?: (itemsSoFar: number) => void;
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
  private readonly options: Required<Omit<WorkshopClientOptions, "onProgress">>;
  private readonly onProgress: ((itemsSoFar: number) => void) | undefined;

  constructor(options: WorkshopClientOptions) {
    this.options = {
      apiKey: options.apiKey,
      appId: options.appId ?? DEFAULT_APP_ID,
      numPerPage: options.numPerPage ?? DEFAULT_NUM_PER_PAGE,
    };
    this.onProgress = options.onProgress;
  }

  /** Enumerates the whole Workshop corpus, paginating `QueryFiles` to exhaustion. */
  async enumerate(): Promise<WorkshopItem[]> {
    const items: WorkshopItem[] = [];
    let cursor: string = INITIAL_CURSOR;
    for (let page = 0; page < MAX_PAGES; page++) {
      const envelope = await this.queryFiles(cursor);
      const details = envelope.response?.publishedfiledetails ?? [];
      for (const detail of details) {
        const item = toItem(detail);
        if (item !== undefined) items.push(item);
      }
      const nextCursor = envelope.response?.next_cursor;
      this.onProgress?.(items.length);
      if (details.length === 0 || !nextCursor) return items;
      cursor = nextCursor;
    }
    throw new Error(`QueryFiles pagination did not exhaust after ${MAX_PAGES} pages`);
  }

  private async queryFiles(cursor: string): Promise<QueryFilesEnvelope> {
    const params = new URLSearchParams({
      key: this.options.apiKey,
      appid: String(this.options.appId),
      numperpage: String(this.options.numPerPage),
      cursor,
      return_tags: "true",
    });

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
