import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LinkHealthCard, RECONNECT_PATH } from "./HomeParts";
import type { LinkHealth } from "./types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const health = (patch: Partial<LinkHealth> = {}): LinkHealth => ({
  tone: "warning",
  label: "ناپایدار",
  latency_p50_ms: 40,
  latency_p95_ms: 90,
  last_ok_time: "10:00:00",
  last_failure_time: null,
  paused: false,
  retry_in_sec: 0,
  recent_failures: [],
  can_reconnect: true,
  budget_exhaustion: null,
  prior_boot_note: null,
  ...patch,
});

function fakeServer(reply: unknown) {
  const calls: { path: string; body: FormData }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit) => {
      calls.push({ path, body: init.body as FormData });
      return new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  return calls;
}

describe("LinkHealthCard reconnect", () => {
  it("offers the reconnect action only when the server says the viewer may use it", () => {
    const { rerender } = render(<LinkHealthCard health={health()} />);
    expect(screen.getByRole("button", { name: "ارتباط مجدد با پاسارگارد" })).toBeTruthy();
    rerender(<LinkHealthCard health={health({ can_reconnect: false })} />);
    expect(screen.queryByRole("button", { name: "ارتباط مجدد با پاسارگارد" })).toBeNull();
  });

  it("posts nothing when the Owner declines the confirmation", async () => {
    const calls = fakeServer({ ok: true });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onReconnected = vi.fn();
    render(<LinkHealthCard health={health()} onReconnected={onReconnected} />);
    fireEvent.click(screen.getByRole("button", { name: "ارتباط مجدد با پاسارگارد" }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(calls).toEqual([]);
    expect(onReconnected).not.toHaveBeenCalled();
  });

  it("posts the reconnect form after confirmation and reloads the card", async () => {
    const calls = fakeServer({ ok: true, message: "اتصال برقرار شد (۴۰ ms)", location: "/home" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onReconnected = vi.fn();
    render(<LinkHealthCard health={health()} onReconnected={onReconnected} />);
    fireEvent.click(screen.getByRole("button", { name: "ارتباط مجدد با پاسارگارد" }));
    await waitFor(() => expect(onReconnected).toHaveBeenCalled());
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe(RECONNECT_PATH);
  });
});

describe("LinkHealthCard details", () => {
  it("shows the budget exhaustion count and the prior-boot note when present", () => {
    render(<LinkHealthCard health={health({ budget_exhaustion: { label: "سقف زمان خواندن", count: 3 }, prior_boot_note: "آمار پیش از ری‌استارت" })} />);
    expect(screen.getByText("سقف زمان خواندن")).toBeTruthy();
    expect(screen.getByText("آمار پیش از ری‌استارت")).toBeTruthy();
    expect(screen.queryByText(/از صفر شروع می‌شود/)).toBeNull();
  });

  it("falls back to the usual restart note and hides the budget row", () => {
    render(<LinkHealthCard health={health()} />);
    expect(screen.getByText(/از صفر شروع می‌شود/)).toBeTruthy();
    expect(screen.queryByText("سقف زمان خواندن")).toBeNull();
  });

  it("renders hostile failure labels as text", () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const { container } = render(<LinkHealthCard health={health({ recent_failures: [{ label: hostile, count: 1 }] })} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(hostile)).toBeTruthy();
  });
});
