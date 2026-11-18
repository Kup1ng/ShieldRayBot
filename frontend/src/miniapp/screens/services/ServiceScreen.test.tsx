import { toast } from "@heroui/react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { MiniShell } from "../../layout/MiniShell";
import { answerConfirm, customerMe, fakeApi, renderMini, type FakeHandler, type FakeReply } from "../../test/harness";
import { installTelegram } from "../../test/telegram";
import { ScreenRouter } from "../ScreenRouter";
import { pollTiming } from "../shop/usePaymentPoll";

// The toast queue is global: a message from one test must not be found by the next one.
afterEach(() => toast.clear());

const HOSTILE = "<img src=x onerror=alert(1)>";

function service(extra: Record<string, unknown> = {}) {
  return {
    id: 7,
    username: "svc7",
    status: "active",
    status_fa: "فعال",
    traffic: "1 از 10 گیگ",
    traffic_pct: 10,
    expire_days_label: "۵ روز",
    subscription_url: "https://sub.example.com/sub/secret-token",
    addons_allowed: true,
    is_cancelled: false,
    cancellation_pending: false,
    ...extra,
  };
}

const PLAN = { id: 2, name: HOSTILE, price: 1250000, days: 30, gb: 50, is_trial: false };
/** The shop has no categories: one list (the server leaves trials out). */
const OPTIONS = { wallet_pay_enabled: true, grouped: false, current: PLAN, categories: [], other: [], plans: [{ ...PLAN, relation: "current" }] };
const OPTIONS_PATH = "GET /api/mini/service/7/renewal-options";

const pickPlan = async (user: ReturnType<typeof userEvent.setup>) => {
  const row = (await screen.findAllByText(HOSTILE))[0].closest("button");
  expect(row).toBeTruthy();
  await user.click(row as HTMLElement);
};
const PREVIEW = { terms: { version: 1 }, price: 200, request_key: "a".repeat(32), plan_name: HOSTILE, lines: ["حجم پس از تمدید: ۱۷ گیگ"], warnings: [], notice: "مصرف تا اجرا کم می‌شود" };

function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 40))));

function mount(extra: Record<string, FakeReply | FakeHandler> = {}, detail = service()) {
  const routes: Record<string, FakeHandler> = {
    "GET /api/mini/me": () => ({ json: customerMe() }),
    "GET /api/mini/service/7": () => ({ json: { service: detail } }),
  };
  for (const [key, reply] of Object.entries(extra)) routes[key] = typeof reply === "function" ? reply : () => reply;
  const api = fakeApi(routes);
  renderMini(
    <MiniShell>
      <ScreenRouter />
    </MiniShell>,
    { route: { view: "service", serviceId: 7 } },
  );
  return api;
}

const pageText = () => document.body.textContent ?? "";

describe("service screen", () => {
  it("reads usage and times in Persian digits and the Persian calendar", async () => {
    mount({}, service({ traffic: "27.9 از 30 گیگ", expire_days_label: "3 روز", expire: "2026/10/26 · 3 روز", expire_at: "2026-10-26T12:00:00+00:00", online_at: "2026-10-24T08:00:00+00:00" }));
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    expect(pageText()).toContain("۲۷٫۹ از ۳۰ گیگ");
    expect(pageText()).toContain("۳ روز");
    expect(pageText()).not.toMatch(/2026|منقضی/);
    expect(pageText()).toContain("۱۴۰۵");
  });

  it("draws the blue «سرویس فعلی» card with the white renew button, and never reads an on-hold service as unlimited", async () => {
    mount({}, service({ status: "on_hold", status_fa: "در انتظار اتصال", expire_days: null, expire_days_label: "" }));
    const hero = (await screen.findByRole("heading", { name: "سرویس فعلی" })).closest("section") as HTMLElement;
    expect(hero.className).toContain("var(--invoice-blue)");
    expect(within(hero).getByRole("button", { name: "تمدید سرویس" })).toBeTruthy();
    expect(within(hero).getByText("پس از اتصال")).toBeTruthy();
    expect(pageText()).not.toContain("نامحدود");
    expect(screen.getByText("مشاهده لینک اشتراک")).toBeTruthy();
  });

  it("shows no last-connection row, even when the panel reports one", async () => {
    mount({}, service({ online_at: new Date(Date.now() - 5 * 60_000 - 5000).toISOString() }));
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    expect(pageText()).not.toContain("آخرین اتصال");
    expect(pageText()).not.toContain("دقیقه پیش");
  });

  it("shows the traffic left in its row and the used amount in the summary card", async () => {
    mount({}, service({ traffic: "13.6 از 20 گیگ", traffic_pct: 68, traffic_left: "6.4 گیگ" }));
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    expect(pageText()).toContain("حجم باقی‌مانده");
    expect(pageText()).toContain("۶٫۴ گیگ");
    expect(pageText()).toContain("۱۳٫۶ از ۲۰ گیگ");
  });

  it("puts the usage chart on the page, starting with the last week", async () => {
    const api = mount({
      "GET /api/mini/service/7/usage": { json: { range: "week", period: "day", points: [], total_bytes: 0, total_text: "0" } },
    });
    await screen.findByRole("region", { name: "نمودار مصرف سرویس" });
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/service/7/usage?range=week")).toHaveLength(1));
  });

  it("explains a failed panel read under the facts and reads the service again on request", async () => {
    const api = mount({}, service({ error: "upstream_unavailable", error_message: "پنل در دسترس نیست" }));
    const notice = await screen.findByText("پنل در دسترس نیست");
    const before = api.callsTo("GET", "/api/mini/service/7").filter((c) => c.path === "/api/mini/service/7").length;
    await userEvent.setup().click(within(notice.closest("[role=status]") as HTMLElement).getByRole("button", { name: "تلاش دوباره" }));
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/service/7").filter((c) => c.path === "/api/mini/service/7").length).toBe(before + 1));
  });

  it("never puts the subscription link on screen, not even its host", async () => {
    mount();
    await screen.findByText("مشاهده لینک اشتراک");
    expect(pageText()).not.toContain("secret-token");
    expect(pageText()).not.toContain("sub.example.com");
  });

  it("has no volume or time add-ons on the page, even for a service that allows them", async () => {
    mount({}, service({ addons_allowed: true }));
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    expect(screen.queryByRole("button", { name: /افزایش حجم/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /افزایش زمان/ })).toBeNull();
  });

  it("offers no renew actions for a cancelled service, only its cancellation status", async () => {
    mount({}, service({ is_cancelled: true }));
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    expect(screen.getAllByText("لغوشده").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "تمدید سرویس" })).toBeNull();
    expect(screen.queryByRole("switch", { name: /تمدید خودکار/ })).toBeNull();
    expect(screen.getByRole("button", { name: /وضعیت درخواست لغو/ })).toBeTruthy();
    expect(pageText()).not.toContain("secret-token");
  });

  it("copies only a safe subscription link and opens it in Telegram, trimmed", async () => {
    const { tg } = installTelegram();
    mount({}, service({ subscription_url: " https://sub.example.com/a " }));
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "کپی لینک" }));
    expect(await navigator.clipboard.readText()).toBe("https://sub.example.com/a");
    expect(await screen.findByText("لینک کپی شد")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "باز کردن لینک" }));
    expect(tg.openLink).toHaveBeenCalledWith("https://sub.example.com/a");
  });

  it("offers no link actions for a subscription link that is not http(s)", async () => {
    mount({}, service({ subscription_url: "javascript:alert(1)" }));
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    expect(screen.queryByRole("button", { name: "کپی لینک" })).toBeNull();
    expect(screen.queryByRole("button", { name: "باز کردن لینک" })).toBeNull();
  });
});

describe("auto-renew switch on the blue card", () => {
  const AUTOMATION_PATH = "/api/mini/service/7/automation";
  const AUTOMATION = {
    needs_review: false,
    pending_order_id: null,
    actions: [
      {
        action: "renew",
        label: "تمدید خودکار",
        enabled: false,
        choice_id: null,
        choices: [
          { id: 2, name: HOSTILE, price: 1250000 },
          { id: 3, name: "سه ماهه", price: 3000000 },
        ],
      },
    ],
  };
  const on = service({ auto_renew: { enabled: true, blocked: false } });

  const heroSwitch = async () => {
    const hero = (await screen.findByRole("heading", { name: "سرویس فعلی" })).closest("section") as HTMLElement;
    return within(hero).getByRole("switch", { name: "تمدید خودکار" }) as HTMLInputElement;
  };

  it("sits beside the renew button and shows the saved state", async () => {
    mount({}, on);
    expect((await heroSwitch()).checked).toBe(true);
  });

  it("turns off at once and then follows what the server saved", async () => {
    const api = mount({ [`POST ${AUTOMATION_PATH}`]: { json: { ok: true } } }, on);
    const toggle = await heroSwitch();
    await userEvent.setup().click(toggle);
    await waitFor(() => expect(toggle.checked).toBe(false));
    expect(api.callsTo("POST", AUTOMATION_PATH).map((c) => c.body)).toEqual([{ action: "renew", enabled: false }]);
    expect(await screen.findByText("تمدید خودکار خاموش شد")).toBeTruthy();
  });

  it("stays on and shows the server's reason when turning off fails", async () => {
    mount({ [`POST ${AUTOMATION_PATH}`]: { status: 400, json: { detail: "عملیات سرویس در حال اجراست؛ کمی بعد تلاش کنید" } } }, on);
    const toggle = await heroSwitch();
    await userEvent.setup().click(toggle);
    expect(await screen.findByText("عملیات سرویس در حال اجراست؛ کمی بعد تلاش کنید")).toBeTruthy();
    expect(toggle.checked).toBe(true);
  });

  it("turns on only after the customer picks a plan with its price, and saves that plan once", async () => {
    const api = mount({ [`GET ${AUTOMATION_PATH}`]: { json: AUTOMATION }, [`POST ${AUTOMATION_PATH}`]: { json: { ok: true } } });
    const toggle = await heroSwitch();
    const user = userEvent.setup();
    await user.click(toggle);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("سه ماهه");
    expect(toggle.checked).toBe(false);
    expect(api.callsTo("POST", AUTOMATION_PATH)).toHaveLength(0);
    // The group separator differs between ICU builds («٬» or «,»).
    expect(dialog.textContent).toMatch(/۳.۰۰۰.۰۰۰ تومان/);
    expect(within(dialog).getByText(HOSTILE)).toBeTruthy();
    expect(dialog.querySelector("img")).toBeNull();

    await user.click(within(dialog).getByRole("radio", { name: /سه ماهه/ }));
    await user.click(within(dialog).getByRole("button", { name: "روشن کردن تمدید خودکار" }));
    await waitFor(() => expect(toggle.checked).toBe(true));
    expect(api.callsTo("POST", AUTOMATION_PATH).map((c) => c.body)).toEqual([{ action: "renew", enabled: true, choice_id: 3 }]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("can go off but not on while an earlier automatic purchase waits for support", async () => {
    mount({}, service({ auto_renew: { enabled: false, blocked: true } }));
    expect((await heroSwitch()).disabled).toBe(true);
    expect(pageText()).toContain("در انتظار بررسی پشتیبانی");
  });
});

const METHODS = { wallet_pay_enabled: true, methods: [{ id: "card", label: "کارت به کارت", destinations: [] }] };
const PAYMENT = { id: 31, amount: 200, method: "card", card_number: "6037997700001111", holder: "علی مرادی", bank: "ملی", needs_receipt: true };
const DELIVERED = { status: "delivered", message: "", order_id: 90, service_id: 7, amount: 200, method: "card", paid_at: "2026-10-26T12:00:00Z" };
const REVIEWING = { ...DELIVERED, status: "review", service_id: null, paid_at: null };

const realTiming = { ...pollTiming };
afterEach(() => {
  Object.assign(pollTiming, realTiming);
});
/** Poll quickly so a 30 s window fits in a test. */
const fastPolling = (limitMs = 400) => {
  pollTiming.intervalMs = 20;
  pollTiming.limitMs = limitMs;
};

type User = ReturnType<typeof userEvent.setup>;

/** Requests to exactly this path (`callsTo` matches by prefix, so «/renew» would also count «/renew/pay»). */
const exact = (api: ReturnType<typeof fakeApi>, method: string, path: string) => api.calls.filter((c) => c.method === method && c.path === path);

describe("renewal", () => {
  async function toInvoice(user: User) {
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    await user.click(screen.getByRole("button", { name: "تمدید سرویس" }));
    await pickPlan(user);
    return screen.findByText("حجم پس از تمدید: ۱۷ گیگ");
  }

  it("shows an escaped preview, keeps it open after a lost reply, and a retry re-sends the same request key once", async () => {
    const posts: Array<{ body: unknown }> = [];
    const release = gate();
    let lose = true;
    const api = mount({
      [OPTIONS_PATH]: { json: OPTIONS },
      "GET /api/mini/service/7/renewal-preview?plan_id=2": { json: PREVIEW },
      "POST /api/mini/renew": async (req: { body: unknown }) => {
        posts.push({ body: req.body });
        if (lose) return "network-error";
        await release.opened;
        return { json: { message: "تمدید شد" } };
      },
    });
    const user = userEvent.setup();
    await toInvoice(user);
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(screen.getAllByText(HOSTILE).length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "فاکتور نهایی" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    expect(await screen.findByText(/نتیجهٔ تمدید مشخص نشد/)).toBeTruthy();
    await settle();
    expect(posts.length).toBe(1);
    expect(screen.getByRole("button", { name: "پرداخت" })).toBeTruthy();
    // Going back would load a new preview with a new request key, so only «پرداخت» may retry.
    expect(screen.getByRole("button", { name: "قبلی" }).hasAttribute("disabled") || screen.getByRole("button", { name: "قبلی" }).getAttribute("aria-disabled") === "true").toBe(true);

    lose = false;
    await user.dblClick(screen.getByRole("button", { name: "پرداخت" }));
    await act(async () => release.open());
    await waitFor(() => expect(screen.queryByRole("button", { name: "پرداخت" })).toBeNull());
    expect(posts.length).toBe(2);
    expect(posts[1].body).toEqual(posts[0].body);
    expect(posts[1].body).toEqual({ service_id: 7, plan_id: 2, preview: { terms: PREVIEW.terms, price: 200, request_key: PREVIEW.request_key } });
    await settle();
    expect(api.callsTo("POST", "/api/mini/renew").length).toBe(2);
    // The service view is back, with the fresh state read again.
    expect(await screen.findByRole("heading", { name: "سرویس فعلی" })).toBeTruthy();
  });

  it("offers the service's own plan first and then the shop's categories, and opens a category without a new request", async () => {
    const current = { ...PLAN, id: 2, relation: "current" };
    const upgrade = { id: 3, name: "<b>بزرگ</b>", price: 2000, days: 30, gb: 100, is_trial: false, relation: "upgrade" };
    const loose = { id: 4, name: "بدون دسته", price: 900, days: 30, gb: 10, is_trial: false, relation: null };
    const api = mount({
      [OPTIONS_PATH]: {
        json: {
          wallet_pay_enabled: true,
          grouped: true,
          current,
          categories: [{ id: 10, name: HOSTILE, plans: [current, upgrade] }],
          other: [loose],
          plans: [],
        },
      },
      "GET /api/mini/service/7/renewal-preview?plan_id=3": { json: PREVIEW },
    });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    await user.click(screen.getByRole("button", { name: "تمدید سرویس" }));
    await screen.findByRole("region", { name: "تمدید پلن فعلی" });
    const currentRegion = screen.getByRole("region", { name: "تمدید پلن فعلی" });
    expect(within(currentRegion).getByText("پلن فعلی")).toBeTruthy();
    expect(within(currentRegion).getAllByRole("button")).toHaveLength(1);
    // The current plan comes before the categories, and category names are text.
    const categories = screen.getByRole("region", { name: "یا پلن دیگری انتخاب کنید" });
    expect(currentRegion.compareDocumentPosition(categories) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(categories).getByText("۲ پلن")).toBeTruthy();
    expect(within(categories).getByText("سایر")).toBeTruthy();
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(api.callsTo("GET", "/api/mini/service/7/renewal-options")).toHaveLength(1);

    await user.click(within(categories).getByRole("button", { name: /۲ پلن/ }));
    const list = await screen.findByRole("region", { name: HOSTILE });
    expect(within(list).getByText("ارتقا")).toBeTruthy();
    expect(within(list).getByText("<b>بزرگ</b>")).toBeTruthy();
    expect(list.innerHTML).not.toContain("<b>بزرگ");
    await user.click(screen.getByRole("button", { name: "بازگشت به دسته‌ها" }));
    expect(await screen.findByRole("region", { name: "تمدید پلن فعلی" })).toBeTruthy();
    expect(api.callsTo("GET", "/api/mini/service/7/renewal-options")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /سایر/ }));
    expect(await screen.findByText("بدون دسته")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "بازگشت به دسته‌ها" }));
    await user.click(screen.getByRole("button", { name: /۲ پلن/ }));
    await user.click((await screen.findByText("<b>بزرگ</b>")).closest("button") as HTMLElement);
    expect(await screen.findByText("حجم پس از تمدید: ۱۷ گیگ")).toBeTruthy();
    expect(api.callsTo("GET", "/api/mini/service/7/renewal-preview?plan_id=3")).toHaveLength(1);
    expect(api.callsTo("POST", "/api/mini/renew")).toEqual([]);
  });

  it("goes back from the invoice to the category it came from", async () => {
    const current = { ...PLAN, relation: "current" };
    mount({
      [OPTIONS_PATH]: {
        json: { wallet_pay_enabled: true, grouped: true, current: null, categories: [{ id: 10, name: "اقتصادی", plans: [current] }], other: [], plans: [] },
      },
      "GET /api/mini/service/7/renewal-preview?plan_id=2": { json: PREVIEW },
    });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    await user.click(screen.getByRole("button", { name: "تمدید سرویس" }));
    await user.click(await screen.findByRole("button", { name: /اقتصادی/ }));
    await pickPlan(user);
    await screen.findByText("حجم پس از تمدید: ۱۷ گیگ");
    await user.click(screen.getByRole("button", { name: "قبلی" }));
    expect(await screen.findByRole("region", { name: "اقتصادی" })).toBeTruthy();
  });

  it("shows the admin's descriptions of a category and its plans as plain text, and nothing when there is none", async () => {
    const described = { id: 3, name: "بزرگ", price: 2000, days: 30, gb: 100, is_trial: false, relation: "upgrade", description: `ترافیک بالا\nبدون محدودیت سرعت ${HOSTILE}` };
    const plain = { id: 4, name: "ساده", price: 900, days: 30, gb: 10, is_trial: false, relation: null, description: "" };
    mount({
      [OPTIONS_PATH]: {
        json: {
          wallet_pay_enabled: true,
          grouped: true,
          current: null,
          categories: [
            { id: 10, name: "ویژه", description: "پلن‌های ویژهٔ حرفه‌ای\nبا پشتیبانی", plans: [described, plain] },
            { id: 11, name: "بی‌توضیح", description: "", plans: [plain] },
          ],
          other: [],
          plans: [],
        },
      },
    });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    await user.click(screen.getByRole("button", { name: "تمدید سرویس" }));
    const categories = await screen.findByRole("region", { name: "انتخاب پلن تمدید" });
    const special = within(categories).getByRole("button", { name: /ویژه/ });
    expect(special.textContent).toContain("پلن‌های ویژهٔ حرفه‌ای");
    expect(special.textContent).toContain("با پشتیبانی");
    expect(within(categories).getByRole("button", { name: /بی‌توضیح/ }).textContent).toBe("بی‌توضیح۱ پلن");
    await user.click(special);
    const list = await screen.findByRole("region", { name: "ویژه" });
    expect(list.textContent).toContain("پلن‌های ویژهٔ حرفه‌ای");
    const row = within(list).getByRole("button", { name: /بزرگ/ });
    expect(row.textContent).toContain("ترافیک بالا");
    expect(row.textContent).toContain(HOSTILE);
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(within(list).getByRole("button", { name: /ساده/ }).textContent).not.toContain("undefined");
  });

  it("lists one flat list, the service's own plan first, when the shop has no categories", async () => {
    const other = { id: 5, name: "کوچک", price: 500, days: 30, gb: 10, is_trial: false, relation: "downgrade" };
    mount({ [OPTIONS_PATH]: { json: { ...OPTIONS, plans: [{ ...PLAN, relation: "current" }, other] } } });
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    await userEvent.setup().click(screen.getByRole("button", { name: "تمدید سرویس" }));
    const region = await screen.findByRole("region", { name: "انتخاب پلن تمدید" });
    const rows = within(region).getAllByRole("button");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("پلن فعلی")).toBeTruthy();
    expect(within(rows[1]).getByText("تنزل")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "بازگشت به دسته‌ها" })).toBeNull();
  });

  it("says there is nothing to renew onto when the shop offers no plan", async () => {
    mount({ [OPTIONS_PATH]: { json: { ...OPTIONS, current: null, plans: [] } } });
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    await userEvent.setup().click(screen.getByRole("button", { name: "تمدید سرویس" }));
    expect(await screen.findByText("پلنی برای تمدید فعال نیست.")).toBeTruthy();
  });

  it("a payment is never sent before «پرداخت»: choosing a plan only reads the preview", async () => {
    const api = mount({
      [OPTIONS_PATH]: { json: OPTIONS },
      "GET /api/mini/service/7/renewal-preview?plan_id=2": { json: PREVIEW },
    });
    const user = userEvent.setup();
    await toInvoice(user);
    expect(api.callsTo("POST", "/api/mini/renew")).toEqual([]);
    expect(api.callsTo("POST", "/api/mini/renew/pay")).toEqual([]);
  });

  it("drops a preview that arrives after the customer left the renewal", async () => {
    const tg = installTelegram();
    const pending = gate();
    const api = mount({
      [OPTIONS_PATH]: { json: OPTIONS },
      "GET /api/mini/service/7/renewal-preview?plan_id=2": async () => {
        await pending.opened;
        return { json: PREVIEW };
      },
      "GET /api/mini/services": { json: { items: [], next_before_id: null } },
    });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    await user.click(screen.getByRole("button", { name: "تمدید سرویس" }));
    await pickPlan(user);
    // Telegram's back button leaves the service.
    await waitFor(() => expect(tg.back.handler).toBeTruthy());
    await act(async () => tg.back.handler?.());
    await act(async () => pending.open());
    await settle();
    expect(screen.queryByText("حجم پس از تمدید: ۱۷ گیگ")).toBeNull();
    expect(screen.queryByRole("button", { name: "پرداخت" })).toBeNull();
    expect(api.callsTo("POST", "/api/mini/renew")).toEqual([]);
  });

  it("shows a Persian retry message, never English server internals, when plans cannot load", async () => {
    mount({ [OPTIONS_PATH]: { status: 500, json: { detail: "Traceback: sqlalchemy error at 10.0.0.5" } } });
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    await userEvent.setup().click(screen.getByRole("button", { name: "تمدید سرویس" }));
    expect(await screen.findByText(/دوباره تلاش کنید/)).toBeTruthy();
    expect(pageText()).not.toContain("sqlalchemy");
  });

  it("opens the renewal straight away for «renew» from home, once the open service has loaded", async () => {
    fakeApi({
      "GET /api/mini/me": () => ({ json: customerMe() }),
      "GET /api/mini/service/7": () => ({ json: { service: service() } }),
      [OPTIONS_PATH]: () => ({ json: OPTIONS }),
    });
    renderMini(
      <MiniShell>
        <ScreenRouter />
      </MiniShell>,
      { route: { view: "service", serviceId: 7, then: "renew" } },
    );
    expect((await screen.findAllByText(HOSTILE)).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "تمدید سرویس" })).toBeTruthy();
  });
});

describe("renewal paid by card", () => {
  function cardRoutes(extra: Record<string, FakeReply | FakeHandler> = {}) {
    return {
      [OPTIONS_PATH]: { json: OPTIONS },
      "GET /api/mini/pay/methods": { json: METHODS },
      "GET /api/mini/service/7/renewal-preview?plan_id=2": { json: PREVIEW },
      "POST /api/mini/renew/pay": { json: { order_id: 90, payment: PAYMENT } },
      "POST /api/mini/order/payments/31/receipt": { json: { status: "review", message: "رسید ثبت شد" } },
      ...extra,
    };
  }

  async function toCard(user: User) {
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    await user.click(screen.getByRole("button", { name: "تمدید سرویس" }));
    await pickPlan(user);
    await user.click(await screen.findByRole("radio", { name: /کارت به کارت/ }));
  }

  const upload = async (user: User) => {
    const input = document.querySelector<HTMLInputElement>("input[type=file]");
    expect(input).toBeTruthy();
    await user.upload(input as HTMLInputElement, new File(["x"], "receipt.png", { type: "image/png" }));
  };

  it("starts the card payment once, takes the receipt, checks the payment and ends on the ticket", async () => {
    fastPolling();
    let polls = 0;
    const api = mount(
      cardRoutes({
        "GET /api/mini/order/payments/31": () => {
          polls += 1;
          return { json: polls < 2 ? REVIEWING : DELIVERED };
        },
      }),
    );
    const user = userEvent.setup();
    await toCard(user);
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    expect(await screen.findByText(/لطفاً مبلغ/)).toBeTruthy();
    expect(screen.getByText("6037 - 9977 - 0000 - 1111")).toBeTruthy();

    // A receipt is required before «ثبت».
    await user.click(screen.getByRole("button", { name: "ثبت" }));
    expect((await screen.findAllByText("تصویر رسید را انتخاب کنید")).length).toBeGreaterThan(0);
    expect(api.callsTo("POST", "/api/mini/order/payments/31/receipt")).toHaveLength(0);

    await upload(user);
    await user.dblClick(screen.getByRole("button", { name: "ثبت" }));
    const ticket = await screen.findByRole("status", { name: "پرداخت موفقیت‌آمیز" });
    expect(within(ticket).getByText("کارت به کارت")).toBeTruthy();
    expect(within(ticket).getByText(/۲۰۰ تومان/)).toBeTruthy();

    const starts = api.callsTo("POST", "/api/mini/renew/pay");
    expect(starts).toHaveLength(1);
    expect(starts[0].body).toEqual({
      service_id: 7,
      plan_id: 2,
      preview: { terms: PREVIEW.terms, price: 200, request_key: PREVIEW.request_key },
      method: "card",
      dest_id: null,
    });
    expect(exact(api, "POST", "/api/mini/renew")).toEqual([]);
    expect(api.callsTo("POST", "/api/mini/order/payments/31/receipt")).toHaveLength(1);

    // Polling stops with the final answer.
    const seen = polls;
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(polls).toBe(seen);

    await user.click(within(ticket).getByRole("button", { name: "مشاهده سرویس" }));
    expect(await screen.findByRole("heading", { name: "سرویس فعلی" })).toBeTruthy();
  });

  it("a lost reply on the card payment keeps the preview, sends nothing on its own, and a retry re-sends the same key", async () => {
    let lose = true;
    const api = mount(
      cardRoutes({
        "POST /api/mini/renew/pay": () => (lose ? "network-error" : { json: { order_id: 90, payment: PAYMENT } }),
      }),
    );
    const user = userEvent.setup();
    await toCard(user);
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    expect((await screen.findAllByText(/نتیجهٔ ثبت پرداخت مشخص نشد/)).length).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(api.callsTo("POST", "/api/mini/renew/pay")).toHaveLength(1);
    // The preview (and its request key) stays: going back is off, and the method is fixed.
    const back = screen.getByRole("button", { name: "قبلی" });
    expect(back.hasAttribute("disabled") || back.getAttribute("aria-disabled") === "true").toBe(true);
    expect(screen.getByRole("radio", { name: /موجودی کیف پول/ }).hasAttribute("disabled")).toBe(true);

    lose = false;
    await user.dblClick(screen.getByRole("button", { name: "پرداخت" }));
    await screen.findByText(/لطفاً مبلغ/);
    const starts = api.callsTo("POST", "/api/mini/renew/pay");
    expect(starts).toHaveLength(2);
    expect(starts[1].body).toEqual(starts[0].body);
    // Back from the payment page and «پرداخت» again shows the same payment without asking the server.
    await user.click(screen.getByRole("button", { name: "قبلی" }));
    await user.click(await screen.findByRole("button", { name: "پرداخت" }));
    await screen.findByText(/لطفاً مبلغ/);
    expect(api.callsTo("POST", "/api/mini/renew/pay")).toHaveLength(2);
  });

  it("when the service cannot be renewed by card, says why, keeps the wallet and sends one wallet request", async () => {
    const api = mount(
      cardRoutes({
        "POST /api/mini/renew/pay": { status: 409, json: { detail: "تمدید این سرویس با کارت ممکن نیست." } },
        "POST /api/mini/renew": { json: { message: "تمدید شد" } },
      }),
    );
    const user = userEvent.setup();
    await toCard(user);
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    expect((await screen.findAllByText("تمدید این سرویس با کارت ممکن نیست.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("radio", { name: /کارت به کارت/ }).hasAttribute("disabled")).toBe(true);
    // The wallet is chosen again and pays through the existing renewal endpoint.
    expect(screen.getByRole("radio", { name: /موجودی کیف پول/ }).getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    await waitFor(() => expect(exact(api, "POST", "/api/mini/renew")).toHaveLength(1));
    expect(api.callsTo("POST", "/api/mini/renew/pay")).toHaveLength(1);
  });

  it("stops asking after the window, shows «در انتظار تأیید», and never sends the receipt again", async () => {
    fastPolling(200);
    const api = mount(cardRoutes({ "GET /api/mini/order/payments/31": { json: REVIEWING } }));
    const user = userEvent.setup();
    await toCard(user);
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    await screen.findByText(/لطفاً مبلغ/);
    await upload(user);
    await user.click(screen.getByRole("button", { name: "ثبت" }));
    expect(await screen.findByText("در حال بررسی رسید تراکنش!")).toBeTruthy();
    expect(await screen.findByRole("status", { name: "در انتظار تأیید" })).toBeTruthy();
    const polls = api.callsTo("GET", "/api/mini/order/payments/31").length;
    expect(polls).toBeGreaterThan(1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(api.callsTo("GET", "/api/mini/order/payments/31")).toHaveLength(polls);
    expect(api.callsTo("POST", "/api/mini/order/payments/31/receipt")).toHaveLength(1);
    expect(api.callsTo("POST", "/api/mini/renew/pay")).toHaveLength(1);
  });

  it("never shows an answer that belongs to another order", async () => {
    fastPolling(200);
    mount(cardRoutes({ "GET /api/mini/order/payments/31": { json: { ...DELIVERED, order_id: 999 } } }));
    const user = userEvent.setup();
    await toCard(user);
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    await screen.findByText(/لطفاً مبلغ/);
    await upload(user);
    await user.click(screen.getByRole("button", { name: "ثبت" }));
    expect(await screen.findByRole("status", { name: "در انتظار تأیید" })).toBeTruthy();
    expect(screen.queryByRole("status", { name: "پرداخت موفقیت‌آمیز" })).toBeNull();
  });

  it("a lost reply on the receipt only reads the payment's state, and offers the receipt again by hand", async () => {
    fastPolling(200);
    const api = mount(
      cardRoutes({
        "POST /api/mini/order/payments/31/receipt": () => "network-error",
        "GET /api/mini/order/payments/31": { json: { ...REVIEWING, status: "waiting_receipt" } },
      }),
    );
    const user = userEvent.setup();
    await toCard(user);
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    await screen.findByText(/لطفاً مبلغ/);
    await upload(user);
    await user.click(screen.getByRole("button", { name: "ثبت" }));
    expect(await screen.findByRole("status", { name: "رسید هنوز ثبت نشده" })).toBeTruthy();
    expect(api.callsTo("POST", "/api/mini/order/payments/31/receipt")).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(api.callsTo("POST", "/api/mini/order/payments/31/receipt")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "ارسال رسید" }));
    expect(await screen.findByText(/لطفاً مبلغ/)).toBeTruthy();
  });

  it("a rejected payment asks for a new preview, not the old request key", async () => {
    fastPolling();
    let previews = 0;
    const api = mount(
      cardRoutes({
        "GET /api/mini/order/payments/31": { json: { ...DELIVERED, status: "rejected", service_id: null, message: "رسید خوانا نبود." } },
        "GET /api/mini/service/7/renewal-preview?plan_id=2": () => {
          previews += 1;
          return { json: { ...PREVIEW, request_key: String(previews).repeat(32) } };
        },
      }),
    );
    const user = userEvent.setup();
    await toCard(user);
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    await screen.findByText(/لطفاً مبلغ/);
    await upload(user);
    await user.click(screen.getByRole("button", { name: "ثبت" }));
    expect(await screen.findByText("رسید خوانا نبود.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "پرداخت دوباره" }));
    await screen.findByRole("button", { name: "پرداخت" });
    expect(previews).toBe(2);
    expect(api.callsTo("POST", "/api/mini/renew/pay")).toHaveLength(1);
  });
});

describe("QR code", () => {
  it("is dropped when it arrives after its sheet was closed", async () => {
    const pending = gate();
    mount({
      "GET /api/mini/service/7/qr": async () => {
        await pending.opened;
        return { json: { png_base64: "iVBORw0KGgo=" } };
      },
    });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    await user.click(screen.getByRole("button", { name: "QR کد اشتراک" }));
    await screen.findByRole("heading", { name: "QR کد اشتراک" });
    await user.click(screen.getByRole("button", { name: "بستن" }));
    await act(async () => pending.open());
    await settle();
    expect(screen.queryByAltText("QR کد لینک اشتراک")).toBeNull();
  });

  it("shows the code inside its sheet when it arrives in time", async () => {
    mount({ "GET /api/mini/service/7/qr": { json: { png_base64: "iVBORw0KGgo=" } } });
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    await userEvent.setup().click(screen.getByRole("button", { name: "QR کد اشتراک" }));
    expect(await screen.findByAltText("QR کد لینک اشتراک")).toBeTruthy();
  });
});

describe("cancellation request", () => {
  async function openForm(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    await user.click(screen.getByRole("button", { name: /درخواست لغو سرویس/ }));
    return screen.findByRole("textbox", { name: "دلیل لغو" });
  }

  it("is sent once for a double tap, then shows the pending request with escaped operator notes and no form", async () => {
    let row: unknown = null;
    const pending = gate();
    const api = mount({
      "GET /api/mini/service/7/cancellation": () => ({ json: { request: row } }),
      "POST /api/mini/service/7/cancellation": async () => {
        await pending.opened;
        row = { status: "pending", label: "در انتظار بررسی", operator_note: "<svg onload=alert(1)>", refund_amount: null };
        return { json: { request: row } };
      },
    });
    const user = userEvent.setup();
    await user.type(await openForm(user), "دلیل مشتری");
    // Two taps in the same instant, before the confirmation opens.
    const submit = screen.getByRole("button", { name: "ثبت درخواست لغو" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await answerConfirm(true);
    await act(async () => pending.open());
    expect(await screen.findByText("<svg onload=alert(1)>")).toBeTruthy();
    expect(document.querySelector("svg[onload]")).toBeNull();
    expect(screen.queryByRole("button", { name: "ثبت درخواست لغو" })).toBeNull();
    const posts = api.callsTo("POST", "/api/mini/service/7/cancellation");
    expect(posts.length).toBe(1);
    expect(posts[0].body).toEqual({ reason: "دلیل مشتری" });
  });

  it("sends nothing when the customer declines the confirmation", async () => {
    const api = mount({ "GET /api/mini/service/7/cancellation": { json: { request: null } } });
    const user = userEvent.setup();
    await user.type(await openForm(user), "دلیل");
    await user.click(screen.getByRole("button", { name: "ثبت درخواست لغو" }));
    await answerConfirm(false);
    await settle();
    expect(api.callsTo("POST", "/api/mini/service/7/cancellation")).toEqual([]);
  });

  it("does not offer a form while a request is pending", async () => {
    mount({ "GET /api/mini/service/7/cancellation": { json: { request: { status: "pending", label: "در انتظار بررسی" } } } });
    await screen.findByRole("heading", { name: "سرویس فعلی" });
    await userEvent.setup().click(screen.getByRole("button", { name: /درخواست لغو سرویس/ }));
    expect(await screen.findByText("در انتظار بررسی")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "دلیل لغو" })).toBeNull();
  });
});
