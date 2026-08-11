import type { WorkshopItem } from "../workshop/types.js";

let nextId = 1000;

/** Builds a WorkshopItem fixture; defaults to a legal CS2 KZ map. */
export function makeItem(overrides: Partial<WorkshopItem> = {}): WorkshopItem {
  const id = overrides.id ?? String(nextId++);
  return {
    id,
    title: "kz_default",
    tags: ["CS2"],
    timeUpdated: 1_700_000_000,
    previewUrl: `https://steamusercontent-a.akamaihd.net/ugc/${id}/abc.jpg/`,
    ...overrides,
  };
}
