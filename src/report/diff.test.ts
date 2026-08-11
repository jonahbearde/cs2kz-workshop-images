import { describe, expect, it } from "vitest";
import type { WorkshopItem } from "../workshop/types.js";
import { makeItem } from "../pipeline/fixtures.js";
import { diffRepo, workshopPageUrl } from "./diff.js";

function winnersOf(items: WorkshopItem[]): Map<string, WorkshopItem> {
  return new Map(items.map((item) => [item.title, item]));
}

describe("workshopPageUrl", () => {
  it("points at the Workshop file details page for the item id", () => {
    expect(workshopPageUrl("3141592653")).toBe(
      "https://steamcommunity.com/sharedfiles/filedetails/?id=3141592653",
    );
  });
});

describe("diffRepo", () => {
  it("returns an empty diff for no winners and no repo maps", () => {
    expect(diffRepo(new Map(), [])).toEqual({ have: [], missing: [], noPreview: [] });
  });

  it("counts a winner whose image is already in the repo as have", () => {
    const diff = diffRepo(winnersOf([makeItem({ title: "kz_ozark" })]), ["kz_ozark"]);
    expect(diff.have).toEqual(["kz_ozark"]);
    expect(diff.missing).toEqual([]);
    expect(diff.noPreview).toEqual([]);
  });

  it("reports a winner absent from the repo as missing with its Workshop page link", () => {
    const item = makeItem({ id: "4242", title: "kz_newclimb" });
    const diff = diffRepo(winnersOf([item]), []);
    expect(diff.have).toEqual([]);
    expect(diff.missing).toEqual([
      {
        name: "kz_newclimb",
        workshopUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=4242",
      },
    ]);
    expect(diff.noPreview).toEqual([]);
  });

  it("reports a winner with an empty preview URL as no-preview, not missing", () => {
    const item = makeItem({ title: "kz_nopic", previewUrl: "" });
    const diff = diffRepo(winnersOf([item]), []);
    expect(diff.have).toEqual([]);
    expect(diff.missing).toEqual([]);
    expect(diff.noPreview).toEqual(["kz_nopic"]);
  });

  it("no-preview wins over repo membership only when the map is absent from the repo", () => {
    // A stored image counts as have even if the winner currently lacks a preview.
    const item = makeItem({ title: "kz_stored", previewUrl: "" });
    const diff = diffRepo(winnersOf([item]), ["kz_stored"]);
    expect(diff.have).toEqual(["kz_stored"]);
    expect(diff.noPreview).toEqual([]);
  });

  it("ignores repo maps that have no winner (delisted or never enumerated)", () => {
    const diff = diffRepo(new Map(), ["kz_orphan"]);
    expect(diff).toEqual({ have: [], missing: [], noPreview: [] });
  });

  it("partitions a mixed corpus and sorts each bucket by name", () => {
    const winners = winnersOf([
      makeItem({ id: "3", title: "kz_zeta" }),
      makeItem({ id: "1", title: "kz_alpha" }),
      makeItem({ id: "4", title: "kz_silent", previewUrl: "" }),
      makeItem({ id: "2", title: "kz_beta", previewUrl: "" }),
    ]);
    const diff = diffRepo(winners, ["kz_zeta"]);
    expect(diff.have).toEqual(["kz_zeta"]);
    expect(diff.missing).toEqual([
      { name: "kz_alpha", workshopUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=1" },
    ]);
    expect(diff.noPreview).toEqual(["kz_beta", "kz_silent"]);
  });
});
