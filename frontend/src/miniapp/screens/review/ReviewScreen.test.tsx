import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MiniShell } from "../../layout/MiniShell";
import { answerConfirm, customerMe, fakeApi, renderMini, type FakeHandler } from "../../test/harness";
import type { MePayload, Route } from "../../types";
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

const QUEUE = {
  total: 2,
  items: [
    { id: 10, amount: 70000, kind: "topup", order_id: null, plan_name: "", payer: HOSTILE, created_at: null },
    { id: 11, amount: 50000, kind: "order", order_id: 20, plan_name: HOSTILE, payer: "b", created_at: null },
  ],
};

const OPS = {
  stats: { pending: 2, tickets: 0 },
  can_review: true,
  panel_base: "https://panel.example.com",
  panel_links: [{ id: "finance", label: "مالی", path: "/finance" }],
  shop: { bot_username: "shop_bot", active: true },
};

function persona(kind: "admin" | "reseller"): MePayload {
  return customerMe({
    persona: kind,
    commerce_allowed: kind !== "admin",
    nav: kind === "admin" ? [{ id: "home", label: "داشبورد" }, { id: "ops", label: "میانبرها" }] : [{ id: "home", label: "خانه" }, { id: "ops", label: "فروشگاه" }],
  });
}

function routes(extra: Record<string, FakeHandler> = {}): Record<string, FakeHandler> {
  return {
    "GET /api/mini/review": () => ({ json: QUEUE }),
    "GET /api/mini/ops": () => ({ json: OPS }),
    "GET /api/mini/me": () => ({ json: persona("admin") }),
    "GET /api/mini/review/10/receipt": () => ({ json: undefined, headers: { "Content-Type": "image/jpeg" } }),
    ...extra,
  };
}

function renderReview(kind: "admin" | "reseller" = "admin", route: Route = { view: "review" }) {
  return renderMini(
    <MiniShell>
      <ScreenRouter />
    </MiniShell>,
    { me: persona(kind), route },
  );
}

function stubTelegram() {
  const tg = {
    initData: "query_id=x&hash=y",
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

function pressTelegramBack(tg: ReturnType<typeof stubTelegram>) {
  const calls = tg.BackButton.onClick.mock.calls;
  act(() => (calls[calls.length - 1][0] as () => void)());
}

/** Stand-ins for the browser's object URLs so the photo's address can be controlled. */
function stubObjectUrls(made = "blob:receipt-1") {
  const create = vi.fn(() => made);
  const revoke = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  return { create, revoke };
}

/** Reads of the queue itself (not of a receipt photo, which shares the path prefix). */
const queueReads = (api: ReturnType<typeof fakeApi>) => api.calls.filter((c) => c.method === "GET" && c.path === "/api/mini/review").length;

function gate() {
  let release: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { opened, release };
}

async function openReceipt(id = 10) {
  const user = userEvent.setup();
  await screen.findByText("رسیدهای در انتظار تأیید");
  await user.click(await screen.findByRole("button", { name: new RegExp(`^رسید ${id === 10 ? "۱۰" : "۱۱"}`) }));
  const dialog = await screen.findByRole("dialog");
  return { user, dialog };
}

beforeEach(async () => {
  window.history.replaceState(null, "", "#");
  await new Promise((resolve) => setTimeout(resolve, 0));
  stubObjectUrls();
});

afterEach(() => {
  Reflect.deleteProperty(window, "Telegram");
  vi.restoreAllMocks();
});

describe("receipt queue", () => {
  it("shows payer and plan names as text, with the payer kept in its own direction", async () => {
    fakeApi(routes());
    const { container } = renderReview();
    await screen.findByText("رسیدهای در انتظار تأیید");
    await screen.findAllByText(HOSTILE, { exact: false });
    expect(container.querySelector("img[onerror]")).toBeNull();
    const payer = screen.getAllByText(HOSTILE).find((el) => el.tagName === "BDI");
    expect(payer, "the payer sits in its own bidi island").toBeTruthy();
  });

  it("shows a notice when older receipts are not in the list", async () => {
    fakeApi(routes({ "GET /api/mini/review": () => ({ json: { ...QUEUE, total: 7 } }) }));
    renderReview();
    expect(await screen.findByText(/رسید قدیمی‌تر از ۷ رسید/)).toBeTruthy();
  });

  it("goes back to the dashboard for an admin", async () => {
    fakeApi(routes());
    const tg = stubTelegram();
    renderReview("admin");
    await screen.findByText("رسیدهای در انتظار تأیید");
    pressTelegramBack(tg);
    expect(await screen.findByText("نمای کلی پلتفرم")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^رسید ۱۰/ })).toBeNull();
  });

  it("goes back to the shop for a reseller", async () => {
    fakeApi(routes({ "GET /api/mini/me": () => ({ json: persona("reseller") }) }));
    const tg = stubTelegram();
    renderReview("reseller");
    await screen.findByText("رسیدهای در انتظار تأیید");
    pressTelegramBack(tg);
    expect(await screen.findByText("آمار فروشگاه")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^رسید ۱۰/ })).toBeNull();
  });

  it("shows the server's refusal when the account may not review", async () => {
    fakeApi(routes({ "GET /api/mini/review": () => ({ status: 403, json: { detail: "اجازهٔ بررسی رسید را ندارید" } }) }));
    renderReview();
    expect(await screen.findByText("اجازهٔ بررسی رسید را ندارید")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^رسید/ })).toBeNull();
  });
});

describe("receipt photo", () => {
  it("is fetched with the Telegram sign-in, shown from a blob address and released on close", async () => {
    const urls = stubObjectUrls("blob:receipt-1");
    const api = fakeApi(routes());
    stubTelegram();
    renderReview();
    const { user, dialog } = await openReceipt(10);
    const photo = (await within(dialog).findByRole("img")) as HTMLImageElement;
    expect(photo.getAttribute("src")).toBe("blob:receipt-1");
    const call = api.callsTo("GET", "/api/mini/review/10/receipt")[0];
    expect(call.headers["X-Telegram-Init-Data"]).toBe("query_id=x&hash=y");
    expect(within(dialog).getByText(HOSTILE)).toBeTruthy();
    expect(document.querySelector("img[onerror]")).toBeNull();

    await user.click(screen.getByRole("button", { name: "بستن" }));
    await waitFor(() => expect(urls.revoke).toHaveBeenCalledWith("blob:receipt-1"));
  });

  it("is never shown from an address that is not a blob", async () => {
    stubObjectUrls("javascript:alert(1)");
    fakeApi(routes());
    renderReview();
    const { dialog } = await openReceipt(10);
    await waitFor(() => expect(within(dialog).getByRole("alert")).toBeTruthy());
    expect(within(dialog).queryByRole("img")).toBeNull();
    expect(document.querySelector('[src^="javascript:"]')).toBeNull();
    expect(within(dialog).getByRole("button", { name: /تأیید پرداخت/ })).toBeTruthy();
  });

  it("shows a safe message when the photo fails and keeps the approve and reject actions", async () => {
    fakeApi(routes({ "GET /api/mini/review/10/receipt": () => ({ status: 400, json: { detail: "دریافت رسید از تلگرام ناموفق بود" } }) }));
    renderReview();
    const { dialog } = await openReceipt(10);
    expect(await within(dialog).findByText("دریافت رسید از تلگرام ناموفق بود")).toBeTruthy();
    expect(within(dialog).queryByRole("img")).toBeNull();
    expect(within(dialog).getByRole("button", { name: /تأیید پرداخت/ })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /رد پرداخت/ })).toBeTruthy();
  });
});

describe("approving and rejecting", () => {
  it("sends nothing when the confirmation is declined", async () => {
    const api = fakeApi(routes());
    renderReview();
    const { user, dialog } = await openReceipt(10);
    await user.click(within(dialog).getByRole("button", { name: /تأیید پرداخت/ }));
    expect(await decide(false)).toBeTruthy();
    expect(api.callsTo("POST", "/api/mini/review")).toHaveLength(0);
  });

  it("approves once on a double tap and reads the queue again", async () => {
    const pending = gate();
    const api = fakeApi(
      routes({
        "POST /api/mini/review/10/approve": async () => {
          await pending.opened;
          return { json: { ok: true, message: "تأیید شد" } };
        },
      }),
    );
    renderReview();
    const { dialog } = await openReceipt(10);
    const approve = within(dialog).getByRole("button", { name: /تأیید پرداخت/ });
    // Two quick taps: the newer question replaces the older one (answered «no»), so one «yes» is one approval.
    fireEvent.click(approve);
    fireEvent.click(approve);
    await decide(true);
    pending.release();
    await waitFor(() => expect(queueReads(api)).toBe(2));
    const posts = api.callsTo("POST", "/api/mini/review");
    expect(posts).toHaveLength(1);
    expect(posts[0].path).toBe("/api/mini/review/10/approve");
    expect(posts[0].body).toEqual({});
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does not retry a lost answer and reads the queue again instead", async () => {
    const api = fakeApi(routes({ "POST /api/mini/review/11/reject": () => "network-error" }));
    renderReview();
    const { user, dialog } = await openReceipt(11);
    await user.click(within(dialog).getByRole("button", { name: /رد پرداخت/ }));
    await decide(true);
    expect((await screen.findAllByText(/نتیجه مشخص نشد/)).length).toBeGreaterThan(0);
    await waitFor(() => expect(queueReads(api)).toBe(2));
    expect(api.callsTo("POST", "/api/mini/review/11/reject")).toHaveLength(1);
  });
});
