import { act, screen } from "@testing-library/react";
import { useEffect } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MiniShell } from "../layout/MiniShell";
import { ScreenRouter } from "../screens/ScreenRouter";
import { customerMe, fakeApi, renderMini } from "../test/harness";
import { installTelegram } from "../test/telegram";
import { useMini, type MiniContextValue } from "./store";

const probe: { current: MiniContextValue | null } = { current: null };
/** Hands the live Mini App context to the test, so it can navigate like a screen would. */
function Probe() {
  const ctx = useMini();
  useEffect(() => {
    probe.current = ctx;
  });
  return null;
}
const mini = () => probe.current as MiniContextValue;

const adminMe = () =>
  customerMe({
    persona: "admin",
    commerce_allowed: false,
    nav: [
      { id: "home", label: "داشبورد" },
      { id: "ops", label: "میانبرها" },
    ],
    user: { id: 2000, name: "مدیر", role: "admin", wallet: 0 },
    customer: { wallet: 0, wallet_pay_enabled: false, qr_enabled: false, commerce_allowed: false, home: { service_count: 0, attention: [], recent: [] } },
  });

const OPS = {
  stats: { pending: 2, tickets: 0, revenue: 10 },
  panel_base: "https://panel.example.com",
  panel_links: [{ id: "finance", label: "مالی", path: "/finance" }],
};

function mountAdmin() {
  return renderMini(
    <MiniShell>
      <Probe />
      <ScreenRouter />
    </MiniShell>,
    { me: adminMe() },
  );
}

describe("admin persona", () => {
  it("has no commerce screens: shop and service routes land on the dashboard and nothing is bought", async () => {
    const api = fakeApi({ "GET /api/mini/ops": () => ({ json: OPS }) });
    mountAdmin();
    await screen.findByText("درآمد پلتفرم");
    act(() => mini().go("shop"));
    expect(mini().route.view).toBe("home");
    act(() => mini().go("service", { serviceId: 7 }));
    expect(mini().route.view).toBe("home");
    expect(screen.getByText("درآمد پلتفرم")).toBeTruthy();
    expect(api.calls.filter((c) => c.method !== "GET")).toEqual([]);
    expect(api.callsTo("GET", "/api/mini/service")).toEqual([]);
  });

  it("shows the panel shortcuts the server sends", async () => {
    fakeApi({ "GET /api/mini/ops": () => ({ json: OPS }) });
    mountAdmin();
    expect(await screen.findByRole("button", { name: /مالی/ })).toBeTruthy();
  });
});

describe("panel links", () => {
  it("open only paths on the panel host", async () => {
    const { tg } = installTelegram();
    fakeApi({ "GET /api/mini/ops": () => ({ json: OPS }) });
    mountAdmin();
    await screen.findByText("درآمد پلتفرم");
    for (const path of ["//evil.example", "https://evil.example/x", "javascript:alert(1)", "/\\evil", "finance"]) {
      act(() => mini().openPanelPath(path));
    }
    expect(tg.openLink).not.toHaveBeenCalled();
    await userEvent.setup().click(await screen.findByRole("button", { name: /مالی/ }));
    expect(tg.openLink).toHaveBeenCalledTimes(1);
    expect(tg.openLink).toHaveBeenCalledWith("https://panel.example.com/finance");
  });
});
