import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MiniShell } from "../../layout/MiniShell";
import { customerMe, fakeApi, renderMini } from "../../test/harness";
import type { Route } from "../../types";
import { ScreenRouter } from "../ScreenRouter";

const HOSTILE = "<img src=x onerror=alert(1)>";

const opsBody = (canReview: boolean) => ({
  stats: { pending: 1, tickets: 0, revenue: 5 },
  can_review: canReview,
  panel_base: "https://panel.example.com",
  panel_links: [{ id: "finance", label: HOSTILE, path: "/finance" }],
});

const admin = () =>
  customerMe({
    persona: "admin",
    commerce_allowed: false,
    nav: [
      { id: "home", label: "داشبورد" },
      { id: "ops", label: "میانبرها" },
    ],
  });

function renderApp(route: Route, me = admin()) {
  return renderMini(
    <MiniShell>
      <ScreenRouter />
    </MiniShell>,
    { me, route },
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

beforeEach(async () => {
  window.history.replaceState(null, "", "#");
  await new Promise((resolve) => setTimeout(resolve, 0));
});

afterEach(() => {
  Reflect.deleteProperty(window, "Telegram");
  vi.restoreAllMocks();
});

describe.each([
  ["the admin dashboard", { view: "home" } as Route],
  ["the shortcuts screen", { view: "ops" } as Route],
])("admin shortcuts on %s", (_name, route) => {
  it("offers receipt review in the app when the account may review", async () => {
    fakeApi({ "GET /api/mini/ops": () => ({ json: opsBody(true) }) });
    const { container } = renderApp(route);
    expect(await screen.findByRole("button", { name: /بررسی رسیدها/ })).toBeTruthy();
    // Panel link labels are text, and the link opens the panel page.
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByRole("button", { name: new RegExp(HOSTILE.replace(/[()]/g, "\\$&")) })).toBeTruthy();
  });

  it("offers no receipt review otherwise, and never commerce shortcuts for an admin", async () => {
    fakeApi({ "GET /api/mini/ops": () => ({ json: opsBody(false) }) });
    renderApp(route);
    await screen.findByRole("button", { name: new RegExp(HOSTILE.replace(/[()]/g, "\\$&")) });
    expect(screen.queryByRole("button", { name: /بررسی رسیدها/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /شارژ/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /خرید/ })).toBeNull();
  });
});

describe("admin shortcut actions", () => {
  it("opens the receipt queue inside the app", async () => {
    fakeApi({ "GET /api/mini/ops": () => ({ json: opsBody(true) }), "GET /api/mini/review": () => ({ json: { items: [], total: 0 } }) });
    renderApp({ view: "ops" });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /بررسی رسیدها/ }));
    expect(await screen.findByText("رسیدی در انتظار بررسی نیست.")).toBeTruthy();
  });

  it("opens a panel link on the panel address from the server", async () => {
    fakeApi({ "GET /api/mini/ops": () => ({ json: opsBody(false) }) });
    const tg = stubTelegram();
    renderApp({ view: "ops" });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: new RegExp(HOSTILE.replace(/[()]/g, "\\$&")) }));
    expect(tg.openLink.mock.calls).toEqual([["https://panel.example.com/finance"]]);
  });
});

describe("shop branding", () => {
  it("never lets a shop accent colour change the ShieldRay theme", async () => {
    fakeApi({ "GET /api/mini/ops": () => ({ json: opsBody(false) }) });
    const root = document.documentElement;
    const before = root.getAttribute("style") ?? "";
    renderApp({ view: "home" }, customerMe({ brand: { name: "Nova", accent: "#f97316" } }));
    await screen.findByText(/سلام/);
    expect(root.style.getPropertyValue("--brand-custom")).toBe("");
    expect(root.style.getPropertyValue("--accent")).toBe("");
    expect(root.style.getPropertyValue("--accent-ink")).toBe("");
    expect(root.getAttribute("style") ?? "").toBe(before);
    expect(root.getAttribute("style") ?? "").not.toMatch(/f97316/i);
  });
});
