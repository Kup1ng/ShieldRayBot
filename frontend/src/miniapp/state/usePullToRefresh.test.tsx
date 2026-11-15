import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { MiniShell } from "../layout/MiniShell";
import { ScreenRouter } from "../screens/ScreenRouter";
import { customerMe, fakeApi, renderMini } from "../test/harness";
import type { Route } from "../types";
import { ARM_PX, DAMPING } from "./usePullToRefresh";

const FAR = 100 + ARM_PX / DAMPING + 10;

function touch(type: "touchstart" | "touchmove" | "touchend", clientY?: number, fingers = 1) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "touches", { value: clientY === undefined ? [] : Array.from({ length: fingers }, () => ({ clientY })) });
  document.dispatchEvent(event);
}

async function pull(toY: number, { fingers = 1 } = {}) {
  await act(async () => {
    touch("touchstart", 100, fingers);
    touch("touchmove", toY);
    touch("touchend");
  });
}

function mount(route: Route = { view: "home" }, me = customerMe()) {
  return renderMini(
    <MiniShell>
      <ScreenRouter />
    </MiniShell>,
    { me, route },
  );
}

const meCalls = (api: ReturnType<typeof fakeApi>) => api.callsTo("GET", "/api/mini/me").length;

afterEach(() => {
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
});

describe("pull to refresh", () => {
  it("reads /me again after a long pull at the top, once", async () => {
    const api = fakeApi({ "GET /api/mini/me": () => ({ json: customerMe() }) });
    mount();
    await pull(FAR);
    await waitFor(() => expect(meCalls(api)).toBe(1));
  });

  it("does nothing for a short pull, a scrolled page or a two-finger pull", async () => {
    const api = fakeApi({ "GET /api/mini/me": () => ({ json: customerMe() }) });
    mount();
    await pull(100 + (ARM_PX / DAMPING) * 0.6);
    await pull(FAR, { fingers: 2 });
    Object.defineProperty(window, "scrollY", { value: 40, configurable: true, writable: true });
    await pull(FAR);
    expect(meCalls(api)).toBe(0);
  });

  it("ignores a second pull while the first refresh is still running", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = fakeApi({
      "GET /api/mini/me": async () => {
        await gate;
        return { json: customerMe() };
      },
    });
    mount();
    await pull(FAR);
    await waitFor(() => expect(meCalls(api)).toBe(1));
    await pull(FAR);
    expect(meCalls(api)).toBe(1);
    await act(async () => release());
  });

  it("stays off while a sheet is open", async () => {
    const api = fakeApi({
      "GET /api/mini/service/7": () => ({ json: { service: { id: 7, username: "svc7", status: "active", subscription_url: "https://sub.example.com/s" } } }),
      "GET /api/mini/service/7/qr": () => ({ json: { png_base64: "iVBORw0KGgo=" } }),
    });
    mount({ view: "service", serviceId: 7 });
    await userEvent.setup().click(await screen.findByRole("button", { name: "QR کد اشتراک" }));
    await screen.findByRole("heading", { name: "QR کد اشتراک" });
    await pull(FAR);
    expect(meCalls(api)).toBe(0);
  });

  it("also reloads the lists of the screen that is open", async () => {
    const admin = customerMe({ persona: "admin", commerce_allowed: false, nav: [{ id: "home", label: "داشبورد" }, { id: "ops", label: "میانبرها" }] });
    const api = fakeApi({
      "GET /api/mini/me": () => ({ json: admin }),
      "GET /api/mini/ops": () => ({ json: { stats: { pending: 0, tickets: 0 }, panel_links: [] } }),
    });
    mount({ view: "home" }, admin);
    await screen.findByText("درآمد پلتفرم");
    expect(api.callsTo("GET", "/api/mini/ops").length).toBe(1);
    await pull(FAR);
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/ops").length).toBe(2));
    expect(meCalls(api)).toBe(1);
  });
});
