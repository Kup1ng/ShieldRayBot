import { toast } from "@heroui/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppToastProvider } from "@/components/feedback/AppToast";

const get = vi.fn();
const action = vi.fn();
const ask = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelGet: (path: string) => get(path), panelAction: (path: string, fields: unknown) => action(path, fields) };
});
vi.mock("../../core/confirm", () => ({ confirm: (message: string, options: unknown) => ask(message, options) }));

import { AutomationTab } from "./AutomationTab";
import { DeliveryTab } from "./DeliveryTab";
import { ReportsTab } from "./ReportsTab";
import { SettingsDialog } from "./SettingsDialog";
import type { FinanceSettingsPayload } from "./types";

beforeEach(() => {
  get.mockReset();
  action.mockReset();
  ask.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "انجام شد" });
  window.history.replaceState(null, "", "/finance");
});

afterEach(() => {
  cleanup();
  toast.clear();
});

function mount(node: React.ReactNode) {
  return render(
    <>
      <AppToastProvider />
      {node}
    </>,
  );
}

describe("delivery queue", () => {
  it("offers the close actions of a stuck order only, and no refund when the server says it is unsafe", async () => {
    const stuck = { stuck: true, diag: null, action: "resume", action_label: "ادامه تحویل", error: "", attempts: null, bulk_ops: ["retry"] };
    get.mockResolvedValue({
      rows: [
        { order_id: 10, user_name: "الف", ...stuck, stuck_reason: { kind: "خرید سرویس", reason: "پرداخت شده ولی سرویسی ساخته نشد", can_refund: true } },
        { order_id: 16, user_name: "ب", ...stuck, stuck_reason: { kind: "تمدید", reason: "نتیجهٔ نامعلوم", can_refund: false } },
        { order_id: 13, user_name: "ج", stuck: false, diag: null, action: "resume", action_label: "ادامه تحویل", stuck_reason: null, error: "tg", attempts: 2, bulk_ops: ["retry", "dismiss"] },
      ],
    });
    const ui = userEvent.setup();
    mount(<DeliveryTab />);
    await screen.findByText("الف");
    await ui.click(screen.getByRole("button", { name: "عملیات سفارش ۱۰" }));
    expect(await screen.findByRole("menuitem", { name: "لغو و بازگشت وجه" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "تحویل دستی انجام شد" })).toBeTruthy();
    await ui.keyboard("{Escape}");
    await ui.click(screen.getByRole("button", { name: "عملیات سفارش ۱۶" }));
    await screen.findByRole("menuitem", { name: "بستن بدون بازگشت وجه" });
    expect(screen.queryByRole("menuitem", { name: "لغو و بازگشت وجه" })).toBeNull();
    await ui.keyboard("{Escape}");
    await ui.click(screen.getByRole("button", { name: "عملیات سفارش ۱۳" }));
    expect(await screen.findByRole("menuitem", { name: "حذف از لیست" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "تحویل دستی انجام شد" })).toBeNull();
  });
});

describe("automation review", () => {
  it("requires the money confirmation before releasing a debited service", async () => {
    get.mockResolvedValue({
      missing_bots: [],
      next_cursor: null,
      items: [{ service_id: 13, username: "svc", customer: "مشتری", action_label: "تمدید خودکار", order_id: 7, order_status_label: "لغوشده", amount: 1000, state: "clearable", state_label: "قابل پاک‌سازی", wallet_debited: true }],
    });
    const ui = userEvent.setup();
    mount(<AutomationTab onGoDelivery={() => {}} />);
    await screen.findByText("قابل پاک‌سازی");
    const release = screen.getByRole("button", { name: "آزادسازی" }) as HTMLButtonElement;
    expect(release.disabled).toBe(true);
    await ui.click(screen.getByRole("checkbox", { name: /مبلغ کسرشده/ }));
    await ui.click(release);
    await waitFor(() => expect(action).toHaveBeenCalledWith("/service-automation/13/clear", { money_settled: true, disable_automation: false }));
  });
});

describe("reports", () => {
  it("renders the comparison, the empty chart and the payment methods from the payload", async () => {
    const stats = { revenue: 1000, delivered: 2, orders: 3, new_users: 4, avg_order: 500 };
    const series = (total: number) => ({ days: [{ date: "2026-01-01", weekday: "جمعه", value: total, extra: 0 }], total, previous_total: 0, change_pct: null, has_data: total > 0 });
    const trend = { days: [{ date: "2026-01-01", weekday: "جمعه", revenue: 1000, orders: 1 }], total: 1000, previous_total: 0, change_pct: null, has_data: true };
    get.mockResolvedValue({
      period: "week",
      period_label: "۷ روز",
      generated_at: "2026/01/01 10:00",
      periods: { day: stats, week: stats, month: stats },
      active: stats,
      ops: { total_users: 9, blocked_users: 1, no_service_users: 2, pending_receipts: 3, open_tickets: 4, delivery_failures: 5, expiring_services: 6, low_volume_services: 7 },
      payment_methods: [{ label: "کارت", count: 2, amount: 1000, share_pct: 100 }],
      method_segments: [{ label: "کارت", amount: 1000, share_pct: 100, tone: 1 }],
      sales_trend: { "7": trend, "30": trend },
      charts: { orders: { "7": series(2), "30": series(2) }, new_users: { "7": series(0), "30": series(0) } },
    });
    mount(<ReportsTab goTab={() => {}} />);
    expect(await screen.findByText("مقایسه فروش")).toBeTruthy();
    expect(screen.getByText("در این بازه کاربر جدیدی اضافه نشده است.")).toBeTruthy();
    expect(screen.getByText("روش پرداخت — ۷ روز")).toBeTruthy();
    expect(screen.getByRole("img", { name: /سهم روش‌های پرداخت از فروش: کارت/ })).toBeTruthy();
  });
});

const base: FinanceSettingsPayload = {
  tabs: [
    { id: "payment", label: "پرداخت" },
    { id: "purge", label: "حذف کامل" },
  ],
  groups: { payment: [], billing: [], cleanup: [] },
  actions: { payment: "/settings?tab=payment&next=%2Ffinance", billing: "", cleanup: "", pending_orders: "/settings/cancel-pending-orders" },
  cleanup_status: null,
  purge: null,
};

describe("settings: payment lists and purge", () => {
  it("never shows a saved gateway key, keeps a blank one blank and drops empty rows", async () => {
    const withLists: FinanceSettingsPayload = {
      ...base,
      groups: {
        ...base.groups,
        payment: [
          {
            name: "درگاه آنلاین API",
            gate: null,
            fields: [
              { key: "psp_gateways", label: "درگاه‌ها", kind: "psp_gateways", help: "", options: [], value: JSON.stringify([{ id: "p1", name: "زرین", provider: "zarinpal", has_secret: true, enabled: true }]), show_when: null },
              { key: "payment_cards", label: "کارت‌ها", kind: "payment_cards", help: "", options: [], value: "[]", show_when: null },
            ],
          },
        ],
      },
    };
    get.mockResolvedValue(withLists);
    const ui = userEvent.setup();
    mount(<SettingsDialog open tab="payment" onTabChange={() => {}} onClose={() => {}} />);
    await screen.findByText("درگاه آنلاین API");
    const key = screen.getByLabelText("مرچنت / کلید API") as HTMLInputElement;
    expect(key.value).toBe("");
    expect(key.placeholder).toContain("ذخیره شده");
    await ui.type(screen.getByLabelText("شماره کارت"), "6037 9975 0000 0001");
    await ui.click(screen.getByRole("button", { name: "ذخیره تنظیمات" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const [, fields] = action.mock.calls[0] as [string, Record<string, string>];
    const psp = JSON.parse(fields.s_psp_gateways);
    expect(psp).toHaveLength(1);
    expect(psp[0]).toMatchObject({ id: "p1", merchant_id: "" });
    expect(JSON.parse(fields.s_payment_cards)).toMatchObject([{ number: "6037997500000001" }]);
  });

  it("asks before purging and posts the saved rules", async () => {
    const withPurge: FinanceSettingsPayload = {
      ...base,
      purge: {
        sections: [{ title: "سفارش‌ها", rows: [{ token: "order:cancelled", status: "cancelled", label: "لغوشده", on: true }] }],
        days: 30,
        min_days: 1,
        max_days: 3650,
        ready: { orders: 2, payments: 1, total: 3 },
        auto_on: false,
        last_run: null,
        rules_action: "/finance/cleanup/purge-rules?next=%2Ffinance",
        run_action: "/finance/cleanup/purge-run?next=%2Ffinance",
      },
    };
    get.mockResolvedValue(withPurge);
    const ui = userEvent.setup();
    mount(<SettingsDialog open tab="purge" onTabChange={() => {}} onClose={() => {}} />);
    await ui.click(await screen.findByRole("button", { name: "حذف کامل الان" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/finance/cleanup/purge-run?next=%2Ffinance", {}));
    expect(ask).toHaveBeenCalledWith("حذف کامل", expect.objectContaining({ description: expect.stringContaining("برای همیشه پاک شوند؟"), tone: "danger" }));
    await ui.click(screen.getByRole("button", { name: "ذخیره تنظیمات" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/finance/cleanup/purge-rules?next=%2Ffinance", { days: "30", "t_order:cancelled": "1" }));
  });
});
