import { describe, expect, it } from "vitest";
import { makeItem } from "./fixtures.js";
import { pickWinners } from "./winners.js";

describe("pickWinners", () => {
  it("returns an empty map for no input", () => {
    expect(pickWinners([])).toEqual(new Map());
  });

  it("maps a single legal name to its only item", () => {
    const item = makeItem({ id: "1", title: "kz_ozark" });
    expect(pickWinners([item])).toEqual(new Map([["kz_ozark", item]]));
  });

  it("picks the most recently updated item among same-named items", () => {
    const older = makeItem({ id: "1", title: "kz_ozark", timeUpdated: 1_700_000_000 });
    const newer = makeItem({ id: "2", title: "kz_ozark", timeUpdated: 1_700_000_500 });
    expect(pickWinners([older, newer])).toEqual(new Map([["kz_ozark", newer]]));
    // order of the input must not matter
    expect(pickWinners([newer, older])).toEqual(new Map([["kz_ozark", newer]]));
  });

  it("keeps distinct names independent", () => {
    const a = makeItem({ id: "1", title: "kz_a" });
    const b = makeItem({ id: "2", title: "kz_b" });
    expect(pickWinners([a, b])).toEqual(
      new Map([
        ["kz_a", a],
        ["kz_b", b],
      ]),
    );
  });

  it("breaks a time_updated tie deterministically (higher publishedfileid wins)", () => {
    const tie = 1_700_000_000;
    const highId = makeItem({ id: "999", title: "kz_tie", timeUpdated: tie });
    const lowId = makeItem({ id: "42", title: "kz_tie", timeUpdated: tie });
    expect(pickWinners([highId, lowId])).toEqual(new Map([["kz_tie", highId]]));
    expect(pickWinners([lowId, highId])).toEqual(new Map([["kz_tie", highId]]));
  });
});
