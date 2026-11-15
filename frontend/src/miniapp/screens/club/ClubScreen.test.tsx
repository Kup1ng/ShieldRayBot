import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MiniShell } from "../../layout/MiniShell";
import { answerConfirm, customerMe, fakeApi, renderMini, type FakeHandler } from "../../test/harness";
import { ScreenRouter } from "../ScreenRouter";

/** Open confirmation dialogs (toasts are alert dialogs too). */
const confirmDialogs = () => screen.queryAllByRole("alertdialog").filter((el) => el.getAttribute("data-slot") !== "toast");

/** Answer the in-app confirmation and wait until its dialog is gone, so it cannot leak into the next step. */
async function decide(yes: boolean): Promise<string> {
  const question = await answerConfirm(yes);
  await waitFor(() => expect(confirmDialogs()).toHaveLength(0));
  return question;
}

const HOSTILE = "<img src=x onerror=alert(1)>";
const LINK = "https://t.me/ClockBot?start=ref_REF1";

function clubBody(overrides: Record<string, unknown> = {}) {
  return {
    club: {
      enabled: true,
      points: 300,
      tier: { name: HOSTILE, points_to_next: 200 },
      month_points: 40,
      referral: { code: "REF1", link: LINK, invited: 2, earned_points: 20 },
      rewards: [
        { id: 1, name: HOSTILE, description: HOSTILE, type: "wallet_credit", type_label: "", value: 20000, cost: 100, needs_service: false, affordable: true },
        { id: 3, name: "ترافیک", description: "", type: "traffic_gb", type_label: "", value: 5, cost: 200, needs_service: true, affordable: true },
        { id: 6, name: "بزرگ", description: "", type: "wallet_credit", type_label: "", value: 1, cost: 900, needs_service: false, affordable: false },
      ],
      services: [{ id: 10, name: HOSTILE }],
      discounts: [{ code: HOSTILE, percent: 15, min_purchase: 0, max_discount: null, expires_at: null }],
      history: [{ id: 30, amount: 30, label: HOSTILE, created_at: null }],
      history_more: true,
      ...overrides,
    },
  };
}

const REDEEM_1 = "POST /api/mini/club/rewards/1/redeem";

function routes(extra: Record<string, FakeHandler> = {}, club = clubBody()): Record<string, FakeHandler> {
  return {
    "GET /api/mini/club": () => ({ json: club }),
    "GET /api/mini/me": () => ({ json: customerMe() }),
    ...extra,
  };
}

function renderClub() {
  return renderMini(
    <MiniShell>
      <ScreenRouter />
    </MiniShell>,
    { route: { view: "club" } },
  );
}

function stubTelegram() {
  const tg = {
    initData: "query_id=x",
    ready: vi.fn(),
    expand: vi.fn(),
    close: vi.fn(),
    onEvent: vi.fn(),
    openTelegramLink: vi.fn(),
    openLink: vi.fn(),
    BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
    HapticFeedback: { selectionChanged: vi.fn(), notificationOccurred: vi.fn() },
  };
  Object.defineProperty(window, "Telegram", { value: { WebApp: tg }, configurable: true, writable: true });
  return tg;
}

/** The «دریافت» buttons in reward order (the unaffordable reward has another label). */
const claimButtons = () => screen.getAllByRole("button", { name: "دریافت" });

function gate() {
  let release: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { opened, release };
}

beforeEach(async () => {
  window.history.replaceState(null, "", "#");
  await new Promise((resolve) => setTimeout(resolve, 0));
});

afterEach(() => {
  Reflect.deleteProperty(window, "Telegram");
  vi.restoreAllMocks();
});

describe("club page", () => {
  it("renders every customer and admin text as text and disables an unaffordable reward", async () => {
    fakeApi(routes());
    const { container } = renderClub();
    await screen.findByText("دعوت دوستان");
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(screen.getAllByText(HOSTILE, { exact: false }).length).toBeGreaterThan(2);
    const tooPoor = screen.getByRole("button", { name: "امتیاز کافی نیست" }) as HTMLButtonElement;
    expect(tooPoor.disabled).toBe(true);
    expect(screen.getByText(LINK)).toBeTruthy();
    expect(screen.getByRole("button", { name: "بیشتر" })).toBeTruthy();
  });

  it("shows reward amounts in their own direction and does not repeat the reward name", async () => {
    const club = clubBody({
      rewards: [{ id: 1, name: "اعتبار کیف پول", description: "", type: "wallet_credit", type_label: "", value: 50000, cost: 2000, needs_service: false, affordable: false }],
      history: [],
      discounts: [],
      history_more: false,
    });
    fakeApi(routes({}, club));
    renderClub();
    const amount = await screen.findByText("۵۰,۰۰۰ تومان");
    expect(amount.tagName).toBe("BDI");
    expect(screen.getAllByText("اعتبار کیف پول")).toHaveLength(1);
  });

  it("goes back to the dashboard from the club", async () => {
    fakeApi(routes());
    const tg = stubTelegram();
    renderClub();
    await screen.findByText("دعوت دوستان");
    const calls = tg.BackButton.onClick.mock.calls;
    act(() => (calls[calls.length - 1][0] as () => void)());
    expect(await screen.findByText(/سلام/)).toBeTruthy();
    expect(screen.queryByText("دعوت دوستان")).toBeNull();
  });
});

describe("invite link", () => {
  it("is shared through Telegram's share link", async () => {
    fakeApi(routes());
    const tg = stubTelegram();
    renderClub();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "ارسال لینک برای دوستان" }));
    expect(tg.openTelegramLink.mock.calls).toEqual([["https://t.me/share/url?url=" + encodeURIComponent(LINK)]]);
  });

  it("is neither shown nor opened when the link is unsafe", async () => {
    const club = clubBody({ referral: { code: "REF1", link: "javascript:alert(1)", invited: 0, earned_points: 0 } });
    fakeApi(routes({}, club));
    const tg = stubTelegram();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = renderClub();
    await screen.findByText("دعوت دوستان");
    expect(container.textContent).not.toContain("javascript:");
    expect(screen.queryByRole("button", { name: "ارسال لینک برای دوستان" })).toBeNull();
    expect(tg.openTelegramLink).not.toHaveBeenCalled();
    expect(tg.openLink).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});

describe("redeeming a reward", () => {
  it("spends nothing when the confirmation is declined", async () => {
    const api = fakeApi(routes());
    renderClub();
    const user = userEvent.setup();
    await screen.findByText("دعوت دوستان");
    await user.click(claimButtons()[0]);
    expect(await decide(false)).toBeTruthy();
    expect(api.callsTo("POST", "/api/mini")).toHaveLength(0);
  });

  it("posts once on a double tap, then reads the club and the wallet again", async () => {
    const pending = gate();
    const api = fakeApi(
      routes({
        [REDEEM_1]: async () => {
          await pending.opened;
          return { json: { points: 200, reward_type: "wallet_credit" } };
        },
      }),
    );
    renderClub();
    await screen.findByText("دعوت دوستان");
    const first = claimButtons()[0];
    // Two quick taps: the newer question replaces the older one (answered «no»), so one «yes» is one purchase.
    fireEvent.click(first);
    fireEvent.click(first);
    await decide(true);
    pending.release();
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/club")).toHaveLength(2));
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/me").length).toBeGreaterThanOrEqual(1));
    const posts = api.callsTo("POST", "/api/mini/club/rewards");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({});
  });

  it("never posts an unaffordable reward", async () => {
    const api = fakeApi(routes());
    renderClub();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "امتیاز کافی نیست" }));
    expect(confirmDialogs()).toHaveLength(0);
    expect(api.callsTo("POST", "/api/mini")).toHaveLength(0);
  });

  it("asks which service to use and sends only its id", async () => {
    const api = fakeApi(routes({ "POST /api/mini/club/rewards/3/redeem": () => ({ json: { points: 100 } }) }));
    renderClub();
    const user = userEvent.setup();
    await screen.findByText("دعوت دوستان");
    await user.click(claimButtons()[1]);
    const dialog = await screen.findByRole("dialog");
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(within(dialog).getByText(HOSTILE, { exact: false })).toBeTruthy();
    expect(api.callsTo("POST", "/api/mini")).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: /افزودن به سرویس/ }));
    await waitFor(() => expect(api.callsTo("POST", "/api/mini/club/rewards/3/redeem")).toHaveLength(1));
    expect(api.callsTo("POST", "/api/mini/club/rewards/3/redeem")[0].body).toEqual({ service_id: 10 });
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/club")).toHaveLength(2));
  });

  it("does not retry a lost answer and reads the club again instead", async () => {
    const api = fakeApi(routes({ [REDEEM_1]: () => "network-error" }));
    renderClub();
    const user = userEvent.setup();
    await screen.findByText("دعوت دوستان");
    await user.click(claimButtons()[0]);
    await decide(true);
    expect((await screen.findAllByText(/نتیجه مشخص نشد/)).length).toBeGreaterThan(0);
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/club")).toHaveLength(2));
    expect(api.callsTo("POST", "/api/mini/club/rewards/1/redeem")).toHaveLength(1);
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/me").length).toBeGreaterThanOrEqual(1));
  });

  it("shows a won discount code as text, with a copy button", async () => {
    fakeApi(routes({ [REDEEM_1]: () => ({ json: { points: 200, discount_code: HOSTILE } }) }));
    renderClub();
    const user = userEvent.setup();
    await screen.findByText("دعوت دوستان");
    await user.click(claimButtons()[0]);
    await decide(true);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(HOSTILE)).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "کپی کد تخفیف" })).toBeTruthy();
    expect(document.querySelector("img[onerror]")).toBeNull();
  });
});

describe("points history", () => {
  it("continues after the last loaded entry and hides the button at the end", async () => {
    const api = fakeApi(
      routes({
        "GET /api/mini/club/history?before=30": () => ({ json: { items: [{ id: 12, amount: -5, label: "قدیمی‌تر", created_at: null }], has_more: false } }),
      }),
    );
    renderClub();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "بیشتر" }));
    expect(await screen.findByText("قدیمی‌تر")).toBeTruthy();
    expect(api.callsTo("GET", "/api/mini/club/history?before=30")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "بیشتر" })).toBeNull();
  });
});
