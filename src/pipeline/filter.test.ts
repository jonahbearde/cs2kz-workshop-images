import { describe, expect, it } from "vitest";
import { filterKzMaps, isStorableMapName } from "./filter.js";
import { makeItem } from "./fixtures.js";

describe("filterKzMaps", () => {
  it("keeps a lowercase kz_ title with the CS2 tag", () => {
    const item = makeItem({ title: "kz_ozark", tags: ["CS2"] });
    expect(filterKzMaps([item])).toEqual([item]);
  });

  it("keeps legal names made of lowercase letters, digits and underscores", () => {
    const item = makeItem({ title: "kz_cobble_2077x", tags: ["CS2", "KZ"] });
    expect(filterKzMaps([item])).toEqual([item]);
  });

  it("rejects an uppercase prefix like KZ_x (no normalization)", () => {
    expect(filterKzMaps([makeItem({ title: "KZ_x" })])).toEqual([]);
  });

  it("rejects uppercase letters anywhere in the name", () => {
    expect(filterKzMaps([makeItem({ title: "kz_Ozark" })])).toEqual([]);
  });

  it("rejects a dash separator like kz-x", () => {
    expect(filterKzMaps([makeItem({ title: "kz-x" })])).toEqual([]);
  });

  it("rejects trailing junk like kz_x (final)", () => {
    expect(filterKzMaps([makeItem({ title: "kz_x (final)" })])).toEqual([]);
  });

  it("rejects the bare kz_ prefix with nothing after it", () => {
    expect(filterKzMaps([makeItem({ title: "kz_" })])).toEqual([]);
  });

  it("rejects items without the CS2 tag even with a legal title", () => {
    expect(filterKzMaps([makeItem({ tags: ["KZ", "CS:GO"] })])).toEqual([]);
    expect(filterKzMaps([makeItem({ tags: [] })])).toEqual([]);
  });

  it("matches the CS2 tag case-insensitively (the Workshop stores it as Cs2)", () => {
    const item = makeItem({ title: "kz_ozark", tags: ["Cs2", "Map", "Custom"] });
    expect(filterKzMaps([item])).toEqual([item]);
  });

  it("does not require a KZ tag", () => {
    const item = makeItem({ title: "kz_only_cs2_tag", tags: ["CS2", "Course"] });
    expect(filterKzMaps([item])).toEqual([item]);
  });

  it("keeps only KZ maps from a mixed corpus", () => {
    const kz = makeItem({ id: "1", title: "kz_keep" });
    const notKz = [
      makeItem({ id: "2", title: "KZ_x" }),
      makeItem({ id: "3", title: "kz-x" }),
      makeItem({ id: "4", title: "kz_keep (final)" }),
      makeItem({ id: "5", title: "kz_keep", tags: ["CS:GO"] }),
      makeItem({ id: "6", title: "de_dust2", tags: ["CS2"] }),
    ];
    expect(filterKzMaps([notKz[0]!, kz, ...notKz.slice(1)])).toEqual([kz]);
  });
});

describe("isStorableMapName", () => {
  it("keeps every legal KZ map name storable", () => {
    expect(isStorableMapName("kz_ozark")).toBe(true);
    expect(isStorableMapName("kz_152_ladders")).toBe(true);
  });

  it("keeps non-kz prefixes like official de_ maps", () => {
    expect(isStorableMapName("de_dust2")).toBe(true);
    expect(isStorableMapName("de_mirage")).toBe(true);
  });

  it("keeps prefix-less names", () => {
    expect(isStorableMapName("dust2")).toBe(true);
  });

  it("rejects a leading digit", () => {
    expect(isStorableMapName("2fort")).toBe(false);
    expect(isStorableMapName("152_ladders")).toBe(false);
  });

  it("rejects a leading underscore", () => {
    expect(isStorableMapName("_kz_x")).toBe(false);
  });

  it("rejects uppercase letters anywhere in the name", () => {
    expect(isStorableMapName("KZ_x")).toBe(false);
    expect(isStorableMapName("de_Mirage")).toBe(false);
  });

  it("rejects separators other than underscores", () => {
    expect(isStorableMapName("de-dust2")).toBe(false);
    expect(isStorableMapName("my map")).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(isStorableMapName("")).toBe(false);
  });
});
