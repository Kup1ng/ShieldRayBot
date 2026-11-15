import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { customerMe, fakeApi, renderMini } from "../../test/harness";
import { ScreenRouter } from "../ScreenRouter";
import { RouteProbe, currentView } from "../shop/shopTestKit";
import { HomeScreen } from "./HomeScreen";

const CLUB = (code: string | null) => ({ json: { club: { enabled: true, referral: code ? { code, link: "https://t.me/x?start=ref_" + code, invited: 0, earned_points: 0 } : undefined } } });

describe("customer home", () => {
  it("shows the wallet in full and the buy action when the shop is open", () => {
    fakeApi({});
    renderMini(<HomeScreen />);
    expect(screen.getByText("۲۴۰,۰۰۰ تومان")).toBeTruthy();
    expect(screen.getByRole("button", { name: /خرید سرویس/ })).toBeTruthy();
  });

  it("hides the buy action in a shop Mini App that has not opened its shop", () => {
    fakeApi({});
    renderMini(<HomeScreen />, { me: customerMe({ sections: ["services", "support"] }) });
    expect(screen.queryByRole("button", { name: /خرید سرویس/ })).toBeNull();
  });

  it("renders hostile names as text, never as markup", () => {
    fakeApi({});
    const me = customerMe();
    me.user.name = '<img src=x onerror="alert(1)">';
    const { container } = renderMini(<HomeScreen />, { me });
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByText(/onerror/)).toBeTruthy();
  });
});

describe("dashboard layout (Figma)", () => {
  it("lists the account id, the invite code and the balance with its «افزایش» pill, then the three main buttons", async () => {
    fakeApi({ "GET /api/mini/club": () => CLUB("3v53") });
    renderMini(<HomeScreen />);
    const account = screen.getByRole("region", { name: "حساب" });
    expect(within(account).getByText("شناسه حساب")).toBeTruthy();
    expect(within(account).getByText("10")).toBeTruthy();
    expect(await within(account).findByText("3v53")).toBeTruthy();
    expect(within(account).getByRole("button", { name: "کپی کد دعوت" })).toBeTruthy();
    expect(within(account).getByText("۲۴۰,۰۰۰ تومان")).toBeTruthy();
    expect(within(account).getByRole("button", { name: "افزایش موجودی" })).toBeTruthy();
    const main = screen.getByRole("region", { name: "کارهای اصلی" });
    expect(within(main).getAllByRole("button").map((b) => b.textContent)).toEqual(["خرید سرویس", "سرویس‌ها", "پشتیبانی"]);
  });

  it("shows no invite row when the club has no code for this person", async () => {
    const api = fakeApi({ "GET /api/mini/club": () => CLUB(null) });
    renderMini(<HomeScreen />);
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/club")).toHaveLength(1));
    expect(screen.queryByText("کد دعوت")).toBeNull();
  });

  it("never asks for the club when the shop has not opened it", () => {
    const api = fakeApi({ "GET /api/mini/club": () => CLUB("3v53") });
    renderMini(<HomeScreen />, { me: customerMe({ sections: ["services", "shop"], shop: { name: "s" } }) });
    expect(api.callsTo("GET", "/api/mini/club")).toHaveLength(0);
    expect(screen.queryByText("کد دعوت")).toBeNull();
  });

  it("opens the full-page top-up from the «افزایش» pill", async () => {
    fakeApi({
      "GET /api/mini/club": () => CLUB(null),
      "GET /api/mini/topup": () => ({ json: { methods: [], presets: [], min_amount: 1000, max_amount: 5000000, bot_only: false, recent: [] } }),
    });
    renderMini(
      <>
        <RouteProbe />
        <ScreenRouter />
      </>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "افزایش موجودی" }));
    expect(currentView()).toBe("account");
    expect(await screen.findByRole("heading", { name: "افزایش موجودی" })).toBeTruthy();
  });

  it("ends with the main buttons: no shortcut tiles and no duplicate top-up tile", () => {
    fakeApi({});
    renderMini(<HomeScreen />);
    expect(screen.queryByRole("button", { name: "شارژ کیف پول" })).toBeNull();
    expect(screen.queryByRole("region", { name: "میانبرها" })).toBeNull();
    expect(screen.getByRole("region", { name: "کارهای اصلی" })).toBeTruthy();
  });
});
