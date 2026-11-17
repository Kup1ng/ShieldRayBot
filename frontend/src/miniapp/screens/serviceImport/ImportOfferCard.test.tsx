import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { customerMe, fakeApi, renderMini, type FakeHandler } from "../../test/harness";
import { HomeScreen } from "../home/HomeScreen";
import { RouteProbe, SheetOutlet } from "../shop/shopTestKit";
import { DISMISS_PATH, IMPORT_PATH, OFFER_PATH } from "./importKit";

const OFFER: FakeHandler = () => ({ json: { show: true } });
const card = () => screen.queryByRole("region", { name: "اتصال اشتراک قبلی" });

function home(routes: Record<string, FakeHandler>, me = customerMe()) {
  const api = fakeApi({ "GET /api/mini/club": () => ({ json: { club: { enabled: false } } }), ...routes });
  const view = renderMini(
    <>
      <RouteProbe />
      <HomeScreen />
      <SheetOutlet />
    </>,
    { me },
  );
  return { api, view };
}

describe("home offer to add a previous service", () => {
  it("shows the card when the server offers it", async () => {
    home({ [`GET ${OFFER_PATH}`]: OFFER });
    expect(await screen.findByRole("region", { name: "اتصال اشتراک قبلی" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "اتصال اشتراک" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "نمایش نده" })).toBeTruthy();
  });

  it("shows nothing when the server does not offer it, or cannot answer", async () => {
    for (const reply of [{ json: { show: false } }, { status: 500, json: { detail: "خطا" } }, "network-error" as const]) {
      const { api, view } = home({ [`GET ${OFFER_PATH}`]: () => reply });
      await waitFor(() => expect(api.callsTo("GET", OFFER_PATH)).toHaveLength(1));
      expect(card()).toBeNull();
      view.unmount();
    }
  });

  it("does not ask when the customer already has a service", async () => {
    const me = customerMe();
    me.customer.home = { service_count: 2, attention: [], recent: [] };
    const { api } = home({ [`GET ${OFFER_PATH}`]: OFFER }, me);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.callsTo("GET", OFFER_PATH)).toHaveLength(0);
    expect(card()).toBeNull();
  });

  it("does not ask in a shop Mini App that has not opened services", async () => {
    const { api } = home({ [`GET ${OFFER_PATH}`]: OFFER }, customerMe({ sections: ["shop", "support"], shop: { name: "s" } }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.callsTo("GET", OFFER_PATH)).toHaveLength(0);
    expect(card()).toBeNull();
  });

  it("«نمایش نده» tells the server once and removes the card", async () => {
    const user = userEvent.setup();
    const { api } = home({ [`GET ${OFFER_PATH}`]: OFFER, [`POST ${DISMISS_PATH}`]: () => ({ json: { dismissed: true } }) });
    await user.click(await screen.findByRole("button", { name: "نمایش نده" }));
    await waitFor(() => expect(card()).toBeNull());
    expect(api.callsTo("POST", DISMISS_PATH)).toHaveLength(1);
    expect(api.callsTo("POST", DISMISS_PATH)[0].body).toEqual({});
    expect((await screen.findAllByText("این پیشنهاد دیگر نمایش داده نمی‌شود")).length).toBeGreaterThan(0);
  });

  it("keeps the card and says so when hiding it failed", async () => {
    const user = userEvent.setup();
    home({ [`GET ${OFFER_PATH}`]: OFFER, [`POST ${DISMISS_PATH}`]: () => ({ status: 503, json: { detail: "سرویس در دسترس نیست" } }) });
    await user.click(await screen.findByRole("button", { name: "نمایش نده" }));
    expect((await screen.findAllByText("سرویس در دسترس نیست")).length).toBeGreaterThan(0);
    expect(card()).toBeTruthy();
  });

  it("«اتصال اشتراک» opens the link sheet with a left-to-right field", async () => {
    const user = userEvent.setup();
    home({ [`GET ${OFFER_PATH}`]: OFFER });
    await user.click(await screen.findByRole("button", { name: "اتصال اشتراک" }));
    expect(await screen.findByRole("heading", { name: "اتصال اشتراک قبلی" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "لینک اشتراک" }).getAttribute("dir")).toBe("ltr");
  });

  it("takes the card away after the link was accepted", async () => {
    const user = userEvent.setup();
    home({
      [`GET ${OFFER_PATH}`]: OFFER,
      [`POST ${IMPORT_PATH}`]: () => ({ json: { outcome: "pending_approval", message: "درخواست شما ثبت شد.", service_id: null } }),
    });
    await user.click(await screen.findByRole("button", { name: "اتصال اشتراک" }));
    await user.type(await screen.findByRole("textbox", { name: "لینک اشتراک" }), "https://p.example/sub/tok");
    await user.click(screen.getByRole("button", { name: "افزودن سرویس" }));
    await waitFor(() => expect(card()).toBeNull());
  });
});
