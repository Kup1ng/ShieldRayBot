import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { customerMe, fakeApi, renderMini } from "../../test/harness";
import { ScreenRouter } from "../ScreenRouter";
import { RouteProbe, currentView, stubBrowserConfirm } from "../shop/shopTestKit";
import { OFFER_PATH } from "./importKit";

const PLANS = {
  wallet_pay_enabled: true,
  plans: [
    { id: 1, name: "تست یک‌روزه", price: 0, days: 1, gb: 1, is_trial: true },
    { id: 2, name: "ماهانه", price: 80000, days: 30, gb: 50, is_trial: false },
  ],
};

/** The home offer's trial through the shop's own purchase flow, from tap to the result ticket. */
describe("taking the free trial from the home offer", () => {
  it("opens the shop on the trial, buys it once, and keeps the result after the offer is gone", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    let taken = false;
    const trialed = customerMe();
    trialed.customer.home = { service_count: 1, attention: [], recent: [] };
    const api = fakeApi({
      "GET /api/mini/club": () => ({ json: { club: { enabled: false } } }),
      [`GET ${OFFER_PATH}`]: () => ({ json: taken ? { show: false, import_enabled: false, trial_available: false } : { show: true, import_enabled: true, trial_available: true } }),
      "GET /api/mini/plans": () => ({ json: PLANS }),
      "POST /api/mini/buy": () => {
        taken = true;
        return { json: { ok: true, order_id: 9, wallet: 240000, message: "سرویس تست فعال شد" } };
      },
      // After the purchase the customer has a service, so /me no longer qualifies for the offer.
      "GET /api/mini/me": () => ({ json: taken ? trialed : customerMe() }),
      "GET /api/mini/activity": () => ({ json: { items: [] } }),
    });
    renderMini(
      <>
        <RouteProbe />
        <ScreenRouter />
      </>,
    );

    await user.click(await screen.findByRole("button", { name: "دریافت تست" }));
    expect(currentView()).toBe("shop");
    // The trial plan is already chosen: its terms are shown, and the paid plans' picker is not.
    expect(await screen.findByRole("region", { name: "سرویس تست" })).toBeTruthy();
    expect(screen.getByText("تست یک‌روزه")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "بعدی" }));
    await user.click(await screen.findByRole("button", { name: "دریافت سرویس تست" }));

    const ticket = await screen.findByRole("status", { name: "سرویس تست فعال شد" });
    expect(api.callsTo("POST", "/api/mini/buy")).toHaveLength(1);
    expect(api.callsTo("POST", "/api/mini/buy")[0].body).toMatchObject({ plan_id: 1, price: 0 });
    // The wallet and services were read again, so the customer now has a service and the offer is gone;
    // the result of the trial stays on screen.
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/me").length).toBeGreaterThan(0));
    expect(screen.getByRole("status", { name: "سرویس تست فعال شد" })).toBe(ticket);
    expect(screen.queryByRole("button", { name: "دریافت تست" })).toBeNull();
  });

  it("starts on the paid plans when the shop is opened any other way", async () => {
    fakeApi({
      "GET /api/mini/plans": () => ({ json: PLANS }),
      "GET /api/mini/activity": () => ({ json: { items: [] } }),
    });
    renderMini(<ScreenRouter />, { route: { view: "shop" } });
    expect(await screen.findByRole("region", { name: "انتخاب حجم سرویس" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "سرویس تست" })).toBeNull();
  });

  it("falls back to the paid plans when the shop lists no trial plan", async () => {
    const user = userEvent.setup();
    fakeApi({
      "GET /api/mini/club": () => ({ json: { club: { enabled: false } } }),
      [`GET ${OFFER_PATH}`]: () => ({ json: { show: true, import_enabled: false, trial_available: true } }),
      "GET /api/mini/plans": () => ({ json: { wallet_pay_enabled: true, plans: [PLANS.plans[1]] } }),
    });
    renderMini(<ScreenRouter />);
    await user.click(await screen.findByRole("button", { name: "دریافت تست" }));
    expect(await screen.findByRole("region", { name: "انتخاب حجم سرویس" })).toBeTruthy();
  });
});
