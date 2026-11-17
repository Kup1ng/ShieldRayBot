import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { customerMe, fakeApi, renderMini } from "../../test/harness";
import "../../test/telegram";
import { HomeScreen } from "../home/HomeScreen";

const HOSTILE = "<img src=x onerror=alert(1)>";

const adminMe = () =>
  customerMe({
    persona: "admin",
    commerce_allowed: false,
    nav: [
      { id: "home", label: "داشبورد" },
      { id: "ops", label: "میانبرها" },
    ],
    brand: { name: "Nova" },
    customer: { wallet: 0, wallet_pay_enabled: false, qr_enabled: false, commerce_allowed: false, home: { service_count: 0, attention: [], recent: [] } },
  });

const ops = (canReview: boolean) => ({
  stats: { pending: 4, tickets: 2, revenue: 5 },
  can_review: canReview,
  panel_base: "https://panel.example.com",
  panel_links: [
    { id: "finance", label: "مالی", path: "/finance" },
    { id: "tickets", label: HOSTILE, path: "/tickets" },
  ],
});

async function mount(canReview: boolean) {
  fakeApi({ "GET /api/mini/ops": () => ({ json: ops(canReview) }) });
  renderMini(<HomeScreen />, { me: adminMe() });
  await screen.findByText("درآمد پلتفرم");
}

const button = (name: string | RegExp) => screen.queryByRole("button", { name });

describe("staff shortcuts", () => {
  it("count receipts on in-app review and open tickets on the panel tile, receipts only once", async () => {
    await mount(true);
    expect(button("بررسی رسیدها، ۴ مورد")).not.toBeNull();
    expect(button(`${HOSTILE}، ۲ مورد`)).not.toBeNull();
    expect(button("مالی")).not.toBeNull();
  });

  it("count receipts on the finance tile when the account may not review them in the app", async () => {
    await mount(false);
    expect(button(/بررسی رسیدها/)).toBeNull();
    expect(button("مالی، ۴ مورد")).not.toBeNull();
  });

  it("render panel link labels as text and offer no commerce shortcuts", async () => {
    await mount(true);
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByText(HOSTILE)).toBeTruthy();
    expect(button("شارژ کیف پول")).toBeNull();
    expect(button("خرید سرویس")).toBeNull();
  });

  it("titles the dashboard with the platform name", async () => {
    await mount(true);
    expect(screen.getByText("داشبورد Nova")).toBeTruthy();
  });
});
