import { toast } from "@heroui/react";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { initTelegram } from "../../core/telegram";
import { fakeApi, renderMini } from "../../test/harness";
import { installTelegram } from "../../test/telegram";
import { ScreenRouter } from "../ScreenRouter";
import { meWithWallet } from "../shop/shopTestKit";

const ROW = "افزودن به صفحهٔ اصلی";

// The toast queue is global: a message from one test must not be found by the next.
afterEach(() => toast.clear());

/** Telegram 8.0+ with the home-screen API, answering `status` when asked. */
function telegramWith(status: string, extra: Record<string, unknown> = {}) {
  const stub = installTelegram({
    isVersionAtLeast: () => true,
    addToHomeScreen: vi.fn(),
    checkHomeScreenStatus: vi.fn((cb?: (status: string) => void) => cb?.(status)),
    ...extra,
  });
  initTelegram();
  return stub;
}

function account() {
  fakeApi({
    "GET /api/mini/activity": () => ({ json: { items: [] } }),
    "GET /api/mini/topup": () => ({ json: { methods: [], presets: [], min_amount: 1000, max_amount: 1000000, bot_only: false, recent: [] } }),
  });
  renderMini(<ScreenRouter />, { me: meWithWallet(7000), route: { view: "account" } });
}

describe("account tab: add to the home screen", () => {
  it("offers the shortcut while Telegram can add one and the person has none", () => {
    telegramWith("missed");
    account();
    expect(screen.getByRole("navigation", { name: "میانبرهای حساب" })).toBeTruthy();
    expect(screen.getByRole("button", { name: ROW })).toBeTruthy();
  });

  it("also offers it while Telegram does not know yet", () => {
    telegramWith("unknown");
    account();
    expect(screen.getByRole("button", { name: ROW })).toBeTruthy();
  });

  it.each(["added", "unsupported"])("hides it when Telegram reports %s", (status) => {
    telegramWith(status);
    account();
    expect(screen.queryByRole("button", { name: ROW })).toBeNull();
  });

  it("hides it when the Telegram app is older than 8.0, whatever its SDK answers", () => {
    telegramWith("missed", { isVersionAtLeast: (version: string) => version !== "8.0" });
    account();
    expect(screen.queryByRole("button", { name: ROW })).toBeNull();
  });

  it("hides it in a browser without Telegram", () => {
    account();
    expect(screen.queryByRole("button", { name: ROW })).toBeNull();
  });

  it("opens Telegram's own prompt once per tap, then confirms and removes the row when Telegram reports it added", async () => {
    const user = userEvent.setup();
    const stub = telegramWith("missed");
    account();
    await user.click(screen.getByRole("button", { name: ROW }));
    expect(stub.tg.addToHomeScreen).toHaveBeenCalledTimes(1);
    act(() => stub.events.homeScreenAdded());
    expect((await screen.findAllByText("به صفحهٔ اصلی اضافه شد")).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByRole("button", { name: ROW })).toBeNull());
  });

  it("does not claim success for a shortcut that was added without the person tapping the row", async () => {
    const stub = telegramWith("missed");
    account();
    // A toast of the previous test may still be fading out of the shared queue.
    await waitFor(() => expect(screen.queryByText("به صفحهٔ اصلی اضافه شد")).toBeNull());
    act(() => stub.events.homeScreenChecked({ status: "added" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: ROW })).toBeNull());
    expect(screen.queryByText("به صفحهٔ اصلی اضافه شد")).toBeNull();
  });

  it("says so when this Telegram refuses the prompt", async () => {
    const user = userEvent.setup();
    telegramWith("missed", {
      addToHomeScreen: vi.fn(() => {
        throw new Error("WebAppMethodUnsupported");
      }),
    });
    account();
    await user.click(screen.getByRole("button", { name: ROW }));
    expect((await screen.findAllByText("این نسخهٔ تلگرام افزودن به صفحهٔ اصلی را پشتیبانی نمی‌کند")).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("WebAppMethodUnsupported");
  });
});
