import { describe, expect, it } from "vitest";

import { judge, newWatch, waitForRestart, type Health } from "./restart";

const OLD: Health = { boot_id: "old", pid: 10, version: "1.0.0" };
const NEW: Health = { boot_id: "new", pid: 11, version: "1.1.0" };

describe("judging a probe", () => {
  it("keeps waiting while the old process still answers", () => {
    const watch = newWatch("old");
    expect(judge(watch, OLD)).toBe("waiting");
  });

  it("notes the service going down, then verifies once it is back", () => {
    const watch = newWatch("old");
    expect(judge(watch, null)).toBe("down");
    expect(judge(watch, OLD)).toBe("verifying");
  });

  it("is done only when the process changed and the expected version runs", () => {
    const watch = newWatch("old", "1.1.0");
    expect(judge(watch, { ...NEW, version: "1.0.0" })).toBe("wrong_version");
    expect(judge(watch, NEW)).toBe("done");
  });

  it("treats the first answer after a downtime as the new process when the old identity was never learned", () => {
    const watch = newWatch(null);
    judge(watch, null);
    expect(judge(watch, NEW)).toBe("done");
  });

  it("ignores a dash as the expected version", () => {
    expect(newWatch("old", "—").expectedVersion).toBe("");
  });
});

function scripted(answers: (Health | null)[]) {
  const queue = [...answers];
  return async () => (queue.length > 1 ? (queue.shift() ?? null) : (queue[0] ?? null));
}

const instant = async () => {};

describe("waiting for the restart", () => {
  it("resolves with the new process after the downtime", async () => {
    const states: string[] = [];
    const health = await waitForRestart({
      preBootId: "old",
      signal: new AbortController().signal,
      probe: scripted([OLD, OLD, null, null, NEW]),
      sleep: instant,
      onState: (s) => states.push(s.verdict),
    });
    expect(health).toEqual(NEW);
    expect(states).toContain("down");
  });

  it("finishes at once when the new process already answers on the first probe", async () => {
    const health = await waitForRestart({
      preBootId: "old",
      signal: new AbortController().signal,
      probe: scripted([NEW]),
      sleep: instant,
      onState: () => {},
    });
    expect(health).toEqual(NEW);
  });

  it("stops when the job reports something other than «awaiting restart»", async () => {
    let calls = 0;
    const health = await waitForRestart({
      preBootId: "old",
      signal: new AbortController().signal,
      probe: scripted([OLD]),
      sleep: instant,
      onState: () => {},
      onWaiting: async () => ++calls >= 2,
    });
    expect(health).toBeNull();
    expect(calls).toBe(2);
  });

  it("returns null when aborted", async () => {
    const controller = new AbortController();
    const result = waitForRestart({
      preBootId: "old",
      signal: controller.signal,
      probe: scripted([OLD]),
      sleep: async () => controller.abort(),
      onState: () => {},
    });
    expect(await result).toBeNull();
  });

  it("waits for the expected version before finishing", async () => {
    const health = await waitForRestart({
      preBootId: "old",
      expectedVersion: "1.1.0",
      signal: new AbortController().signal,
      probe: scripted([OLD, { ...NEW, version: "1.0.0" }, NEW]),
      sleep: instant,
      onState: () => {},
    });
    expect(health?.version).toBe("1.1.0");
  });
});
