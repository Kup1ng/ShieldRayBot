import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { customerMe, fakeApi, renderMini, type FakeHandler } from "../../test/harness";
import { HomeScreen } from "../home/HomeScreen";
import { RouteProbe, SheetOutlet, currentView } from "../shop/shopTestKit";
import { DISMISS_PATH, IMPORT_PATH, OFFER_PATH } from "./importKit";

const IMPORT_ONLY = { show: true, import_enabled: true, trial_available: false };
const TRIAL_ONLY = { show: true, import_enabled: false, trial_available: true };
const BOTH = { show: true, import_enabled: true, trial_available: true };
const OFFER: FakeHandler = () => ({ json: IMPORT_ONLY });
const offering = (json: unknown): FakeHandler => () => ({ json });
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
    for (const reply of [{ json: { show: false, import_enabled: false, trial_available: false } }, { status: 500, json: { detail: "خطا" } }, "network-error" as const]) {
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

  it("does not ask in a shop Mini App that has opened neither services nor the shop", async () => {
    const { api } = home({ [`GET ${OFFER_PATH}`]: OFFER }, customerMe({ sections: ["support"], shop: { name: "s" } }));
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

describe("home offer with a free trial", () => {
  const TRIAL = { name: "تست رایگان" };

  it("offers the trial beside adding a previous service, with the bot's words", async () => {
    home({ [`GET ${OFFER_PATH}`]: offering(BOTH) });
    expect(await screen.findByRole("region", { name: "شروع سریع" })).toBeTruthy();
    expect(screen.getByText("سرویس قبلی خود را اضافه کنید یا یک تست رایگان بگیرید.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "اتصال اشتراک" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "دریافت تست" })).toBeTruthy();
  });

  it("offers the trial alone while adding previous services is off", async () => {
    home({ [`GET ${OFFER_PATH}`]: offering(TRIAL_ONLY) });
    expect(await screen.findByRole("region", TRIAL)).toBeTruthy();
    expect(screen.getByRole("button", { name: "دریافت تست" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "اتصال اشتراک" })).toBeNull();
    expect(screen.getByRole("button", { name: "نمایش نده" })).toBeTruthy();
  });

  it("«دریافت تست» opens the shop on its trial plan, and asks nothing of the server by itself", async () => {
    const user = userEvent.setup();
    const { api } = home({ [`GET ${OFFER_PATH}`]: offering(BOTH) });
    await user.click(await screen.findByRole("button", { name: "دریافت تست" }));
    expect(currentView()).toBe("shop");
    expect(api.callsTo("POST", "/api/mini")).toHaveLength(0);
  });

  it("shows only what this shop's Mini App has opened", async () => {
    home({ [`GET ${OFFER_PATH}`]: offering(BOTH) }, customerMe({ sections: ["shop"], shop: { name: "s" } }));
    expect(await screen.findByRole("region", TRIAL)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "اتصال اشتراک" })).toBeNull();
    cleanup();
    home({ [`GET ${OFFER_PATH}`]: offering(BOTH) }, customerMe({ sections: ["services"], shop: { name: "s" } }));
    expect(await screen.findByRole("region", { name: "اتصال اشتراک قبلی" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "دریافت تست" })).toBeNull();
  });

  it("shows no card when the only thing offered is closed in this shop", async () => {
    const { api } = home({ [`GET ${OFFER_PATH}`]: offering(TRIAL_ONLY) }, customerMe({ sections: ["services"], shop: { name: "s" } }));
    await waitFor(() => expect(api.callsTo("GET", OFFER_PATH)).toHaveLength(1));
    expect(screen.queryByRole("region", TRIAL)).toBeNull();
    expect(card()).toBeNull();
  });

  it("«نمایش نده» removes the whole offer, trial included", async () => {
    const user = userEvent.setup();
    home({ [`GET ${OFFER_PATH}`]: offering(BOTH), [`POST ${DISMISS_PATH}`]: () => ({ json: { dismissed: true } }) });
    await user.click(await screen.findByRole("button", { name: "نمایش نده" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "شروع سریع" })).toBeNull());
  });
});
