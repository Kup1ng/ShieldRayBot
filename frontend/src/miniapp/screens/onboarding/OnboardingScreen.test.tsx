import { toast } from "@heroui/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppToastProvider } from "@/components/feedback/AppToast";

import { invalidateAllResources } from "../../state/resources";
import { fakeApi, type FakeHandler } from "../../test/harness";
import { installTelegram } from "../../test/telegram";
import { OnboardingScreen } from "./OnboardingScreen";
import { JOIN_CHECK_PATH, ONBOARDING_PATH, REFERRAL_PATH, TERMS_PATH } from "./onboardingKit";

const HOSTILE = "<img src=x onerror=alert(1)>";
const refused = (status: number, code: string, detail: string) => ({ status, json: { detail }, headers: { "X-Mini-Error": code } });

const REFERRAL = { step: "referral", text: "برای ثبت‌نام کد معرف لازم است.\nاز دوستتان بگیرید.", invalid: false };
const TERMS = { step: "terms", text: `قوانین فروشگاه\n۱. ${HOSTILE}`, button: "می‌پذیرم" };
const channel = (label: string, status: string, url = "https://t.me/news") => ({ label, url, status });
const FORCE_JOIN = {
  step: "force_join",
  text: "ابتدا در کانال‌های زیر عضو شوید.",
  check_label: "عضو شدم",
  channels: [channel("کانال اخبار", "missing"), channel(`کانال ${HOSTILE}`, "joined", "https://t.me/+AbC"), channel("کانال خصوصی", "unverified", "")],
};

function mount(first: unknown, routes: Record<string, FakeHandler> = {}) {
  const onDone = vi.fn();
  const onRefused = vi.fn();
  const api = fakeApi({ [`GET ${ONBOARDING_PATH}`]: () => ({ json: first }), ...routes });
  render(
    <>
      <AppToastProvider />
      <OnboardingScreen onDone={onDone} onRefused={onRefused} />
    </>,
  );
  return { api, onDone, onRefused };
}

afterEach(() => {
  cleanup();
  toast.clear();
  invalidateAllResources();
});

describe("referral step", () => {
  it("shows the admin's text and a left-to-right code field", async () => {
    mount(REFERRAL);
    expect(await screen.findByRole("heading", { name: "ثبت‌نام با کد معرف" })).toBeTruthy();
    expect(screen.getByText(/از دوستتان بگیرید/)).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "کد معرف" }).getAttribute("dir")).toBe("ltr");
  });

  it("sends nothing for an empty code", async () => {
    const user = userEvent.setup();
    const { api } = mount(REFERRAL);
    await screen.findByRole("textbox", { name: "کد معرف" });
    await user.type(screen.getByRole("textbox", { name: "کد معرف" }), "   ");
    await user.click(screen.getByRole("button", { name: "ثبت‌نام" }));
    expect(await screen.findByText("کد معرف را وارد کنید.")).toBeTruthy();
    expect(api.callsTo("POST", REFERRAL_PATH)).toHaveLength(0);
  });

  it("sends the trimmed code once on a double tap and goes on when the server says ready", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { api, onDone } = mount(REFERRAL, {
      [`POST ${REFERRAL_PATH}`]: async () => {
        await gate;
        return { json: { step: "ready" } };
      },
    });
    await user.type(await screen.findByRole("textbox", { name: "کد معرف" }), "  3v53 ");
    const submit = screen.getByRole("button", { name: "ثبت‌نام" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    release();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(api.callsTo("POST", REFERRAL_PATH)).toHaveLength(1);
    expect(api.callsTo("POST", REFERRAL_PATH)[0].body).toEqual({ code: "3v53" });
  });

  it("shows a wrong code's refusal as the server wrote it and lets the person try again", async () => {
    const user = userEvent.setup();
    const { api, onDone } = mount(REFERRAL, {
      [`POST ${REFERRAL_PATH}`]: () => ({ status: 400, json: { detail: "کد معرف معتبر نیست. کد معتبر همین فروشگاه را وارد کنید." } }),
    });
    await user.type(await screen.findByRole("textbox", { name: "کد معرف" }), "NOPE");
    await user.click(screen.getByRole("button", { name: "ثبت‌نام" }));
    expect(await screen.findByText(/کد معرف معتبر نیست/)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "ثبت‌نام" }));
    await waitFor(() => expect(api.callsTo("POST", REFERRAL_PATH)).toHaveLength(2));
  });

  it("tells the person to wait when too many codes were tried", async () => {
    const user = userEvent.setup();
    mount(REFERRAL, { [`POST ${REFERRAL_PATH}`]: () => ({ status: 429, json: { detail: "چند ثانیه صبر کنید و دوباره تلاش کنید" } }) });
    await user.type(await screen.findByRole("textbox", { name: "کد معرف" }), "X1");
    await user.click(screen.getByRole("button", { name: "ثبت‌نام" }));
    expect(await screen.findByText("چند ثانیه صبر کنید و دوباره تلاش کنید")).toBeTruthy();
  });

  it("says so when the code that came with the link was not valid", async () => {
    mount({ ...REFERRAL, invalid: true });
    expect(await screen.findByText(/کد معرفی که همراه لینک آمده بود معتبر نیست/)).toBeTruthy();
  });
});

describe("required channels step", () => {
  it("lists every channel with its status, as text, and opens a join link inside Telegram", async () => {
    const user = userEvent.setup();
    const { tg } = installTelegram();
    mount(FORCE_JOIN);
    const list = await screen.findByRole("list", { name: "کانال‌ها" });
    expect(list.textContent).toContain("کانال اخبار");
    expect(list.textContent).toContain(HOSTILE);
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(list.textContent).toContain("عضو نیستید");
    expect(list.textContent).toContain("عضو هستید");
    expect(list.textContent).toContain("قابل بررسی نیست");
    expect(list.textContent).toContain("لینک عضویت تنظیم نشده");
    // A channel already joined needs no join button.
    expect(screen.queryByRole("button", { name: /عضویت در کانال <img/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "عضویت در کانال اخبار" }));
    expect(tg.openTelegramLink).toHaveBeenCalledWith("https://t.me/news");
  });

  it("asks again with «عضو شدم» once per tap and says when membership is still missing", async () => {
    const user = userEvent.setup();
    const { api, onDone } = mount(FORCE_JOIN, { [`POST ${JOIN_CHECK_PATH}`]: () => ({ json: FORCE_JOIN }) });
    await user.click(await screen.findByRole("button", { name: "عضو شدم" }));
    expect(await screen.findByText(/هنوز عضویت شما تأیید نشد/)).toBeTruthy();
    expect(api.callsTo("POST", JOIN_CHECK_PATH)).toHaveLength(1);
    expect(api.callsTo("POST", JOIN_CHECK_PATH)[0].body).toEqual({});
    expect(onDone).not.toHaveBeenCalled();
  });

  it("goes on once Telegram confirms the membership, and moves to the next step when there is one", async () => {
    const user = userEvent.setup();
    const replies: unknown[] = [{ step: "terms", text: "قوانین", button: "موافقم" }, { step: "ready" }];
    const { onDone } = mount(FORCE_JOIN, { [`POST ${JOIN_CHECK_PATH}`]: () => ({ json: replies.shift() }), [`POST ${TERMS_PATH}`]: () => ({ json: { step: "ready" } }) });
    await user.click(await screen.findByRole("button", { name: "عضو شدم" }));
    expect(await screen.findByRole("heading", { name: "قوانین" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "موافقم" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("uses the admin's label for the check button", async () => {
    mount({ ...FORCE_JOIN, check_label: "عضو شدم، ادامه" });
    expect(await screen.findByRole("button", { name: "عضو شدم، ادامه" })).toBeTruthy();
  });

  it("shows a refusal of the check (too fast) without leaving the step", async () => {
    const user = userEvent.setup();
    mount(FORCE_JOIN, { [`POST ${JOIN_CHECK_PATH}`]: () => ({ status: 429, json: { detail: "چند ثانیه صبر کنید و دوباره تلاش کنید" } }) });
    await user.click(await screen.findByRole("button", { name: "عضو شدم" }));
    expect(await screen.findByText("چند ثانیه صبر کنید و دوباره تلاش کنید")).toBeTruthy();
    expect(screen.getByRole("list", { name: "کانال‌ها" })).toBeTruthy();
  });
});

describe("terms step", () => {
  it("shows the terms as text in a scrollable box with the admin's button label", async () => {
    mount(TERMS);
    const box = await screen.findByRole("region", { name: "متن قوانین" });
    expect(box.getAttribute("tabindex")).toBe("0");
    expect(box.textContent).toContain("قوانین فروشگاه");
    expect(box.textContent).toContain(HOSTILE);
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByRole("button", { name: "می‌پذیرم" })).toBeTruthy();
  });

  it("accepts once on a double tap, with no body to forge, and then goes on", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { api, onDone } = mount(TERMS, {
      [`POST ${TERMS_PATH}`]: async () => {
        await gate;
        return { json: { step: "ready" } };
      },
    });
    const button = await screen.findByRole("button", { name: "می‌پذیرم" });
    fireEvent.click(button);
    fireEvent.click(button);
    release();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(api.callsTo("POST", TERMS_PATH)).toHaveLength(1);
    expect(api.callsTo("POST", TERMS_PATH)[0].body).toEqual({});
  });

  it("a lost reply is not repeated: the state is read again and the next step shown", async () => {
    const user = userEvent.setup();
    let reads = 0;
    const { api, onDone } = mount(TERMS, {
      [`GET ${ONBOARDING_PATH}`]: () => ({ json: reads++ === 0 ? TERMS : { step: "ready" } }),
      [`POST ${TERMS_PATH}`]: () => "network-error",
    });
    await user.click(await screen.findByRole("button", { name: "می‌پذیرم" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(api.callsTo("POST", TERMS_PATH)).toHaveLength(1);
    expect(api.callsTo("GET", ONBOARDING_PATH)).toHaveLength(2);
  });

  it("shows the step that took over when the server holds the person at another one", async () => {
    const user = userEvent.setup();
    let reads = 0;
    mount(TERMS, {
      [`GET ${ONBOARDING_PATH}`]: () => ({ json: reads++ === 0 ? TERMS : FORCE_JOIN }),
      [`POST ${TERMS_PATH}`]: () => refused(403, "force_join", "ابتدا در کانال‌های اجباری عضو شوید"),
    });
    await user.click(await screen.findByRole("button", { name: "می‌پذیرم" }));
    expect(await screen.findByRole("list", { name: "کانال‌ها" })).toBeTruthy();
  });
});

describe("refusals and errors", () => {
  it("hands a blocked person to the app, which shows the blocked screen", async () => {
    const { onRefused, onDone } = mount(null, { [`GET ${ONBOARDING_PATH}`]: () => refused(403, "blocked", "دسترسی شما مسدود شده است") });
    await waitFor(() => expect(onRefused).toHaveBeenCalledTimes(1));
    expect(onRefused.mock.calls[0][0]).toBe("blocked");
    expect(onRefused.mock.calls[0][1].message).toBe("دسترسی شما مسدود شده است");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("hands someone waiting for an admin's approval to the app", async () => {
    const user = userEvent.setup();
    const { onRefused } = mount(TERMS, { [`POST ${TERMS_PATH}`]: () => refused(403, "entry_pending", "درخواست ورود شما هنوز تأیید نشده است") });
    await user.click(await screen.findByRole("button", { name: "می‌پذیرم" }));
    await waitFor(() => expect(onRefused).toHaveBeenCalledTimes(1));
    expect(onRefused.mock.calls[0][0]).toBe("pending");
  });

  it("offers a retry when the state cannot be read", async () => {
    const user = userEvent.setup();
    let fail = true;
    mount(null, { [`GET ${ONBOARDING_PATH}`]: () => (fail ? { status: 500, json: { detail: "Traceback: boom" } } : { json: TERMS }) });
    await screen.findByRole("alert");
    expect(document.body.textContent).not.toContain("Traceback");
    fail = false;
    await user.click(screen.getByRole("button", { name: /تلاش دوباره/ }));
    expect(await screen.findByRole("region", { name: "متن قوانین" })).toBeTruthy();
  });

  it("does not trust an answer that is not a step", async () => {
    mount({ step: "<b>x</b>" });
    expect(await screen.findByText(/پاسخ سرور قابل خواندن نبود/)).toBeTruthy();
  });
});
