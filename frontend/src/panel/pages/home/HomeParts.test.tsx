import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DismissDialog } from "./DismissDialog";
import { fa } from "../../core/format";
import { KpiStrip, QueueRow, StatusTiles, WorkQueue } from "./HomeParts";
import type { HomeWidgets } from "./types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const kpi = (links: HomeWidgets["kpi"]["links"]): HomeWidgets["kpi"] => ({
  sales_today: 125000,
  sales_compare: true,
  sales_today_change_pct: 20,
  new_users_today: 3,
  new_users_week: 11,
  pending: 2,
  tickets: 0,
  links,
});

describe("KpiStrip", () => {
  it("links the receipt and ticket cards only for staff who may open them", () => {
    const { container, rerender } = render(<KpiStrip kpi={kpi({ payments: true, tickets: false })} />);
    const hrefs = () => [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs()).toEqual(["/finance?tab=payments"]);
    rerender(<KpiStrip kpi={kpi({ payments: false, tickets: true })} />);
    expect(hrefs()).toEqual(["/tickets"]);
    rerender(<KpiStrip kpi={kpi({ payments: false, tickets: false })} />);
    expect(hrefs()).toEqual([]);
  });

  it("shows today's sales with the change against yesterday", () => {
    render(<KpiStrip kpi={kpi({ payments: false, tickets: false })} />);
    expect(screen.getByText(fa(125000))).toBeTruthy();
    expect(screen.getByText(`▲ ${fa(20)}٪ نسبت به دیروز`)).toBeTruthy();
  });

  it("says nothing about yesterday when the page has no trend", () => {
    render(<KpiStrip kpi={{ ...kpi({ payments: false, tickets: false }), sales_compare: false }} />);
    expect(screen.queryByText(/نسبت به دیروز/)).toBeNull();
  });
});

describe("StatusTiles", () => {
  it("labels each connection's state for assistive technology", () => {
    render(
      <StatusTiles
        tiles={[
          { id: "bot", name: "ربات تلگرام", detail: "@mybot", state: "ok", href: "/settings?tab=bot" },
          { id: "pg", name: "پاسارگارد", detail: "بررسی نشده", state: "neutral", href: "/pg" },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "سالم" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "نامشخص" })).toBeTruthy();
    expect(screen.getByText("بررسی نشده")).toBeTruthy();
  });
});

describe("WorkQueue", () => {
  const entry = { key: "pending", title: "۲ رسید در انتظار", detail: "تأیید یا رد پرداخت‌ها", href: "/finance?tab=payments", tone: "warn" };

  it("shows the empty state when nothing waits", () => {
    render(<WorkQueue queue={{ has_items: false, entries: [], pending: 0, tickets: 0 }} onDismiss={() => undefined} />);
    expect(screen.getByText("صف کار خالی است")).toBeTruthy();
  });

  it("links each entry and offers its dismissal", () => {
    const onDismiss = vi.fn();
    render(<QueueRow entry={entry} onDismiss={onDismiss} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/finance?tab=payments");
    fireEvent.click(screen.getByRole("button", { name: /حذف اعلان/ }));
    expect(onDismiss).toHaveBeenCalledWith(entry);
  });
});

describe("DismissDialog", () => {
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

  it("posts the dismiss form with the 24 hour mode by default and reports back", async () => {
    const calls = fakeServer({ ok: true, message: "اعلان مخفی شد", location: "/inbox" });
    const onDone = vi.fn();
    const onClose = vi.fn();
    render(<DismissDialog target={{ key: "ac:pending", entity: "" }} onClose={onClose} onDone={onDone} />);
    fireEvent.click(await screen.findByRole("button", { name: "تأیید" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(calls[0].path).toBe("/inbox/dismiss");
    expect(Object.fromEntries(calls[0].body.entries())).toMatchObject({ alert_key: "ac:pending", mode: "24h", entity_id: "" });
  });

  it("keeps the dialog open when the server refuses", async () => {
    fakeServer({ ok: false, message: "اعلان نامعتبر" });
    const onDone = vi.fn();
    render(<DismissDialog target={{ key: "nope", entity: "" }} onClose={() => undefined} onDone={onDone} />);
    fireEvent.click(await screen.findByRole("button", { name: "تأیید" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "تأیید" })).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
  });
});
