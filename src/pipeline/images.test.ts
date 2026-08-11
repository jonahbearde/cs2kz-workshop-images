import { describe, expect, it } from "vitest";
import { originalImageUrl } from "./images.js";

describe("originalImageUrl", () => {
  it("strips the full query string while keeping the trailing slash", () => {
    expect(
      originalImageUrl(
        "https://steamusercontent-a.akamaihd.net/ugc/1234/ABCDEF.jpg/?imw=512&imh=512&ima=fit&impolicy=Letterbox&imcolor=000000",
      ),
    ).toBe("https://steamusercontent-a.akamaihd.net/ugc/1234/ABCDEF.jpg/");
  });

  it("keeps the trailing slash even when the only parameter is a token", () => {
    expect(
      originalImageUrl("https://example.com/ugc/9/xyz.png/?t=abcdef"),
    ).toBe("https://example.com/ugc/9/xyz.png/");
  });

  it("leaves a trailing-slash URL without a query string unchanged", () => {
    expect(
      originalImageUrl("https://steamusercontent-a.akamaihd.net/ugc/1234/ABCDEF.jpg/"),
    ).toBe("https://steamusercontent-a.akamaihd.net/ugc/1234/ABCDEF.jpg/");
  });

  it("leaves a URL without a trailing slash and without a query string unchanged", () => {
    expect(originalImageUrl("https://example.com/ugc/1/abc.webp")).toBe(
      "https://example.com/ugc/1/abc.webp",
    );
  });

  it("strips a trailing slash-less query string without inventing a slash", () => {
    expect(originalImageUrl("https://example.com/ugc/1/abc.png?imw=64")).toBe(
      "https://example.com/ugc/1/abc.png",
    );
  });

  it("drops a fragment along with the query string", () => {
    expect(originalImageUrl("https://example.com/a.jpg/?imw=64#frag")).toBe(
      "https://example.com/a.jpg/",
    );
  });

  it("returns the empty string unchanged (no preview image)", () => {
    expect(originalImageUrl("")).toBe("");
  });
});
