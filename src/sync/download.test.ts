import { describe, expect, it, vi } from "vitest";
import { downloadAll, type DownloadDeps, type DownloadTask } from "./download.js";

function deps(overrides: Partial<DownloadDeps> = {}): {
  deps: DownloadDeps;
  written: { name: string; bytes: Buffer }[];
  sleeps: number[];
} {
  const written: { name: string; bytes: Buffer }[] = [];
  const sleeps: number[] = [];
  return {
    deps: {
      download: overrides.download ?? (async (url) => Buffer.from(`jpeg-bytes-of:${url}`)),
      write:
        overrides.write ??
        (async (name, bytes) => {
          written.push({ name, bytes });
        }),
      sleep: overrides.sleep ?? (async (ms) => void sleeps.push(ms)),
    },
    written,
    sleeps,
  };
}

const missing = (name: string, url = `https://ugc.example/${name}.jpg/`): DownloadTask => ({
  name,
  previewUrl: url,
  kind: "missing",
});
const stale = (name: string, url = `https://ugc.example/${name}.jpg/`): DownloadTask => ({
  name,
  previewUrl: url,
  kind: "stale",
});

describe("downloadAll", () => {
  it("returns an empty outcome for no tasks, without calling anything", async () => {
    const download = vi.fn();
    const { deps: downloadDeps, written } = deps({ download });

    const outcome = await downloadAll([], downloadDeps);

    expect(outcome).toEqual({ downloaded: [], updated: [], failures: [] });
    expect(download).not.toHaveBeenCalled();
    expect(written).toEqual([]);
  });

  it("downloads missing tasks and classifies them as downloaded", async () => {
    const { deps: downloadDeps, written } = deps();

    const outcome = await downloadAll([missing("kz_a"), missing("kz_b")], downloadDeps);

    expect(outcome.downloaded).toEqual(["kz_a", "kz_b"]);
    expect(outcome.updated).toEqual([]);
    expect(outcome.failures).toEqual([]);
    expect(written.map((w) => w.name)).toEqual(["kz_a", "kz_b"]);
    expect(written[0]!.bytes).toEqual(Buffer.from("jpeg-bytes-of:https://ugc.example/kz_a.jpg/"));
  });

  it("classifies stale tasks as updated", async () => {
    const { deps: downloadDeps } = deps();

    const outcome = await downloadAll([stale("kz_old")], downloadDeps);

    expect(outcome).toEqual({ downloaded: [], updated: ["kz_old"], failures: [] });
  });

  it("retries a transient failure and succeeds within the attempt budget", async () => {
    const download = vi
      .fn(async () => {
        if (download.mock.calls.length < 3) throw new Error("HTTP 503 from https://ugc.example/kz_a.jpg/");
        return Buffer.from("ok");
      });
    const { deps: downloadDeps, sleeps } = deps({ download });

    const outcome = await downloadAll([missing("kz_a")], downloadDeps);

    expect(outcome.downloaded).toEqual(["kz_a"]);
    expect(download).toHaveBeenCalledTimes(3);
    // a delay between attempts, none after the successful one
    expect(sleeps).toEqual([2000, 2000]);
  });

  it("records a failure after exhausting all three attempts, with the last reason", async () => {
    const download = vi.fn(async () => {
      throw new Error("HTTP 500 from https://ugc.example/kz_a.jpg/");
    });
    const { deps: downloadDeps, sleeps, written } = deps({ download });

    const outcome = await downloadAll([missing("kz_a")], downloadDeps);

    expect(outcome.downloaded).toEqual([]);
    expect(outcome.failures).toEqual([
      { name: "kz_a", reason: "HTTP 500 from https://ugc.example/kz_a.jpg/" },
    ]);
    expect(download).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([2000, 2000]);
    expect(written).toEqual([]);
  });

  it("never sleeps after the final attempt of a permanently failing task", async () => {
    const { deps: downloadDeps, sleeps } = deps({
      download: async () => {
        throw new Error("boom");
      },
    });

    await downloadAll([missing("kz_a")], downloadDeps);

    expect(sleeps).toHaveLength(2);
  });

  it("keeps going after one task fails, processing tasks in order", async () => {
    const download = vi.fn(async (url: string) => {
      if (url.includes("bad")) throw new Error("boom");
      return Buffer.from(url);
    });
    const { deps: downloadDeps, written } = deps({ download });

    const outcome = await downloadAll([missing("kz_bad"), missing("kz_good"), stale("kz_fresh")], downloadDeps);

    expect(outcome.downloaded).toEqual(["kz_good"]);
    expect(outcome.updated).toEqual(["kz_fresh"]);
    expect(outcome.failures.map((f) => f.name)).toEqual(["kz_bad"]);
    expect(written.map((w) => w.name)).toEqual(["kz_good", "kz_fresh"]);
  });

  it("records a write failure as a download failure for that task", async () => {
    const { deps: downloadDeps } = deps({
      write: async () => {
        throw new Error("ENOSPC: no space left on device");
      },
    });

    const outcome = await downloadAll([missing("kz_a")], downloadDeps);

    expect(outcome.failures).toEqual([{ name: "kz_a", reason: "ENOSPC: no space left on device" }]);
  });

  it("truncates failure reasons that would blow Telegram's line budget", async () => {
    const huge = "x".repeat(10_000);
    const { deps: downloadDeps } = deps({
      download: async () => {
        throw new Error(huge);
      },
    });

    const outcome = await downloadAll([missing("kz_a")], downloadDeps);

    expect(outcome.failures[0]!.reason.length).toBeLessThanOrEqual(301);
    expect(outcome.failures[0]!.reason.endsWith("…")).toBe(true);
  });
});
