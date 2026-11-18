import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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

const gate = (code: string, detail = "ابتدا مرحلهٔ ورود را کامل کنید") => ({ status: 403, json: { detail }, headers: { "X-Mini-Error": code } });
const TERMS_STEP = { step: "terms", text: "متن قوانین", button: "می‌پذیرم" };
const FORCE_JOIN_STEP = {
  step: "force_join",
  text: "عضو شوید",
  check_label: "عضو شدم",
  channels: [{ label: "کانال", url: "https://t.me/news", status: "missing" }],
};

describe("onboarding at launch", () => {
  it("registers with a referral code, then opens the app with /me read again", async () => {
    installTelegram();
    let registered = false;
    const api = fakeApi({
      "GET /api/mini/me": () => (registered ? { json: customerMe() } : gate("referral_required")),
      "GET /api/mini/onboarding": () => ({ json: { step: "referral", text: "کد معرف لازم است", invalid: false } }),
      "POST /api/mini/onboarding/referral": () => {
        registered = true;
        return { json: { step: "ready" } };
      },
    });
    render(<MiniApp />);
    expect(await screen.findByRole("heading", { name: "ثبت‌نام با کد معرف" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /سلام/ })).toBeNull();
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "کد معرف" }), "3v53");
    await user.click(screen.getByRole("button", { name: "ثبت‌نام" }));
    await home();
    expect(api.callsTo("POST", "/api/mini/onboarding/referral")[0].body).toEqual({ code: "3v53" });
    expect(api.callsTo("GET", "/api/mini/me")).toHaveLength(2);
  });

  it("walks channels, then terms, before the app opens", async () => {
    installTelegram();
    let step = "force_join";
    const api = fakeApi({
      "GET /api/mini/me": () => (step === "ready" ? { json: customerMe() } : gate(step)),
      "GET /api/mini/onboarding": () => ({ json: FORCE_JOIN_STEP }),
      "POST /api/mini/onboarding/join-check": () => {
        step = "terms";
        return { json: TERMS_STEP };
      },
      "POST /api/mini/onboarding/terms": () => {
        step = "ready";
        return { json: { step: "ready" } };
      },
    });
    render(<MiniApp />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "عضو شدم" }));
    await user.click(await screen.findByRole("button", { name: "می‌پذیرم" }));
    await home();
    expect(api.callsTo("POST", "/api/mini/onboarding/join-check")).toHaveLength(1);
    expect(api.callsTo("POST", "/api/mini/onboarding/terms")).toHaveLength(1);
  });

  it("does not go round again when /me still reports a step after the server said every step is done", async () => {
    installTelegram();
    const api = fakeApi({
      "GET /api/mini/me": () => gate("terms", "ابتدا قوانین را بپذیرید"),
      "GET /api/mini/onboarding": () => ({ json: TERMS_STEP }),
      "POST /api/mini/onboarding/terms": () => ({ json: { step: "ready" } }),
    });
    render(<MiniApp />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "می‌پذیرم" }));
    expect(await screen.findByText("ابتدا قوانین را بپذیرید")).toBeTruthy();
    expect(screen.getByRole("button", { name: "تلاش دوباره" })).toBeTruthy();
    expect(api.callsTo("GET", "/api/mini/onboarding")).toHaveLength(1);
    expect(api.callsTo("GET", "/api/mini/me")).toHaveLength(2);
  });

  it("shows the step again when the server holds the person at it under an open screen", async () => {
    installTelegram();
    let held = false;
    fakeApi({
      "GET /api/mini/me": () => ({ json: customerMe() }),
      "GET /api/mini/services": () => (held ? gate("force_join") : { json: { services: [], has_more: false } }),
      "GET /api/mini/onboarding": () => ({ json: FORCE_JOIN_STEP }),
    });
    render(<MiniApp />);
    await home();
    held = true;
    await userEvent.setup().click(screen.getByRole("button", { name: "سرویس‌ها" }));
    expect(await screen.findByRole("heading", { name: "عضویت در کانال‌ها" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "سرویس‌ها" })).toBeNull();
  });

  it("tells someone waiting for an admin's approval so, and asks /me again on «بررسی دوباره»", async () => {
    installTelegram();
    const text = "درخواست ورود شما هنوز تأیید نشده است؛ نتیجه را در ربات می‌بینید.";
    let approved = false;
    const api = fakeApi({ "GET /api/mini/me": () => (approved ? { json: customerMe() } : gate("entry_pending", text)) });
    render(<MiniApp />);
    expect(await screen.findByRole("heading", { name: "در انتظار تأیید" })).toBeTruthy();
    expect(screen.getByText(text)).toBeTruthy();
    expect(api.callsTo("GET", "/api/mini/onboarding")).toHaveLength(0);
    approved = true;
    await userEvent.setup().click(screen.getByRole("button", { name: "بررسی دوباره" }));
    await home();
    expect(api.callsTo("GET", "/api/mini/me")).toHaveLength(2);
  });

  it("shows a blocked account its own screen with the server's reason and no retry", async () => {
    const { tg } = installTelegram();
    fakeApi({ "GET /api/mini/me": () => gate("blocked", "دسترسی شما مسدود شده است") });
    render(<MiniApp />);
    expect(await screen.findByRole("heading", { name: "دسترسی مسدود است" })).toBeTruthy();
    expect(screen.getByText("دسترسی شما مسدود شده است")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /تلاش دوباره|بررسی دوباره/ })).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "بستن مینی‌اپ" }));
    expect(tg.close).toHaveBeenCalledTimes(1);
  });

  it("sends a person who turns out to wait for approval, met during onboarding, to that screen", async () => {
    installTelegram();
    fakeApi({
      "GET /api/mini/me": () => gate("terms"),
      "GET /api/mini/onboarding": () => ({ json: TERMS_STEP }),
      "POST /api/mini/onboarding/terms": () => gate("entry_pending", "درخواست ورود شما هنوز تأیید نشده است"),
    });
    render(<MiniApp />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "می‌پذیرم" }));
    expect(await screen.findByRole("heading", { name: "در انتظار تأیید" })).toBeTruthy();
  });

  it("treats any other 403 as a plain refusal, not as an onboarding step", async () => {
    installTelegram();
    const api = fakeApi({ "GET /api/mini/me": () => gate("forbidden", "دسترسی ندارید") });
    render(<MiniApp />);
    expect(await screen.findByText("دسترسی ندارید")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /تایید دسترسی|عضویت|قوانین|مسدود|در انتظار/ })).toBeNull();
    expect(api.callsTo("GET", "/api/mini/onboarding")).toHaveLength(0);
  });
});

describe("opened in a browser", () => {
  const botMeta = (name: string) => {
    document.head.innerHTML = `<meta name="pg-mini-bot" content="${name}">`;
  };
  afterEach(() => {
    document.head.innerHTML = "";
  });

  it("sends the visitor to the bot in Telegram, without asking the server", { timeout: 15_000 }, async () => {
    const { tg } = installTelegram({ initData: "" });
    botMeta("ShieldRayBot");
    const api = fakeApi({});
    render(<MiniApp />);
    expect(await screen.findByRole("heading", { name: "فقط داخل تلگرام" }, { timeout: 8000 })).toBeTruthy();
    expect(screen.getByText("@ShieldRayBot")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "باز کردن در تلگرام" }));
    expect(tg.openLink).toHaveBeenCalledWith("https://t.me/ShieldRayBot?startapp");
    expect(api.calls).toEqual([]);
  });

  it("falls back to the Open button when the page names no bot", { timeout: 15_000 }, async () => {
    installTelegram({ initData: "" });
    botMeta("not a bot name");
    render(<MiniApp />);
    expect(await screen.findByText(/«Open»/, {}, { timeout: 8000 })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "باز کردن در تلگرام" })).toBeNull();
  });

  it("does not take a launch by Telegram for a browser visit", { timeout: 15_000 }, async () => {
    installTelegram({ initData: "" });
    setLaunchHash("#tgWebAppVersion=8.0&tgWebAppPlatform=ios");
    botMeta("ShieldRayBot");
    fakeApi({});
    render(<MiniApp />);
    expect(await screen.findByText(/«Open»/, {}, { timeout: 8000 })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "فقط داخل تلگرام" })).toBeNull();
  });
});

describe("messages from the bot", () => {
  it("asks Telegram once per device for permission to message a person who opened the app without /start", async () => {
    const stub = installTelegram({
      initDataUnsafe: { user: { allows_write_to_pm: false } },
      isVersionAtLeast: () => true,
      requestWriteAccess: vi.fn(),
    });
    fakeApi({ "GET /api/mini/me": () => ({ json: customerMe() }) });
    const first = render(<MiniApp />);
    await home();
    expect(stub.tg.requestWriteAccess).toHaveBeenCalledTimes(1);
    first.unmount();
    render(<MiniApp />);
    await home();
    expect(stub.tg.requestWriteAccess).toHaveBeenCalledTimes(1);
  });

  it("does not ask someone who already allows messages", async () => {
    const stub = installTelegram({
      initDataUnsafe: { user: { allows_write_to_pm: true } },
      isVersionAtLeast: () => true,
      requestWriteAccess: vi.fn(),
    });
    fakeApi({ "GET /api/mini/me": () => ({ json: customerMe() }) });
    render(<MiniApp />);
    await home();
    expect(stub.tg.requestWriteAccess).not.toHaveBeenCalled();
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
