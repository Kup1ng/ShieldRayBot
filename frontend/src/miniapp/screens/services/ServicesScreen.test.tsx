import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fakeApi, renderMini } from "../../test/harness";
import "../../test/telegram";
import { daysTone } from "../../ui/status";
import { RouteProbe, currentView } from "../shop/shopTestKit";
import { ServicesScreen } from "./ServicesScreen";

const row = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  username: `svc${id}`,
  status: "active",
  status_fa: "فعال",
  traffic: "1 از 10 گیگ",
  traffic_pct: 10,
  expire_days: 20,
  expire_days_label: "۲۰ روز",
  ...extra,
});

const rowOf = (name: string) => screen.getByRole("button", { name: `سرویس ${name}` });

describe("services list", () => {
  it("pages with before_id, and stops asking once the last page is in", async () => {
    const api = fakeApi({
      "GET /api/mini/services": () => ({ json: { items: [row(9), row(8)], next_before_id: 8 } }),
      "GET /api/mini/services?before_id=8": () => ({ json: { items: [row(3)], next_before_id: null } }),
    });
    renderMini(<ServicesScreen />);
    await screen.findByRole("button", { name: "سرویس svc9" });
    await userEvent.setup().click(screen.getByRole("button", { name: "سرویس‌های بیشتر" }));
    await screen.findByRole("button", { name: "سرویس svc3" });
    expect(screen.getAllByRole("listitem").length).toBe(3);
    expect(api.calls.filter((c) => c.path.startsWith("/api/mini/services")).map((c) => c.path)).toEqual(["/api/mini/services", "/api/mini/services?before_id=8"]);
    expect(screen.queryByRole("button", { name: "سرویس‌های بیشتر" })).toBeNull();
    expect(api.calls.length).toBe(2);
  });

  it("searches by name and replaces the list with the matches", async () => {
    const api = fakeApi({
      "GET /api/mini/services": () => ({ json: { items: [row(9), row(3)], next_before_id: null } }),
      "GET /api/mini/services?q=svc3": () => ({ json: { items: [row(3)], next_before_id: null } }),
    });
    renderMini(<ServicesScreen />);
    await screen.findByRole("button", { name: "سرویس svc9" });
    await userEvent.setup().type(screen.getByRole("searchbox", { name: "جست‌وجوی نام سرویس" }), "svc3");
    await waitFor(() => expect(screen.queryByRole("button", { name: "سرویس svc9" })).toBeNull(), { timeout: 3000 });
    expect(screen.getByRole("button", { name: "سرویس svc3" })).toBeTruthy();
    expect(api.callsTo("GET", "/api/mini/services?q=svc3").length).toBe(1);
  });

  it("says so when nothing matches, and invites a first purchase when there are no services", async () => {
    fakeApi({ "GET /api/mini/services": () => ({ json: { items: [], next_before_id: null } }) });
    renderMini(<ServicesScreen />);
    expect(await screen.findByText("هنوز سرویسی ندارید.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /خرید سرویس/ })).toBeTruthy();
  });

  it("shows a Persian error with a retry when the list cannot load", async () => {
    let fail = true;
    fakeApi({ "GET /api/mini/services": () => (fail ? { status: 500, json: { detail: "Traceback: boom" } } : { json: { items: [row(1)], next_before_id: null } }) });
    renderMini(<ServicesScreen />);
    expect(await screen.findByText(/دوباره تلاش کنید/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("Traceback");
    fail = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "تلاش دوباره" }));
    expect(await screen.findByRole("button", { name: "سرویس svc1" })).toBeTruthy();
  });

  it("lists plain rows: the name with a status dot, a scrollable list, and the panel's own search field", async () => {
    fakeApi({
      "GET /api/mini/services": () => ({
        json: {
          items: [row(1, { username: "alpha" }), row(2, { username: "beta", status: "expired", status_fa: "منقضی" }), row(3, { username: "gamma", error: "timeout", error_message: "پنل پاسخ نداد." })],
          next_before_id: null,
        },
      }),
    });
    renderMini(<ServicesScreen />);
    await screen.findByRole("button", { name: "سرویس alpha" });
    // Names only: usage and days live on the service page.
    expect(within(rowOf("alpha")).queryByText(/گیگ|روز/)).toBeNull();
    expect(rowOf("alpha").querySelector("[class*='bg-success']")).toBeTruthy();
    expect(rowOf("beta").querySelector("[class*='bg-danger']")).toBeTruthy();
    expect(within(rowOf("gamma")).getByText("پنل پاسخ نداد.")).toBeTruthy();
    const panel = screen.getByRole("region", { name: "سرویس‌های من" });
    expect(within(panel).getByRole("searchbox", { name: "جست‌وجوی نام سرویس" })).toBeTruthy();
    expect(within(panel).getByRole("list").parentElement?.className).toContain("overflow-y-auto");
  });

  it("opens a service from its row", async () => {
    fakeApi({ "GET /api/mini/services": () => ({ json: { items: [row(4, { username: "delta" })], next_before_id: null } }) });
    renderMini(
      <>
        <ServicesScreen />
        <RouteProbe />
      </>,
    );
    await userEvent.setup().click(await screen.findByRole("button", { name: "سرویس delta" }));
    expect(currentView()).toBe("service");
  });
});

describe("days left colour", () => {
  it("turns amber within three days and red on the last day; unknown time stays neutral", () => {
    expect(daysTone(1)).toBe("danger");
    expect(daysTone(0)).toBe("danger");
    expect(daysTone(3)).toBe("warning");
    expect(daysTone(10)).toBe("default");
    expect(daysTone(null)).toBe("default");
    expect(daysTone(undefined)).toBe("default");
  });
});
