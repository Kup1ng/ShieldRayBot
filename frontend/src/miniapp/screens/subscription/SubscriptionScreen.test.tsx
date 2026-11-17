import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fakeApi, renderMini, type FakeHandler, type FakeReply } from "../../test/harness";
import type { MePayload } from "../../types";
import { ScreenRouter } from "../ScreenRouter";
import { RouteProbe, currentView, meWithWallet, stubBrowserConfirm, visit } from "../shop/shopTestKit";

const HOSTILE = "<img src=x onerror=alert(1)>";
const SHOP_KEY = "Ab3_-xY9Ab3_-xY9Ab3_-x";
const PATH = "/api/mini/reseller/subscription";

const OVERVIEW = {
  wallet: 900000,
  plan_name: HOSTILE,
  is_payg: false,
  status: "active",
  expires_at: "2027-01-01T00:00:00+00:00",
  days_left: 12,
  base_gb: 100,
  extra_gb: 20,
  base_users: 50,
  extra_users: 0,
  generation: 7,
  usage: { users: 12, used_gb: 40 },
  renew_total: 500000,
  renew_days: 30,
  renew_note: null,
  unavailable: null,
  packs: [{ id: 3, name: HOSTILE, description: "<b>توضیح</b>", gb: 50, users: 10, price: 200000 }],
  unit_gb: { unit_price: 3000, options: [10, 50] },
  unit_users: { unit_price: 10000, options: [5] },
};

type Routes = Record<string, FakeReply | FakeHandler>;

function resellerMe(overrides: Partial<MePayload> = {}): MePayload {
  return meWithWallet(900000, { persona: "reseller", ...overrides });
}

function mount(me: MePayload, extra: Routes = {}, view: "subscription" | "home" | "services" = "subscription") {
  const routes: Record<string, FakeHandler> = {
    "GET /api/mini/me": () => ({ json: me }),
    [`GET ${PATH}`]: () => ({ json: OVERVIEW }),
    "GET /api/mini/ops": () => ({ json: { stats: {} } }),
    "GET /api/mini/services": () => ({ json: { items: [], next_before_id: null } }),
  };
  for (const [key, reply] of Object.entries(extra)) routes[key] = typeof reply === "function" ? reply : () => reply;
  const api = fakeApi(routes);
  renderMini(
    <>
      <RouteProbe />
      <ScreenRouter />
    </>,
    { me, route: { view } },
  );
  return api;
}

const posts = (api: ReturnType<typeof fakeApi>, path: string) => api.calls.filter((c) => c.method === "POST" && c.path === path);

describe("the owner's subscription screen", () => {
  it("shows the package, capacity and usage, with hostile names as text", async () => {
    mount(resellerMe());
    await screen.findByRole("region", { name: "وضعیت اشتراک" });
    const status = screen.getByRole("region", { name: "وضعیت اشتراک" });
    expect(within(status).getByText(HOSTILE)).toBeTruthy();
    expect(within(status).getByText("فعال")).toBeTruthy();
    expect(within(status).getByText("۱۲ روز مانده")).toBeTruthy();
    expect(within(status).getByText("۱۲۰ گیگ (۲۰ اضافه)")).toBeTruthy();
    expect(within(status).getByText("۵۰ کاربر")).toBeTruthy();
    expect(within(status).getByText("مصرف فعلی: ۱۲ کاربر · ۴۰ گیگ")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "کیف پول" })).getByText("۹۰۰,۰۰۰ تومان")).toBeTruthy();
    const packs = screen.getByRole("region", { name: "بسته‌های آماده" });
    expect(within(packs).getByText(HOSTILE)).toBeTruthy();
    expect(within(packs).getByText("<b>توضیح</b>")).toBeTruthy();
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(packs.querySelector("b")).toBeNull();
  });

  it("says when the package cannot be bought into, and offers no renewal for pay-as-you-go", async () => {
    mount(resellerMe(), {
      [`GET ${PATH}`]: { json: { ...OVERVIEW, is_payg: true, unavailable: "پلن PAYG بسته و تمدید زمانی ندارد", renew_total: null, packs: [], unit_gb: null, unit_users: null } },
    });
    expect(await screen.findByText("پلن PAYG بسته و تمدید زمانی ندارد")).toBeTruthy();
    expect(screen.getByText("پرداخت به‌ازای مصرف")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /تمدید/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "بسته‌های آماده" })).toBeNull();
  });

  it("explains a failed read and reads again on request", async () => {
    let fail = true;
    const api = mount(resellerMe(), { [`GET ${PATH}`]: () => (fail ? { status: 500, json: { detail: "Traceback" } } : { json: OVERVIEW }) });
    await screen.findByRole("alert");
    fail = false;
    await userEvent.setup().click(screen.getByRole("button", { name: /تلاش دوباره/ }));
    expect(await screen.findByRole("region", { name: "وضعیت اشتراک" })).toBeTruthy();
    expect(api.callsTo("GET", PATH)).toHaveLength(2);
  });
});

describe("renewal and purchases", () => {
  const REPLY = { ok: true, message: "انجام شد", wallet: 400000 };

  it("asks first, then renews once with the generation it was loaded with, and reads the package again", async () => {
    const user = userEvent.setup();
    const confirm = stubBrowserConfirm(true);
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = mount(resellerMe(), {
      "POST /api/mini/reseller/renew": async () => {
        await answered;
        return { json: REPLY };
      },
    });
    // A second tap while the first purchase is still on its way is ignored.
    await user.dblClick(await screen.findByRole("button", { name: /تمدید — ۵۰۰,۰۰۰ تومان/ }));
    await waitFor(() => expect(posts(api, "/api/mini/reseller/renew")).toHaveLength(1));
    release();
    await waitFor(() => expect(api.callsTo("GET", PATH)).toHaveLength(2));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain("۵۰۰,۰۰۰ تومان");
    expect(posts(api, "/api/mini/reseller/renew")).toHaveLength(1);
    expect(posts(api, "/api/mini/reseller/renew")[0].body).toEqual({ generation: 7 });
    expect(api.callsTo("GET", "/api/mini/me").length).toBeGreaterThanOrEqual(1);
  });

  it("the next purchase carries the generation read after the previous one", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    let generation = 7;
    const api = mount(resellerMe(), {
      [`GET ${PATH}`]: () => ({ json: { ...OVERVIEW, generation } }),
      "POST /api/mini/reseller/renew": () => {
        generation += 1;
        return { json: REPLY };
      },
    });
    await user.click(await screen.findByRole("button", { name: /تمدید — / }));
    await waitFor(() => expect(api.callsTo("GET", PATH)).toHaveLength(2));
    await user.click(await screen.findByRole("button", { name: /تمدید — / }));
    await waitFor(() => expect(posts(api, "/api/mini/reseller/renew")).toHaveLength(2));
    expect(posts(api, "/api/mini/reseller/renew").map((c) => c.body)).toEqual([{ generation: 7 }, { generation: 8 }]);
  });

  it("sends nothing when the confirmation is declined", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(false);
    const api = mount(resellerMe());
    await user.click(await screen.findByRole("button", { name: /تمدید — / }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(api.callsTo("GET", PATH)).toHaveLength(1);
  });

  it("buys a pack by its id with the generation, after a confirmation that names it", async () => {
    const user = userEvent.setup();
    const confirm = stubBrowserConfirm(true);
    const api = mount(resellerMe(), { "POST /api/mini/reseller/pack": { json: REPLY } });
    const packs = await screen.findByRole("region", { name: "بسته‌های آماده" });
    await user.click(within(packs).getByRole("button"));
    await waitFor(() => expect(posts(api, "/api/mini/reseller/pack")).toHaveLength(1));
    expect(posts(api, "/api/mini/reseller/pack")[0].body).toEqual({ pack_id: 3, generation: 7 });
    expect(confirm.mock.calls[0][0]).toContain(HOSTILE);
    expect(confirm.mock.calls[0][0]).toContain("۲۰۰,۰۰۰ تومان");
  });

  it("buys units of volume and users with the amount, the kind and the generation", async () => {
    const user = userEvent.setup();
    const confirm = stubBrowserConfirm(true);
    const api = mount(resellerMe(), { "POST /api/mini/reseller/extra": { json: REPLY } });
    await user.click(await screen.findByRole("button", { name: "۵۰ گیگ، ۱۵۰,۰۰۰ تومان" }));
    await waitFor(() => expect(posts(api, "/api/mini/reseller/extra")).toHaveLength(1));
    expect(posts(api, "/api/mini/reseller/extra")[0].body).toEqual({ kind: "gb", amount: 50, generation: 7 });
    expect(confirm.mock.calls[0][0]).toContain("۱۵۰,۰۰۰ تومان");
    await waitFor(() => expect(api.callsTo("GET", PATH)).toHaveLength(2));
    await user.click(await screen.findByRole("button", { name: "۵ کاربر، ۵۰,۰۰۰ تومان" }));
    await waitFor(() => expect(posts(api, "/api/mini/reseller/extra")).toHaveLength(2));
    expect(posts(api, "/api/mini/reseller/extra")[1].body).toEqual({ kind: "users", amount: 5, generation: 7 });
  });

  it("after a lost reply says the outcome is unknown, never repeats the purchase, and shows the package again", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    const api = mount(resellerMe(), { "POST /api/mini/reseller/renew": "network-error" });
    await user.click(await screen.findByRole("button", { name: /تمدید — / }));
    expect((await screen.findAllByText(/نتیجهٔ خرید مشخص نشد/)).length).toBeGreaterThan(0);
    await waitFor(() => expect(api.callsTo("GET", PATH)).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(posts(api, "/api/mini/reseller/renew")).toHaveLength(1);
  });

  it("shows the server's refusal as text and reads the package again for a new generation", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    const api = mount(resellerMe(), {
      "POST /api/mini/reseller/pack": { status: 400, json: { detail: `${HOSTILE} قبلاً خریداری شده` } },
    });
    const packs = await screen.findByRole("region", { name: "بسته‌های آماده" });
    await user.click(within(packs).getByRole("button"));
    expect((await screen.findAllByText(/قبلاً خریداری شده/)).length).toBeGreaterThan(0);
    expect(document.querySelector("img[onerror]")).toBeNull();
    await waitFor(() => expect(api.callsTo("GET", PATH)).toHaveLength(2));
  });

  it("disables what the wallet cannot pay for and says so", async () => {
    mount(resellerMe(), { [`GET ${PATH}`]: { json: { ...OVERVIEW, wallet: 1000 } } });
    const renew = await screen.findByRole("button", { name: /تمدید — / });
    expect((renew as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("موجودی کیف پول کافی نیست.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "۱۰ گیگ، ۳۰,۰۰۰ تومان" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("موجودی کافی نیست")).toBeTruthy();
  });
});

describe("who may open the subscription", () => {
  it("is offered to the shop owner on home and on the services list, and opens the screen", async () => {
    const user = userEvent.setup();
    mount(resellerMe(), {}, "home");
    await user.click(await screen.findByRole("button", { name: /اشتراک نمایندگی/ }));
    expect(currentView()).toBe("subscription");
    expect(await screen.findByRole("region", { name: "وضعیت اشتراک" })).toBeTruthy();
  });

  it("is offered on the services list too", async () => {
    mount(resellerMe(), {}, "services");
    expect(await screen.findByRole("button", { name: /اشتراک نمایندگی/ })).toBeTruthy();
  });

  it("is not offered to a customer, and the route falls back to home without asking the server", async () => {
    const api = mount(meWithWallet(5000), {}, "subscription");
    expect(currentView()).toBe("home");
    expect(screen.queryByRole("button", { name: /اشتراک نمایندگی/ })).toBeNull();
    expect(api.callsTo("GET", PATH)).toHaveLength(0);
  });

  it("is not offered to the owner inside their own shop's Mini App, where the server refuses it", async () => {
    visit(`/miniapp/s/${SHOP_KEY}/`);
    const me = resellerMe({ shop: { name: "فروشگاه" }, sections: ["services", "guides", "activity", "shop"] });
    const api = mount(me, {}, "subscription");
    expect(currentView()).toBe("home");
    expect(screen.queryByRole("button", { name: /اشتراک نمایندگی/ })).toBeNull();
    expect(api.callsTo("GET", PATH)).toHaveLength(0);
  });

  it("shows the server's refusal when a former owner opens it", async () => {
    mount(resellerMe(), { [`GET ${PATH}`]: { status: 403, json: { detail: "این بخش فقط برای نماینده است" } } });
    expect(await screen.findByText("این بخش فقط برای نماینده است")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /تمدید/ })).toBeNull();
  });
});
