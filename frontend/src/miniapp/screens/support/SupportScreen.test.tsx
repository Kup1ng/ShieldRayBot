import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MiniShell } from "../../layout/MiniShell";
import { customerMe, fakeApi, renderMini, type FakeHandler } from "../../test/harness";
import type { MePayload, Route } from "../../types";
import { ScreenRouter } from "../ScreenRouter";

const HOSTILE = "<img src=x onerror=alert(1)>";

const SUPPORT = {
  text: HOSTILE,
  contacts: [
    { title: HOSTILE, url: "https://t.me/support_team" },
    { title: "بد", url: "javascript:alert(1)" },
  ],
  tickets: [{ id: 5, subject: HOSTILE, status: "answered", status_fa: "پاسخ‌داده‌شده", is_closed: false, updated_at: null }],
};

const thread = (extra: Record<string, unknown> = {}) => ({
  ticket: {
    id: 5,
    subject: HOSTILE,
    status: "open",
    status_fa: "باز",
    is_closed: false,
    updated_at: null,
    messages: [{ id: 1, from_staff: true, body: HOSTILE, created_at: null }],
    ...extra,
  },
});

const base: Record<string, FakeHandler> = {
  "GET /api/mini/support": () => ({ json: SUPPORT }),
  "GET /api/mini/support/tickets/5": () => ({ json: thread() }),
  "GET /api/mini/me": () => ({ json: customerMe() }),
};

function renderApp(route: Route, me: MePayload = customerMe()) {
  return renderMini(
    <MiniShell>
      <ScreenRouter />
    </MiniShell>,
    { me, route },
  );
}

/** Telegram stand-in: the back button handler and the t.me / external link openers. */
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

/** Press Telegram's back button the way Telegram does: through the handler the app registered. */
function pressTelegramBack(tg: ReturnType<typeof stubTelegram>) {
  const calls = tg.BackButton.onClick.mock.calls;
  const handler = calls[calls.length - 1]?.[0] as (() => void) | undefined;
  expect(handler, "the app registered a back handler").toBeTypeOf("function");
  act(() => handler!());
}

beforeEach(async () => {
  window.history.replaceState(null, "", "#");
  // Let a hashchange from the previous test land before this one mounts.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

afterEach(() => {
  Reflect.deleteProperty(window, "Telegram");
  vi.restoreAllMocks();
});

describe("support page", () => {
  it("renders customer and admin text as text, never as markup, on the page and in the thread", async () => {
    fakeApi(base);
    const { container } = renderApp({ view: "support" });
    await screen.findByText(/تیکت‌های من/);
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(screen.getAllByText(HOSTILE, { exact: false }).length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^تیکت <img/ }));
    await screen.findByRole("list", { name: "پیام‌ها" });
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(within(screen.getByRole("list", { name: "پیام‌ها" })).getByText(HOSTILE)).toBeTruthy();
  });

  it("opens only t.me contact links and drops anything else", async () => {
    fakeApi(base);
    const tg = stubTelegram();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    renderApp({ view: "support" });
    const user = userEvent.setup();
    await screen.findByText(/تیکت‌های من/);

    await user.click(screen.getByRole("button", { name: /گفتگو با بد/ }));
    expect(tg.openTelegramLink).not.toHaveBeenCalled();
    expect(tg.openLink).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /گفتگو با <img/ }));
    expect(tg.openTelegramLink.mock.calls).toEqual([["https://t.me/support_team"]]);
  });

  it("shows an empty state when the customer has no tickets", async () => {
    fakeApi({ ...base, "GET /api/mini/support": () => ({ json: { text: "", contacts: [], tickets: [] } }) });
    renderApp({ view: "support" });
    expect(await screen.findByText("هنوز تیکتی ندارید.")).toBeTruthy();
  });

  it("shows the ticket number in its own direction inside the list", async () => {
    fakeApi({
      ...base,
      "GET /api/mini/support": () => ({
        json: { text: "", contacts: [], tickets: [{ id: 12, subject: "x", status: "open", status_fa: "باز", is_closed: false, updated_at: null }] },
      }),
    });
    renderApp({ view: "support" });
    const number = await screen.findByText("#۱۲");
    expect(number.tagName).toBe("BDI");
  });
});

describe("new ticket", () => {
  async function openForm() {
    const user = userEvent.setup();
    await screen.findByText(/تیکت‌های من/);
    await user.click(screen.getByRole("button", { name: "تیکت جدید" }));
    const subject = await screen.findByRole("textbox", { name: "موضوع" });
    const body = screen.getByRole("textbox", { name: "متن پیام" });
    return { user, subject, body, submit: screen.getByRole("button", { name: /ثبت تیکت/ }) };
  }

  it("never sends an empty subject", async () => {
    const api = fakeApi(base);
    renderApp({ view: "support" });
    const { user, subject, body, submit } = await openForm();
    await user.type(subject, "   ");
    await user.type(body, "x");
    await user.click(submit);
    expect(api.callsTo("POST", "/api/mini/support/tickets")).toHaveLength(0);
  });

  it("sends once on a double tap and opens the new thread", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = fakeApi({
      ...base,
      "POST /api/mini/support/tickets": async () => {
        await gate;
        return { json: { ticket_id: 5, message: "ok" } };
      },
    });
    renderApp({ view: "support" });
    const { user, subject, body, submit } = await openForm();
    await user.type(subject, "vpn");
    await user.type(body, "down");
    await user.click(submit);
    await user.click(submit);
    release();
    await screen.findByRole("list", { name: "پیام‌ها" });
    const posts = api.callsTo("POST", "/api/mini/support/tickets");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ subject: "vpn", body: "down" });
    expect(api.callsTo("GET", "/api/mini/support/tickets/5").length).toBeGreaterThan(0);
  });

  it("does not resend after a lost reply and tells the customer to check the list first", async () => {
    const api = fakeApi({ ...base, "POST /api/mini/support/tickets": () => "network-error" });
    renderApp({ view: "support" });
    const { user, subject, body, submit } = await openForm();
    await user.type(subject, "vpn");
    await user.type(body, "down");
    await user.click(submit);
    expect((await screen.findAllByText(/نتیجه مشخص نشد/)).length).toBeGreaterThan(0);
    expect(api.callsTo("POST", "/api/mini/support/tickets")).toHaveLength(1);
    // The list is read again so a ticket that did get created shows up.
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/support").length).toBeGreaterThan(1));
  });
});

describe("ticket thread", () => {
  async function openThread(routes: Record<string, FakeHandler> = {}) {
    const api = fakeApi({ ...base, ...routes });
    const view = renderApp({ view: "ticket", ticketId: 5 });
    const user = userEvent.setup();
    await screen.findByRole("list", { name: "پیام‌ها" });
    return { api, user, ...view };
  }

  it("sends a reply once even when tapped twice, and re-reads /me so the support badge can drop", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { api, user } = await openThread({
      "POST /api/mini/support/tickets/5/messages": async () => {
        await gate;
        return { json: { ticket_id: 5 } };
      },
    });
    const meBefore = api.callsTo("GET", "/api/mini/me").length;
    await user.type(screen.getByPlaceholderText("پاسخ خود را بنویسید"), "any news?");
    const send = screen.getByRole("button", { name: /ارسال/ });
    await user.click(send);
    await user.click(send);
    release();
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/me").length).toBe(meBefore + 1));
    const posts = api.callsTo("POST", "/api/mini/support/tickets/5/messages");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ body: "any news?" });
    expect(posts[0].headers["Content-Type"]).toBe("application/json");
  });

  it("does not resend a lost reply and reads the thread again instead", async () => {
    const { api, user } = await openThread({ "POST /api/mini/support/tickets/5/messages": () => "network-error" });
    const readsBefore = api.callsTo("GET", "/api/mini/support/tickets/5").length;
    await user.type(screen.getByPlaceholderText("پاسخ خود را بنویسید"), "again");
    await user.click(screen.getByRole("button", { name: /ارسال/ }));
    expect((await screen.findAllByText(/نتیجه مشخص نشد/)).length).toBeGreaterThan(0);
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/support/tickets/5").length).toBeGreaterThan(readsBefore));
    expect(api.callsTo("POST", "/api/mini/support/tickets/5/messages")).toHaveLength(1);
  });

  it("never sends an empty reply", async () => {
    const { api, user } = await openThread();
    await user.click(screen.getByRole("button", { name: /ارسال/ }));
    expect(api.callsTo("POST", "/api/mini/support/tickets/5/messages")).toHaveLength(0);
  });

  it("offers no reply form on a closed ticket", async () => {
    fakeApi({ ...base, "GET /api/mini/support/tickets/5": () => ({ json: thread({ status: "closed", is_closed: true }) }) });
    renderApp({ view: "ticket", ticketId: 5 });
    await screen.findByText(/این تیکت بسته شده است/);
    expect(screen.queryByPlaceholderText("پاسخ خود را بنویسید")).toBeNull();
    expect(screen.queryByRole("button", { name: /ارسال/ })).toBeNull();
  });

  it("shows the ticket number in its own direction", async () => {
    await openThread();
    const number = screen.getByText("#۵");
    expect(number.tagName).toBe("BDI");
  });
});

describe("navigation", () => {
  it("Back goes ticket, then support, then home", async () => {
    fakeApi(base);
    const tg = stubTelegram();
    renderApp({ view: "ticket", ticketId: 5 });
    await screen.findByRole("list", { name: "پیام‌ها" });
    expect(tg.BackButton.show).toHaveBeenCalled();

    pressTelegramBack(tg);
    await screen.findByText("تیکت‌های من");
    pressTelegramBack(tg);
    expect(await screen.findByText(/سلام/)).toBeTruthy();
    expect(screen.queryByText("تیکت‌های من")).toBeNull();
  });

  it("a sub-page offers the dashboard button, the home page does not", async () => {
    fakeApi(base);
    renderApp({ view: "ticket", ticketId: 5 });
    await screen.findByRole("list", { name: "پیام‌ها" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "داشبورد" }));
    expect(await screen.findByText(/سلام/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "داشبورد" })).toBeNull();
  });

  it("keeps the admin out of support and ticket screens", async () => {
    const api = fakeApi({ ...base, "GET /api/mini/ops": () => ({ json: { stats: {}, panel_links: [] } }) });
    const admin = customerMe({ persona: "admin", commerce_allowed: false, nav: [{ id: "home", label: "داشبورد" }, { id: "ops", label: "میانبرها" }] });
    renderApp({ view: "support" }, admin);
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/ops").length).toBeGreaterThan(0));
    expect(screen.queryByText("تیکت‌های من")).toBeNull();
    expect(api.callsTo("GET", "/api/mini/support")).toHaveLength(0);
  });

  it("keeps a shop Mini App without the support section out of support", async () => {
    const api = fakeApi(base);
    renderApp({ view: "ticket", ticketId: 5 }, customerMe({ sections: ["services", "shop"] }));
    expect(await screen.findByText(/سلام/)).toBeTruthy();
    expect(api.callsTo("GET", "/api/mini/support")).toHaveLength(0);
  });
});
