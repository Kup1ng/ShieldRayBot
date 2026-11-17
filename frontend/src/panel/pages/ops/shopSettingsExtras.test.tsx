import { toast } from "@heroui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppToastProvider } from "@/components/feedback/AppToast";

const get = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelGet: (path: string) => get(path), panelAction: vi.fn() };
});
vi.mock("../../core/confirm", () => ({ confirm: () => Promise.resolve(true) }));
vi.mock("../../core/session", () => ({
  usePanelSession: () => ({ session: { csrf_token: "token", alerts: { tickets: 0, inbox: false, cancellations: false } }, refresh: vi.fn() }),
}));
vi.mock("../../layout/PanelShell", () => ({ PanelShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { ShopSettingsPage } from "./ShopSettingsPage";
import type { MiniappExtra, NotificationsExtra, ShopSettings } from "./types";

beforeEach(() => get.mockReset());
afterEach(() => {
  cleanup();
  toast.clear();
});

function settings(tab: string, extra: unknown): ShopSettings {
  return { tab, nav: [], preview: false, shop_title: "فروشگاه", reset: { enabled: false, confirm: "" }, style_options: [], sections: [], extra: extra as Record<string, unknown> };
}

function mount() {
  return render(
    <>
      <AppToastProvider />
      <ShopSettingsPage />
    </>,
  );
}

const MINIAPP: MiniappExtra = { available: true, blocker: "", on: true, url: "https://panel.example/miniapp/s/key1/", accent: "", notice: "", presets: [] };

describe("shop Mini App tab", () => {
  it("shows the switch and the shop's address while the Mini App is on", async () => {
    window.history.replaceState(null, "", "/shop-settings?tab=miniapp");
    get.mockResolvedValue(settings("miniapp", MINIAPP));
    mount();
    expect(await screen.findByText("مینی‌اپ فروشگاه")).toBeTruthy();
    expect(screen.getByText(MINIAPP.url).getAttribute("dir")).toBe("ltr");
  });

  it("hides the address while the switch is off", async () => {
    window.history.replaceState(null, "", "/shop-settings?tab=miniapp");
    get.mockResolvedValue(settings("miniapp", { ...MINIAPP, on: false }));
    mount();
    await screen.findByText("مینی‌اپ فروشگاه");
    expect(screen.queryByText(MINIAPP.url)).toBeNull();
  });

  it("explains what to do next instead of the switch when the shop may not use it, with hostile text as text", async () => {
    window.history.replaceState(null, "", "/shop-settings?tab=miniapp");
    const hostile = '<img src=x onerror="alert(1)">';
    get.mockResolvedValue(settings("miniapp", { ...MINIAPP, available: false, on: false, url: "", blocker: hostile }));
    mount();
    expect(await screen.findByText(hostile)).toBeTruthy();
    expect(screen.queryByText("مینی‌اپ فروشگاه")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("shop alerts tab", () => {
  it("marks only the panel's own alerts as system", async () => {
    window.history.replaceState(null, "", "/shop-settings?tab=notifications");
    const extra: NotificationsExtra = {
      items: [
        { key: "notify_service_cancellation", title: "لغو سرویس", help: "", on: true, system: false },
        { key: "notify_panel_delivery_failures", title: "خطای تحویل", help: "", on: false, system: true },
      ],
    };
    get.mockResolvedValue(settings("notifications", extra));
    mount();
    expect(await screen.findByText("هشدارهای تلگرام فروشگاه")).toBeTruthy();
    expect(screen.getAllByText("سیستم")).toHaveLength(1);
    expect(screen.getByText("خطای تحویل").closest("label")?.textContent).toContain("سیستم");
    expect(screen.getByText("لغو سرویس").closest("label")?.textContent).not.toContain("سیستم");
  });
});
