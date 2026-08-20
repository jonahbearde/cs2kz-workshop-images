import { describe, expect, it } from "vitest";
import type { WorkshopItem } from "../workshop/types.js";
import { makeItem } from "../pipeline/fixtures.js";
import type { WorkshopIndex } from "../pipeline/indexer.js";
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
    expect(diffRepo(new Map(), [])).toEqual({ have: [], missing: [], stale: [], noPreview: [] });
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
    const item = makeItem({ id: "9", title: "kz_nopic", previewUrl: "" });
    const diff = diffRepo(winnersOf([item]), []);
    expect(diff.have).toEqual([]);
    expect(diff.missing).toEqual([]);
    expect(diff.noPreview).toEqual([
      { name: "kz_nopic", workshopUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=9" },
    ]);
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
    expect(diff).toEqual({ have: [], missing: [], stale: [], noPreview: [] });
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
    expect(diff.noPreview).toEqual([
      { name: "kz_beta", workshopUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=2" },
      { name: "kz_silent", workshopUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=4" },
    ]);
  });
});

describe("diffRepo stale detection (ADR 0004)", () => {
  const indexWith = (name: string, previewUrl: string): WorkshopIndex => ({
    [name]: { id: "1", previewUrl, timeUpdated: 1 },
  });

  it("counts a stored map as have when the winner's preview URL matches the index record", () => {
    const item = makeItem({ title: "kz_fresh", previewUrl: "https://ugc.example/a.jpg/" });
    const diff = diffRepo(winnersOf([item]), ["kz_fresh"], indexWith("kz_fresh", "https://ugc.example/a.jpg/"));
    expect(diff.have).toEqual(["kz_fresh"]);
    expect(diff.stale).toEqual([]);
  });

  it("compares original-resolution URLs: query parameters on the winner's URL are stripped before comparing", () => {
    const item = makeItem({ title: "kz_fresh", previewUrl: "https://ugc.example/a.jpg/?imw=64&imh=64" });
    const diff = diffRepo(winnersOf([item]), ["kz_fresh"], indexWith("kz_fresh", "https://ugc.example/a.jpg/"));
    expect(diff.have).toEqual(["kz_fresh"]);
    expect(diff.stale).toEqual([]);
  });

  it("counts a stored map as stale when the winner's preview URL differs from the index record", () => {
    const item = makeItem({ id: "77", title: "kz_rotten", previewUrl: "https://ugc.example/new.jpg/" });
    const diff = diffRepo(winnersOf([item]), ["kz_rotten"], indexWith("kz_rotten", "https://ugc.example/old.jpg/"));
    expect(diff.have).toEqual([]);
    expect(diff.stale).toEqual([
      {
        name: "kz_rotten",
        workshopUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=77",
      },
    ]);
  });

  it("never judges a stored map stale when it has no index record (hand upload never enriched)", () => {
    const item = makeItem({ title: "kz_manual", previewUrl: "https://ugc.example/a.jpg/" });
    const diff = diffRepo(winnersOf([item]), ["kz_manual"], {});
    expect(diff.have).toEqual(["kz_manual"]);
    expect(diff.stale).toEqual([]);
  });

  it("never judges a stored map stale when its index record has an empty previewUrl", () => {
    const item = makeItem({ title: "kz_manual", previewUrl: "https://ugc.example/a.jpg/" });
    const diff = diffRepo(winnersOf([item]), ["kz_manual"], indexWith("kz_manual", ""));
    expect(diff.have).toEqual(["kz_manual"]);
    expect(diff.stale).toEqual([]);
  });

  it("keeps the stored image as have when the winner lost its preview entirely", () => {
    const item = makeItem({ title: "kz_lostpic", previewUrl: "" });
    const diff = diffRepo(winnersOf([item]), ["kz_lostpic"], indexWith("kz_lostpic", "https://ugc.example/old.jpg/"));
    expect(diff.have).toEqual(["kz_lostpic"]);
    expect(diff.stale).toEqual([]);
    expect(diff.noPreview).toEqual([]);
  });

  it("defaults to no index: stored maps are never stale when the index is omitted", () => {
    const item = makeItem({ title: "kz_stored", previewUrl: "https://ugc.example/a.jpg/" });
    const diff = diffRepo(winnersOf([item]), ["kz_stored"]);
    expect(diff.have).toEqual(["kz_stored"]);
    expect(diff.stale).toEqual([]);
  });

  it("sorts the stale bucket by name", () => {
    const winners = winnersOf([
      makeItem({ id: "2", title: "kz_z", previewUrl: "https://ugc.example/z2.jpg/" }),
      makeItem({ id: "1", title: "kz_a", previewUrl: "https://ugc.example/a2.jpg/" }),
    ]);
    const index: WorkshopIndex = {
      kz_z: { id: "2", previewUrl: "https://ugc.example/z1.jpg/", timeUpdated: 1 },
      kz_a: { id: "1", previewUrl: "https://ugc.example/a1.jpg/", timeUpdated: 1 },
    };
    const diff = diffRepo(winners, ["kz_z", "kz_a"], index);
    expect(diff.stale.map((entry) => entry.name)).toEqual(["kz_a", "kz_z"]);
  });
});
