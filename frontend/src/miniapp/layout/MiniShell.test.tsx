import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ScreenRouter } from "../screens/ScreenRouter";
import { customerMe, fakeApi, renderMini } from "../test/harness";
import { installTelegram } from "../test/telegram";
import type { Route } from "../types";
import { MiniShell } from "./MiniShell";

const HOSTILE = "<img src=x onerror=alert(1)>";
const SERVICE = { id: 7, username: "svc7", status: "active", status_fa: "فعال", traffic: "1 از 10 گیگ", traffic_pct: 10, subscription_url: "https://sub.example.com/sub/secret-token" };

function shell(route?: Route, me = customerMe()) {
  return renderMini(
    <MiniShell>
      <ScreenRouter />
    </MiniShell>,
    route ? { me, route } : { me },
  );
}

describe("Telegram back button", () => {
  it("closes the sheet first, then leaves the detail, then returns home and hides itself", async () => {
    const { back } = installTelegram();
    fakeApi({
      "GET /api/mini/service/7": () => ({ json: { service: SERVICE } }),
      "GET /api/mini/service/7/qr": () => ({ json: { png_base64: "iVBORw0KGgo=" } }),
      "GET /api/mini/services": () => ({ json: { items: [SERVICE], next_before_id: null } }),
    });
    shell({ view: "service", serviceId: 7 });
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    await waitFor(() => expect(back.visible).toBe(true));

    await userEvent.setup().click(screen.getByRole("button", { name: "QR کد اشتراک" }));
    expect(await screen.findByRole("heading", { name: "QR کد اشتراک" })).toBeTruthy();
    act(() => back.handler?.());
    await waitFor(() => expect(screen.queryByRole("heading", { name: "QR کد اشتراک" })).toBeNull());
    expect(screen.getByRole("heading", { name: "سرویس فعلی" })).toBeTruthy();

    act(() => back.handler?.());
    expect(await screen.findByRole("list", { name: "فهرست سرویس‌ها" })).toBeTruthy();

    act(() => back.handler?.());
    expect(await screen.findByRole("heading", { name: /سلام/ })).toBeTruthy();
    await waitFor(() => expect(back.visible).toBe(false));
  });

  it("returns to the dashboard from a section with the top-bar dashboard button", async () => {
    fakeApi({ "GET /api/mini/services": () => ({ json: { items: [], next_before_id: null } }) });
    shell({ view: "services" });
    await userEvent.setup().click(await screen.findByRole("button", { name: "داشبورد" }));
    expect(await screen.findByRole("heading", { name: /سلام/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "داشبورد" })).toBeNull();
  });
});

describe("shop brand", () => {
  /** The logo in the top bar (the page backdrop is an image too). */
  const defaultLogo = () => document.querySelector("img[width=\"30\"]")?.getAttribute("src");

  it("shows only the logo in the top bar, naming the shop for screen readers", () => {
    fakeApi({});
    shell(undefined, customerMe({ brand: { name: "Nova" } }));
    expect(screen.getByRole("img", { name: "Nova" })).toBeTruthy();
    expect(screen.queryByText("Nova")).toBeNull();
  });

  it("names the logo after a shop's own name when it has no saved brand", () => {
    fakeApi({});
    const me = customerMe({ shop: { name: "Shop Name" } });
    delete (me as Partial<typeof me>).brand;
    shell(undefined, me);
    expect(screen.getByRole("img", { name: "Shop Name" })).toBeTruthy();
    expect(screen.queryByText("Shop Name")).toBeNull();
  });

  it("keeps a hostile shop name as plain alt text, never as markup", () => {
    fakeApi({});
    shell(undefined, customerMe({ brand: { name: HOSTILE } }));
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByRole("img", { name: HOSTILE })).toBeTruthy();
  });

  it("uses only a saved profile photo as the logo", () => {
    fakeApi({});
    const plain = shell(undefined, customerMe({ brand: { name: "Nova" } }));
    const fallback = defaultLogo();
    expect(fallback).toBeTruthy();
    plain.unmount();
    for (const logo of ["https://evil.example/x.jpg", '/media/uploads/x.jpg" onerror="alert(1)', "javascript:alert(1)", "/media/uploads/../x.jpg", "//evil.example/x.jpg"]) {
      const { unmount } = shell(undefined, customerMe({ brand: { name: "Nova", logo_url: logo } }));
      expect(defaultLogo(), logo).toBe(fallback);
      unmount();
    }
    shell(undefined, customerMe({ brand: { name: "Nova", logo_url: "/media/uploads/r5_bot_tg_photo_ab12.jpg" } }));
    expect(defaultLogo()).toBe("/media/uploads/r5_bot_tg_photo_ab12.jpg");
  });

  it("keeps ShieldRay's purple whatever accent the shop saved", () => {
    fakeApi({});
    const before = document.documentElement.getAttribute("style") ?? "";
    shell(undefined, customerMe({ brand: { name: "Nova", accent: "#f97316" } }));
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--brand-custom")).toBe("");
    expect(root.style.getPropertyValue("--accent")).toBe("");
    expect(root.style.getPropertyValue("--accent-ink")).toBe("");
    expect(root.getAttribute("style") ?? "").toBe(before);
    expect(document.body.getAttribute("style") ?? "").not.toContain("f97316");
    expect(Array.from(document.querySelectorAll("style")).some((s) => s.textContent?.includes("f97316"))).toBe(false);
  });
});

describe("theme switch", () => {
  it("flips between light and dark and keeps the choice on this device", async () => {
    fakeApi({});
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
    shell();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "حالت تیره" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("shieldray-theme")).toBe("dark");
    await user.click(screen.getByRole("button", { name: "حالت روشن" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("shieldray-theme")).toBe("light");
  });
});
