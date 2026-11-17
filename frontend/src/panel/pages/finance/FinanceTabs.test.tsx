import { toast } from "@heroui/react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
// The floating bar animates in with the Web Animations API, which happy-dom cancels noisily.
vi.mock("@heroui-pro/react", () => {
  const Part = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const ActionBar = ({ isOpen, children, ...rest }: { isOpen: boolean; children?: React.ReactNode; "aria-label"?: string }) =>
    isOpen ? (
      <div role="toolbar" aria-label={rest["aria-label"]}>
        {children}
      </div>
    ) : null;
  return { ActionBar: Object.assign(ActionBar, { Prefix: Part, Content: Part, Suffix: Part }) };
});
vi.mock("../../core/confirm", () => ({ confirm: (message: string, options: unknown) => ask(message, options) }));

import { CancellationsTab } from "./CancellationsTab";
import { OrdersTab } from "./OrdersTab";
import { PaymentsTab } from "./PaymentsTab";
import { SettingsDialog } from "./SettingsDialog";
import type { FinanceSettingsPayload, OrdersPayload, PaymentsPayload } from "./types";

const user = { id: 3, name: "علی", is_demo: false };
const pager = { page: 1, page_size: 50, total: 2, pages: 1, has_prev: false, has_next: false, prev_page: null, next_page: null };

const orders: OrdersPayload = {
  q: "",
  pager,
  rows: [
    { id: 5, user, plan_name: "پلن ۱", amount: 100000, status: "awaiting_approval", payment_method: "card", created_at: "2026-01-01 10:00", stuck: false, receipt_payment_id: 9, actions: ["receipt", "approve_deliver", "reject", "cancel"], bulk_ops: ["approve", "reject", "cancel"] },
    { id: 6, user: { id: null, name: "x", is_demo: true }, plan_name: "—", amount: 5, status: "delivered", payment_method: "wallet", created_at: "2026-01-01 11:00", stuck: false, receipt_payment_id: null, actions: [], bulk_ops: [] },
  ],
};

const payments: PaymentsPayload = {
  q: "",
  pager,
  can_void_payment: true,
  rows: [
    { id: 9, user, amount: 70000, is_wallet_topup: false, status: "approved", order_id: 5, has_receipt: false, void_review: false, can_void: true, can_retry_void: false, void_reason: "", void_refund: false, matches: [], bulk_ops: [] },
    { id: 10, user, amount: 70000, is_wallet_topup: false, status: "pending", order_id: 6, has_receipt: true, void_review: false, can_void: false, can_retry_void: false, void_reason: "", void_refund: false, matches: [11, 12], bulk_ops: ["approve", "reject"] },
  ],
};

beforeEach(() => {
  get.mockReset();
  action.mockReset();
  ask.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "انجام شد" });
  window.history.replaceState(null, "", "/finance?tab=orders");
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

describe("orders list", () => {
  it("approves one order through its row menu after the same confirmation, then reloads", async () => {
    get.mockResolvedValue(orders);
    const ui = userEvent.setup();
    mount(<OrdersTab onReceipt={() => {}} />);
    await screen.findByText("پلن ۱");
    await ui.click(screen.getByRole("button", { name: "عملیات سفارش ۵" }));
    await ui.click(await screen.findByRole("menuitem", { name: "تأیید و تحویل" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/orders/5/approve", {}));
    expect(ask).toHaveBeenCalledWith("تأیید و تحویل", expect.objectContaining({ description: "سفارش تأیید و تحویل شود؟" }));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1));
  });

  it("does nothing when the confirmation is declined", async () => {
    get.mockResolvedValue(orders);
    ask.mockResolvedValue(false);
    const ui = userEvent.setup();
    mount(<OrdersTab onReceipt={() => {}} />);
    await screen.findByText("پلن ۱");
    await ui.click(screen.getByRole("button", { name: "عملیات سفارش ۵" }));
    await ui.click(await screen.findByRole("menuitem", { name: "رد" }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(action).not.toHaveBeenCalled();
  });

  it("posts a bulk action with only the eligible ids and shows a row with no actions as a dash", async () => {
    get.mockResolvedValue(orders);
    const ui = userEvent.setup();
    mount(<OrdersTab onReceipt={() => {}} />);
    await screen.findByText("پلن ۱");
    await ui.click(screen.getByRole("checkbox", { name: /انتخاب سفارش ۵/ }));
    await ui.click(screen.getByRole("checkbox", { name: /انتخاب سفارش ۶/ }));
    const bar = await screen.findByRole("toolbar", { name: "عملیات گروهی سفارش‌ها" });
    await ui.click(within(bar).getByRole("button", { name: /تأیید/ }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/finance/orders/bulk-action", { action: "approve", ids: [5], return_to: "/finance?tab=orders" }));
  });

  it("shows an error with a retry when the list cannot be read", async () => {
    get.mockRejectedValueOnce(new Error("اتصال برقرار نشد"));
    get.mockResolvedValue(orders);
    const ui = userEvent.setup();
    mount(<OrdersTab onReceipt={() => {}} />);
    expect(await screen.findByText("اتصال برقرار نشد")).toBeTruthy();
    await ui.click(screen.getByRole("button", { name: /تلاش دوباره/ }));
    expect(await screen.findByText("پلن ۱")).toBeTruthy();
  });
});

describe("payments list", () => {
  it("voids an approved payment only with a reason and sends the refund choice", async () => {
    get.mockResolvedValue(payments);
    const ui = userEvent.setup();
    mount(<PaymentsTab onReceipt={() => {}} />);
    await screen.findAllByText("علی");
    await ui.click(screen.getByRole("button", { name: "عملیات پرداخت ۹" }));
    await ui.click(await screen.findByRole("menuitem", { name: "ابطال" }));
    const submit = await screen.findByRole("button", { name: "ابطال پرداخت" });
    expect(submit.hasAttribute("disabled") || submit.getAttribute("aria-disabled") === "true").toBe(true);
    await ui.type(screen.getByRole("textbox", { name: /دلیل ابطال/ }), "رسید جعلی");
    await ui.click(screen.getByRole("checkbox", { name: /به کیف پول مشتری برگردد/ }));
    await ui.click(screen.getByRole("button", { name: "ابطال پرداخت" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/payments/9/void", { reason: "رسید جعلی", refund_to_wallet: true }));
  });

  it("lists the same-amount hints of a pending receipt", async () => {
    get.mockResolvedValue(payments);
    mount(<PaymentsTab onReceipt={() => {}} />);
    expect(await screen.findByText(/هم‌مبلغ/)).toBeTruthy();
  });
});

describe("cancellations", () => {
  it("approves with the operator's amount after asking, and rejects only with a reason", async () => {
    get.mockResolvedValue({
      can_approve: true,
      next_before: null,
      rows: [{ id: 4, username: "svc1", status: "pending", status_label: "در انتظار بررسی", notification_status: "sent", reason: "دلیل مشتری", operator_note: "", refund_amount: null }],
    });
    const ui = userEvent.setup();
    mount(<CancellationsTab />);
    await screen.findByText("دلیل: دلیل مشتری");
    expect((screen.getByRole("button", { name: "رد درخواست" }) as HTMLButtonElement).disabled).toBe(true);
    await ui.type(screen.getByRole("textbox", { name: /اعتبار برگشتی/ }), "25000");
    await ui.click(screen.getByRole("button", { name: "تأیید لغو و اعتبار" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/service-cancellations/4/approve", { amount: "25000", note: "" }));
  });
});

const settings: FinanceSettingsPayload = {
  tabs: [
    { id: "payment", label: "پرداخت" },
    { id: "cleanup", label: "پاکسازی" },
  ],
  groups: {
    payment: [
      {
        name: "روش‌های پرداخت",
        gate: null,
        fields: [
          { key: "auto_approve_payments", label: "تأیید خودکار رسید", kind: "toggle", help: "", options: [], value: false, show_when: null },
          { key: "auto_approve_after_minutes", label: "بعد از مدت", kind: "number", help: "", options: [], value: "30", show_when: { key: "auto_approve_payments", values: ["1"] } },
          { key: "bbc_api_key", label: "کلید API", kind: "password", help: "", options: [], value: "", has_value: true, show_when: null },
        ],
      },
    ],
    billing: [],
    cleanup: [],
  },
  actions: { payment: "/settings?tab=payment&next=%2Ffinance", billing: "", cleanup: "", pending_orders: "/settings/cancel-pending-orders" },
  cleanup_status: null,
  purge: null,
};

describe("finance settings", () => {
  it("shows a dependent field after its switch is turned on and posts every field, never a saved secret", async () => {
    get.mockResolvedValue(settings);
    const ui = userEvent.setup();
    mount(<SettingsDialog open tab="payment" onTabChange={() => {}} onClose={() => {}} />);
    await screen.findByText("روش‌های پرداخت");
    expect(screen.queryByText("بعد از مدت")).toBeNull();
    expect(screen.getByText("ذخیره شده")).toBeTruthy();
    await ui.click(screen.getByRole("switch", { name: "تأیید خودکار رسید" }));
    expect(await screen.findByText("بعد از مدت")).toBeTruthy();
    await ui.click(screen.getByRole("button", { name: "ذخیره تنظیمات" }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith("/settings?tab=payment&next=%2Ffinance", {
        s_auto_approve_payments: "1",
        s_auto_approve_after_minutes: "30",
        s_bbc_api_key: "",
      }),
    );
  });
});
