import { toast } from "@heroui/react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pathId, redirectTarget, useJson, useQuery, useUrlFlash } from "./data";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("redirectTarget", () => {
  it("follows same-site paths only", () => {
    expect(redirectTarget({ redirect: "/pg" })).toBe("/pg");
    expect(redirectTarget({ redirect: "//evil.test" })).toBeNull();
    expect(redirectTarget({ redirect: "https://evil.test" })).toBeNull();
    expect(redirectTarget({})).toBeNull();
    expect(redirectTarget(null)).toBeNull();
  });
});

describe("useJson", () => {
  it("loads the endpoint and reloads on demand without dropping what is shown", async () => {
    const fetchMock = vi.fn(async () => reply({ n: fetchMock.mock.calls.length }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useJson<{ n: number }>("/api/panel/x"));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));
    act(() => result.current.reload());
    expect(result.current.data).toEqual({ n: 1 });
    await waitFor(() => expect(result.current.data).toEqual({ n: 2 }));
    expect(result.current.status).toBe("ready");
  });

  it("shows the server's Persian message and keeps no data on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ detail: "دسترسی ندارید" }, 403)));
    const { result } = renderHook(() => useJson("/api/panel/x"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toMatchObject({ message: "دسترسی ندارید", data: null });
  });

  it("keeps the last answer on screen when a reload fails", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (++calls === 1 ? reply({ ok: 1 }) : reply({ detail: "خطای موقت" }, 500))),
    );
    const { result } = renderHook(() => useJson<{ ok: number }>("/api/panel/x"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.data).toEqual({ ok: 1 });
  });

  it("navigates away when the endpoint answers with a redirect", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ redirect: "/security" })));
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const { result } = renderHook(() => useJson("/api/panel/home"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/security"));
    expect(result.current.data).toBeNull();
  });

  it("waits while the path is null", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useJson(null));
    expect(result.current.status).toBe("loading");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops the old answer for a new path unless keepPrevious is set", async () => {
    vi.stubGlobal("fetch", vi.fn(async (path: string) => reply({ path })));
    const plain = renderHook(({ path }) => useJson<{ path: string }>(path), { initialProps: { path: "/a" } });
    await waitFor(() => expect(plain.result.current.data).toEqual({ path: "/a" }));
    plain.rerender({ path: "/b" });
    await waitFor(() => expect(plain.result.current.data).toEqual({ path: "/b" }));

    const kept = renderHook(({ path }) => useJson<{ path: string }>(path, { keepPrevious: true }), { initialProps: { path: "/a" } });
    await waitFor(() => expect(kept.result.current.data).toEqual({ path: "/a" }));
    kept.rerender({ path: "/b" });
    expect(kept.result.current.data).toEqual({ path: "/a" });
    await waitFor(() => expect(kept.result.current.data).toEqual({ path: "/b" }));
  });
});

describe("useQuery", () => {
  it("sets and drops keys, keeping the others", () => {
    window.history.replaceState(null, "", "/users?filter=expiring&q=ali");
    const { result } = renderHook(() => useQuery());
    expect(result.current.get("q")).toBe("ali");
    act(() => result.current.set({ q: null, page: "2" }));
    expect(window.location.search).toBe("?filter=expiring&page=2");
    expect(result.current.get("page")).toBe("2");
    act(() => result.current.set({ filter: "" }, { replace: true }));
    expect(window.location.search).toBe("?page=2");
  });
});

describe("useUrlFlash", () => {
  it("shows the handler's message once and removes it from the address", () => {
    const success = vi.spyOn(toast, "success").mockReturnValue("t");
    window.history.replaceState(null, "", "/plans?tab=users&ok=%D8%B0%D8%AE%DB%8C%D8%B1%D9%87&_=1700000000");
    renderHook(() => useUrlFlash());
    expect(success).toHaveBeenCalledWith("ذخیره");
    expect(window.location.search).toBe("?tab=users");
  });

  it("turns the ok=1 flag into a short confirmation and never shows internal ASCII text", () => {
    const success = vi.spyOn(toast, "success").mockReturnValue("t");
    const danger = vi.spyOn(toast, "danger").mockReturnValue("t");
    window.history.replaceState(null, "", "/plans?err=Traceback&ok=1");
    renderHook(() => useUrlFlash());
    expect(danger).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledWith("انجام شد.");
  });
});

describe("pathId", () => {
  it("reads a positive id from a detail address", () => {
    const edit = /^\/users\/(\d+)\/edit$/;
    expect(pathId("/users/12/edit", edit)).toBe(12);
    expect(pathId("/users/0/edit", edit)).toBeNull();
    expect(pathId("/users/x/edit", edit)).toBeNull();
  });
});
