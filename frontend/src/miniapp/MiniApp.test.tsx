import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { MiniApp } from "./MiniApp";
import { invalidateAllResources } from "./state/resources";
import { customerMe, fakeApi } from "./test/harness";
import { installTelegram, setLaunchHash } from "./test/telegram";

const EXPIRED_TEXT = "نشست مینی‌اپ منقضی شده؛ مینی‌اپ را ببندید و دوباره باز کنید";
const expired = () => ({ status: 401, json: { detail: EXPIRED_TEXT }, headers: { "X-Mini-Error": "expired" } });

afterEach(() => {
  cleanup();
  invalidateAllResources();
});

async function home() {
  return screen.findByRole("heading", { name: /سلام/ });
}

describe("launch inside Telegram", () => {
  it("reads /me (the club for the invite code, the offer to add a previous service) with Telegram's signed sign-in and shows the customer's wallet", async () => {
    installTelegram({ initData: "query_id=x&hash=y" });
    const api = fakeApi({ "GET /api/mini/me": () => ({ json: customerMe() }) });
    render(<MiniApp />);
    await home();
    await waitFor(() => expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /api/mini/me", "GET /api/mini/club", "GET /api/mini/service-import/offer"]));
    expect(api.calls[0].headers["X-Telegram-Init-Data"]).toBe("query_id=x&hash=y");
    expect(screen.getByText("۲۴۰,۰۰۰ تومان")).toBeTruthy();
  });

  it("renders hostile customer text as text, never as markup", async () => {
    installTelegram();
    const me = customerMe();
    me.user.name = "<img src=x onerror=alert(1)>";
    fakeApi({ "GET /api/mini/me": () => ({ json: me }) });
    render(<MiniApp />);
    await home();
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(screen.getAllByText(/<img src=x/).length).toBeGreaterThan(0);
  });

  it("paints Telegram's header and overscroll with the page colour and follows the theme switch", async () => {
    const { tg } = installTelegram({ colorScheme: "dark" });
    fakeApi({ "GET /api/mini/me": () => ({ json: customerMe() }) });
    render(<MiniApp />);
    await home();
    expect(tg.setHeaderColor).toHaveBeenLastCalledWith("#0E0D0E");
    expect(tg.setBackgroundColor).toHaveBeenLastCalledWith("#0E0D0E");
    await userEvent.setup().click(screen.getByRole("button", { name: "حالت روشن" }));
    expect(tg.setHeaderColor).toHaveBeenLastCalledWith("#F0F0F1");
    expect(tg.setBackgroundColor).toHaveBeenLastCalledWith("#F0F0F1");
  });

  it("applies Telegram's top insets only while the app is fullscreen", async () => {
    const stub = installTelegram();
    fakeApi({ "GET /api/mini/me": () => ({ json: customerMe() }) });
    render(<MiniApp />);
    await home();
    const root = document.documentElement;
    expect(root.hasAttribute("data-fullscreen")).toBe(false);
    stub.tg.isFullscreen = true;
    act(() => stub.events.fullscreenChanged());
    expect(root.hasAttribute("data-fullscreen")).toBe(true);
    stub.tg.isFullscreen = false;
    act(() => stub.events.fullscreenChanged());
    expect(root.hasAttribute("data-fullscreen")).toBe(false);
  });

  it("switches Telegram's own swipe-to-close off once, so pulling down refreshes instead", async () => {
    const { tg } = installTelegram();
    fakeApi({ "GET /api/mini/me": () => ({ json: customerMe() }) });
    render(<MiniApp />);
    await home();
    expect(tg.ready).toHaveBeenCalledTimes(1);
    expect(tg.disableVerticalSwipes).toHaveBeenCalledTimes(1);
  });
});

describe("launch without the Telegram SDK", () => {
  const INIT = "query_id=AA&user=%7B%22id%22%3A7%7D&auth_date=1&hash=abc";
  const TG_HASH = `#tgWebAppData=${encodeURIComponent(INIT)}&tgWebAppVersion=7.10&tgWebAppPlatform=tdesktop`;
  const slow = { timeout: 8000 };

  it("signs in with the initData from the address and leaves the address as it was", { timeout: 15_000 }, async () => {
    setLaunchHash(TG_HASH);
    const api = fakeApi({ "GET /api/mini/me": () => ({ json: customerMe() }) });
    render(<MiniApp />);
    await screen.findByRole("heading", { name: /سلام/ }, slow);
    expect(api.callsTo("GET", "/api/mini/me")[0].headers["X-Telegram-Init-Data"]).toBe(INIT);
    expect(window.location.hash).toBe(TG_HASH);
  });

  it("treats Telegram's parameters as no route at all", { timeout: 15_000 }, async () => {
    setLaunchHash(TG_HASH);
    fakeApi({ "GET /api/mini/me": () => ({ json: customerMe() }) });
    render(<MiniApp />);
    await screen.findByRole("heading", { name: /سلام/ }, slow);
    expect(screen.getByRole("region", { name: "کارهای اصلی" })).toBeTruthy();
  });

  it("still opens a route written before Telegram's parameters", { timeout: 15_000 }, async () => {
    setLaunchHash(`#support?${TG_HASH.slice(1)}`);
    const api = fakeApi({
      "GET /api/mini/me": () => ({ json: customerMe() }),
      "GET /api/mini/support": () => ({ json: { tickets: [], contacts: [], enabled: true } }),
    });
    render(<MiniApp />);
    await screen.findByRole("heading", { name: "تیکت‌های من" }, slow);
    expect(api.callsTo("GET", "/api/mini/support").length).toBe(1);
    expect(screen.queryByRole("region", { name: "کارهای اصلی" })).toBeNull();
  });

  it("explains the VPN case when the SDK is blocked and there is no sign-in, without asking the server", { timeout: 15_000 }, async () => {
    const api = fakeApi({ "GET /api/mini/me": () => ({ json: customerMe() }) });
    render(<MiniApp />);
    expect(await screen.findByText(/VPN/, {}, slow)).toBeTruthy();
    expect(api.calls).toEqual([]);
  });

  it("tells a visitor outside Telegram to open the app from the Open button", { timeout: 15_000 }, async () => {
    installTelegram({ initData: "" });
    const api = fakeApi({});
    render(<MiniApp />);
    expect(await screen.findByText(/«Open»/, {}, slow)).toBeTruthy();
    expect(api.calls).toEqual([]);
  });

  it("connects an SDK that arrives after the first screen and then binds Telegram's back button", { timeout: 20_000 }, async () => {
    setLaunchHash(`#support?${TG_HASH.slice(1)}`);
    fakeApi({
      "GET /api/mini/me": () => ({ json: customerMe() }),
      "GET /api/mini/support": () => ({ json: { tickets: [], contacts: [], enabled: true } }),
    });
    render(<MiniApp />);
    await screen.findByRole("heading", { name: "تیکت‌های من" }, slow);
    const stub = installTelegram({ initData: "" });
    expect(stub.tg.ready).not.toHaveBeenCalled();
    await waitFor(() => expect(stub.tg.ready).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await waitFor(() => expect(stub.back.handler).not.toBeNull());
    expect(stub.back.visible).toBe(true);
  });
});

describe("terms gate at launch", () => {
  const gate = () => ({ status: 403, json: { detail: "ابتدا قوانین را بپذیرید" }, headers: { "X-Mini-Error": "terms" } });
  const ACCESS = { required: true, terms: { title: "قوانین و شرایط", text: "متن قوانین" }, referral: { asked: true, required: false } };

  it("shows the access check, records the acceptance and then opens the app", async () => {
    installTelegram();
    let accepted = false;
    const api = fakeApi({
      "GET /api/mini/me": () => (accepted ? { json: customerMe() } : gate()),
      "GET /api/mini/access": () => ({ json: ACCESS }),
      "POST /api/mini/access": () => {
        accepted = true;
        return { json: { ok: true } };
      },
    });
    render(<MiniApp />);
    expect(await screen.findByRole("heading", { name: "تایید دسترسی" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /سلام/ })).toBeNull();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: /با قوانین و شرایط استفاده موافقم/ }));
    await user.type(screen.getByRole("textbox", { name: "کد دعوت" }), "3v53");
    await user.click(screen.getByRole("button", { name: "ثبت" }));
    await home();
    expect(api.callsTo("POST", "/api/mini/access")[0].body).toEqual({ accept: true, referral_code: "3v53" });
    expect(api.callsTo("GET", "/api/mini/me")).toHaveLength(2);
  });

  it("treats any other 403 as a plain refusal, not as the terms gate", async () => {
    installTelegram();
    const api = fakeApi({ "GET /api/mini/me": () => ({ status: 403, json: { detail: "دسترسی ندارید" }, headers: { "X-Mini-Error": "blocked" } }) });
    render(<MiniApp />);
    expect(await screen.findByText("دسترسی ندارید")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "تایید دسترسی" })).toBeNull();
    expect(api.callsTo("GET", "/api/mini/access")).toHaveLength(0);
  });
});

describe("a server refusal at launch", () => {
  it("offers closing the app, not a retry that cannot work, when the session expired", async () => {
    const { tg } = installTelegram();
    fakeApi({ "GET /api/mini/me": expired });
    render(<MiniApp />);
    expect(await screen.findByText(EXPIRED_TEXT)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "تلاش دوباره" })).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "بستن مینی‌اپ" }));
    expect(tg.close).toHaveBeenCalledTimes(1);
  });

  it("replaces an open screen with the reopen notice when the session expires under it", async () => {
    installTelegram();
    fakeApi({
      "GET /api/mini/me": () => ({ json: customerMe() }),
      "GET /api/mini/services": expired,
    });
    render(<MiniApp />);
    await home();
    expect(screen.getByRole("button", { name: "حالت روشن" })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "سرویس‌ها" }));
    expect(await screen.findByText(EXPIRED_TEXT)).toBeTruthy();
    expect(screen.getByRole("button", { name: "بستن مینی‌اپ" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "حالت روشن" })).toBeNull();
  });

  it("shows a refusal the server explains in Persian as is, with a retry that reads /me again", async () => {
    installTelegram();
    const off = "مینی‌اپ این فروشگاه فعال نیست";
    let open = false;
    const api = fakeApi({ "GET /api/mini/me": () => (open ? { json: customerMe() } : { status: 404, json: { detail: off } }) });
    render(<MiniApp />);
    expect(await screen.findByText(off)).toBeTruthy();
    expect(document.body.textContent).not.toContain("/start");
    open = true;
    await userEvent.setup().click(screen.getByRole("button", { name: "تلاش دوباره" }));
    await home();
    expect(api.callsTo("GET", "/api/mini/me").length).toBe(2);
  });

  it("never renders a reason header that is not a short code", async () => {
    installTelegram();
    fakeApi({
      "GET /api/mini/me": () => ({ status: 401, json: { detail: EXPIRED_TEXT }, headers: { "X-Mini-Error": "<img src=x onerror=alert(1)>" } }),
    });
    render(<MiniApp />);
    expect(await screen.findByText(EXPIRED_TEXT)).toBeTruthy();
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByRole("button", { name: "بستن مینی‌اپ" })).toBeTruthy();
  });

  it("never shows English server internals, only a Persian retry message", async () => {
    installTelegram();
    fakeApi({ "GET /api/mini/me": () => ({ status: 500, json: { detail: "Traceback: sqlalchemy error at 10.0.0.5" } }) });
    render(<MiniApp />);
    expect(await screen.findByText(/دوباره تلاش کنید/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("sqlalchemy");
  });
});
