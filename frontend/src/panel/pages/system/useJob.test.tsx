import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelGet: (path: string) => get(path) };
});

import { phaseOf, useJob } from "./useJob";
import type { JobStatus } from "./types";

const IDLE: JobStatus = { state: "idle" };
const RUNNING: JobStatus = { state: "running", percent: 30, message: "در حال اجرا" };
const AWAITING: JobStatus = { state: "done", awaiting_restart: true, pre_boot_id: "old" };

beforeEach(() => {
  get.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("job phase", () => {
  it("reads the phase from the status file", () => {
    expect(phaseOf(null)).toBe("idle");
    expect(phaseOf(IDLE)).toBe("idle");
    expect(phaseOf(RUNNING)).toBe("running");
    expect(phaseOf(AWAITING)).toBe("restarting");
    expect(phaseOf({ state: "error" })).toBe("error");
    expect(phaseOf({ state: "done", restart_required: true })).toBe("error");
    expect(phaseOf({ state: "done" })).toBe("done");
  });
});

describe("following a job", () => {
  it("settles with the final status when a running job finishes, without posting anything", async () => {
    get.mockResolvedValueOnce(RUNNING).mockResolvedValue({ state: "done", message: "تمام شد" });
    const onSettled = vi.fn();
    const { result } = renderHook(() => useJob({ statusUrl: "/update/status", initial: RUNNING, onRestarted: vi.fn(), onSettled }));
    expect(result.current.phase).toBe("running");
    await waitFor(() => expect(onSettled).toHaveBeenCalledWith("done", expect.objectContaining({ state: "done" })), { timeout: 4000 });
  });

  it("does not poll while nothing runs until told to follow", async () => {
    const { result } = renderHook(() => useJob({ statusUrl: "/update/status", initial: IDLE, onRestarted: vi.fn(), onSettled: vi.fn() }));
    expect(get).not.toHaveBeenCalled();
    get.mockResolvedValue({ state: "error", message: "ناموفق" });
    act(() => result.current.follow());
    await waitFor(() => expect(result.current.phase).toBe("error"));
  });

  it("waits for a new process after the job asks for a restart, then reports it once", async () => {
    const answers = [{ boot_id: "old", pid: 1, version: "1.0.0" }, { boot_id: "old", pid: 1, version: "1.0.0" }, { boot_id: "new", pid: 2, version: "1.1.0" }];
    const fetchMock = vi.fn(async () => {
      const next = answers.length > 1 ? answers.shift() : answers[0];
      return { ok: true, json: async () => next } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    get.mockResolvedValue(AWAITING);
    const onRestarted = vi.fn();
    const { result } = renderHook(() => useJob({ statusUrl: "/backup/status", initial: AWAITING, onRestarted, onSettled: vi.fn() }));
    expect(result.current.phase).toBe("restarting");
    await waitFor(() => expect(onRestarted).toHaveBeenCalledTimes(1), { timeout: 8000 });
    expect(onRestarted.mock.calls[0][0]).toEqual({ boot_id: "new", pid: 2, version: "1.1.0" });
  }, 12000);
});
