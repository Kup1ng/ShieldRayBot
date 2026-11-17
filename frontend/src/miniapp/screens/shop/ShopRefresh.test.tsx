import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { invalidateAllResources } from "../../state/resources";
import { fakeApi, renderMini, type FakeHandler } from "../../test/harness";
import { ScreenRouter } from "../ScreenRouter";
import { SheetOutlet, meWithWallet, stubBrowserConfirm } from "./shopTestKit";

const PLANS = {
  wallet_pay_enabled: true,
  plans: [{ id: 1, name: "الف", price: 100000, days: 30, gb: 50, is_trial: false }],
};
const CHECKOUT = { order_id: 77, amount: 80000, original_amount: 100000, discount: 20000, code: "OFF20" };

function shop(extra: Record<string, FakeHandler> = {}) {
  const me = meWithWallet(100000);
  const api = fakeApi({
    "GET /api/mini/plans": () => ({ json: PLANS }),
    "GET /api/mini/me": () => ({ json: me }),
    "GET /api/mini/activity": () => ({ json: { items: [] } }),
    "POST /api/mini/checkout": () => ({ json: { checkout: CHECKOUT } }),
    "POST /api/mini/checkout/77/cancel": () => ({ json: { ok: true } }),
    ...extra,
  });
  renderMini(
    <>
      <ScreenRouter />
      <SheetOutlet />
    </>,
    { me, route: { view: "shop" } },
  );
  return api;
}

async function withDiscount(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "بعدی" }));
  await user.type(await screen.findByRole("textbox", { name: /کد تخفیف/ }), "OFF20");
  await user.click(screen.getByRole("button", { name: "اعمال" }));
  await screen.findByRole("button", { name: /حذف کد و انصراف/ });
}

describe("refreshing the shop", () => {
  it("keeps the discounted order and the checkout on screen while the catalog reloads", async () => {
    const user = userEvent.setup();
    const api = shop();
    await withDiscount(user);

    await act(async () => {
      invalidateAllResources();
    });

    expect(api.callsTo("POST", "/api/mini/checkout/77/cancel")).toHaveLength(0);
    expect(await screen.findByRole("button", { name: /حذف کد و انصراف/ })).toBeTruthy();
  });

  it("never cancels an order whose payment is still on its way", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    let settle: () => void = () => undefined;
    const paid = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const api = shop({
      "POST /api/mini/checkout/77/pay": async () => {
        await paid;
        return { json: { ok: true, message: "خرید انجام شد" } };
      },
    });
    await withDiscount(user);
    await user.click(screen.getByRole("button", { name: /پرداخت/ }));

    await act(async () => {
      invalidateAllResources();
    });
    settle();

    expect(api.callsTo("POST", "/api/mini/checkout/77/cancel")).toHaveLength(0);
    expect(api.callsTo("POST", "/api/mini/checkout/77/pay")).toHaveLength(1);
  });
});
