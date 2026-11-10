import { describe, expect, it } from "bun:test";
import { runExclusive } from "@/lib/run-exclusive";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("run exclusive", () => {
  it("never overlaps tasks that share a key, and keeps their order", async () => {
    const log: string[] = [];
    let running = 0;
    let overlapped = false;
    const task = (name: string, ms: number) => async () => {
      running += 1;
      if (running > 1) overlapped = true;
      log.push(`start ${name}`);
      await sleep(ms);
      log.push(`end ${name}`);
      running -= 1;
      return name;
    };
    const results = await Promise.all([
      runExclusive("admin-1", task("a", 20)),
      runExclusive("admin-1", task("b", 5)),
      runExclusive("admin-1", task("c", 1)),
    ]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(overlapped).toBe(false);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("lets different keys run at the same time", async () => {
    let running = 0;
    let peak = 0;
    const task = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await sleep(15);
      running -= 1;
    };
    await Promise.all([runExclusive("x", task), runExclusive("y", task)]);
    expect(peak).toBe(2);
  });

  it("keeps going after a task fails, and hands the failure to its own caller only", async () => {
    const failing = runExclusive("k", async () => {
      throw new Error("boom");
    });
    const next = runExclusive("k", async () => "still runs");
    await expect(failing).rejects.toThrow("boom");
    expect(await next).toBe("still runs");
  });

  it("copes with a task that throws before returning a promise", async () => {
    const failing = runExclusive("sync", (() => {
      throw new Error("sync boom");
    }) as () => Promise<string>);
    await expect(failing).rejects.toThrow("sync boom");
    expect(await runExclusive("sync", async () => "ok")).toBe("ok");
  });
});
