import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fakeApi, renderMini, type FakeHandler } from "../../test/harness";
import { SheetOutlet, meWithWallet } from "../shop/shopTestKit";
import { AccountScreen } from "./AccountScreen";

type User = ReturnType<typeof userEvent.setup>;

function gift(extra: Record<string, FakeHandler> = {}, wallet = 100000) {
  let current = meWithWallet(wallet);
  const api = fakeApi({
    "GET /api/mini/me": () => ({ json: current }),
    "GET /api/mini/activity": () => ({ json: { items: [] } }),
    "GET /api/mini/topup": () => ({ json: { methods: [], presets: [], min_amount: 1000, max_amount: 5000000, bot_only: false, recent: [] } }),
    ...extra,
  });
  renderMini(
    <>
      <AccountScreen />
      <SheetOutlet />
    </>,
    { me: current, route: { view: "account" } },
  );
  return { api, setWallet: (value: number) => (current = meWithWallet(value)) };
}

const redeems = (api: ReturnType<typeof gift>["api"]) => api.callsTo("POST", "/api/mini/wallet/redeem");

async function openGift(user: User) {
  await user.click(screen.getByRole("button", { name: "کد هدیه" }));
  await screen.findByRole("heading", { name: "کد هدیه" });
}

const submit = () => screen.getByRole("button", { name: "ثبت کد و شارژ کیف پول" });
const field = () => screen.getByRole("textbox", { name: "کد هدیه" });

describe("gift code", () => {
  it("never sends an empty code", async () => {
    const user = userEvent.setup();
    const { api } = gift();
    await openGift(user);
    await user.type(field(), "   ");
    await user.click(submit());
    expect((await screen.findAllByText("کد هدیه را بنویسید")).length).toBeGreaterThan(0);
    expect(redeems(api)).toHaveLength(0);
  });

  it("sends a trimmed code once per tap, closes the sheet and shows the new wallet", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { api, setWallet } = gift({
      "POST /api/mini/wallet/redeem": async () => {
        await gate;
        setWallet(150000);
        return { json: { amount: 50000, wallet: 150000, message: "شارژ شد" } };
      },
    });
    await openGift(user);
    await user.type(field(), " GIFT50 ");
    fireEvent.click(submit());
    fireEvent.click(submit());
    release();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "کد هدیه" })).toBeNull());
    expect(redeems(api)).toHaveLength(1);
    expect(redeems(api)[0].body).toEqual({ code: "GIFT50" });
    expect((await screen.findAllByText(/شارژ شد: ۵۰,۰۰۰ تومان/)).length).toBeGreaterThan(0);
    expect(await screen.findByText("۱۵۰,۰۰۰ تومان")).toBeTruthy();
    expect(api.callsTo("GET", "/api/mini/me").length).toBeGreaterThanOrEqual(1);
  });

  it("shows a refusal as is and keeps the sheet open without re-reading the wallet", async () => {
    const user = userEvent.setup();
    const { api } = gift({ "POST /api/mini/wallet/redeem": () => ({ status: 422, json: { detail: "این کد هدیه معتبر نیست." } }) });
    await openGift(user);
    await user.type(field(), "BAD");
    await user.click(submit());
    expect((await screen.findAllByText("این کد هدیه معتبر نیست.")).length).toBeGreaterThan(0);
    expect(api.callsTo("GET", "/api/mini/me")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "کد هدیه" })).toBeTruthy();
  });

  it("a lost response is not retried and the wallet is read again", async () => {
    const user = userEvent.setup();
    const { api } = gift({ "POST /api/mini/wallet/redeem": () => "network-error" });
    await openGift(user);
    await user.type(field(), "GIFT50");
    await user.click(submit());
    expect((await screen.findAllByText("نتیجه مشخص نشد؛ موجودی دوباره خوانده شد.")).length).toBeGreaterThan(0);
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/me").length).toBeGreaterThanOrEqual(1));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(redeems(api)).toHaveLength(1);
  });
});
