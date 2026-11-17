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

import { TrialContent } from "./TrialUsersPage";
import type { TrialUsers, UserRow, UsersList } from "./types";
import { UsersContent } from "./UsersPage";
import { WalletAdjustForm } from "./WalletAdjustForm";

beforeEach(() => {
  get.mockReset();
  action.mockReset();
  ask.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "انجام شد" });
  window.history.replaceState(null, "", "/users");
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

function user(id: number, patch: Partial<UserRow> = {}): UserRow {
  return {
    id,
    telegram_id: 9000 + id,
    name: `مشتری ${id.toLocaleString("fa-IR")}`,
    message_name: `مشتری ${id.toLocaleString("fa-IR")}`,
    username: "",
    role: "user",
    is_demo: false,
    is_blocked: false,
    tag: { key: "green", title: "مطمئن" },
    has_alert: false,
    service_count: 1,
    services: [{ id: id * 10, label: "ماهانه · svc", plan_name: "ماهانه", pg_username: "svc", volume_text: "۵۰ گیگ", expire_text: "۳ روز", expire_tone: "warn", days_left: 3, has_alert: false }],
    volume_text: "۵۰ گیگ",
    expire_text: "۳ روز",
    expire_tone: "warn",
    days_left: 3,
    wallet_balance: 0,
    can_message: true,
    can_renew: true,
    bulk_ops: ["block", "renew", "delete"],
    ...patch,
  };
}

function list(rows: UserRow[], can: Partial<UsersList["can"]> = {}): UsersList {
  return {
    filter: "all",
    q: "",
    color: "",
    focus_uid: null,
    counts: { total: rows.length, expiring: 0, low_volume: 0, no_service: 0, blocked: 0, alerts: 0 },
    color_tags: [{ key: "green", title: "مطمئن" }],
    can: { manage: true, provision: true, edit_services: true, pg_update: true, ...can },
    rows,
  };
}

describe("users list", () => {
  it("blocks a customer through the row menu after asking, then reloads", async () => {
    get.mockResolvedValue(list([user(5)]));
    const ui = userEvent.setup();
    mount(<UsersContent />);
    await screen.findByText("مشتری ۵");
    await ui.click(screen.getByRole("button", { name: "عملیات مشتری ۵" }));
    await ui.click(await screen.findByRole("menuitem", { name: "مسدود" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/users/5/block", {}));
    expect(ask).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1));
  });

  it("renews quickly only with a typed reason, and sends nothing when the dialog is cancelled", async () => {
    get.mockResolvedValue(list([user(5)]));
    const ui = userEvent.setup();
    mount(<UsersContent />);
    await screen.findByText("مشتری ۵");
    const openRenew = async () => {
      await ui.click(screen.getByRole("button", { name: "عملیات مشتری ۵" }));
      await ui.click(await screen.findByRole("menuitem", { name: "تمدید سریع" }));
      return screen.findByRole("textbox", { name: /علت تمدید/ });
    };
    await openRenew();
    await ui.click(screen.getByRole("button", { name: "انصراف" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: /علت تمدید/ })).toBeNull());
    expect(action).not.toHaveBeenCalled();
    await ui.type(await openRenew(), "درخواست مشتری");
    await ui.click(screen.getByRole("button", { name: "تمدید" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/users/5/quick-renew", expect.objectContaining({ reason: "درخواست مشتری" })));
  });

  it("deletes only with a typed reason and sends it under both names the handler reads", async () => {
    get.mockResolvedValue(list([user(5, { wallet_balance: 1500 })]));
    const ui = userEvent.setup();
    mount(<UsersContent />);
    await screen.findByText("مشتری ۵");
    await ui.click(screen.getByRole("button", { name: "عملیات مشتری ۵" }));
    await ui.click(await screen.findByRole("menuitem", { name: "حذف" }));
    const submit = await screen.findByRole("button", { name: "حذف کاربر" });
    expect(submit.hasAttribute("disabled") || submit.getAttribute("aria-disabled") === "true").toBe(true);
    expect(screen.getByText(/موجودی کیف پول این کاربر/)).toBeTruthy();
    await ui.type(screen.getByRole("textbox", { name: /علت حذف/ }), "درخواست مشتری");
    await ui.click(screen.getByRole("button", { name: "حذف کاربر" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/users/5/delete", { reason: "درخواست مشتری", confirm_reason: "درخواست مشتری" }));
  });

  it("offers no owner-only row actions to a shop and no delete for an admin", async () => {
    get.mockResolvedValue(list([user(5), user(6, { role: "admin" })], { manage: false, pg_update: false }));
    const ui = userEvent.setup();
    mount(<UsersContent />);
    await screen.findByText("مشتری ۵");
    await ui.click(screen.getByRole("button", { name: "عملیات مشتری ۵" }));
    await screen.findByRole("menuitem", { name: "پیام" });
    expect(screen.queryByRole("menuitem", { name: "مسدود" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "حذف" })).toBeNull();
  });

  it("shows an empty state and the retry of a failed load", async () => {
    get.mockRejectedValueOnce(new Error("اتصال برقرار نشد"));
    const ui = userEvent.setup();
    mount(<UsersContent />);
    await screen.findByText("اتصال برقرار نشد");
    get.mockResolvedValue(list([]));
    await ui.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    await screen.findByText("کاربری نیست");
  });

  it("keeps the filter in the address and asks the endpoint for it", async () => {
    window.history.replaceState(null, "", "/users?filter=expiring&q=ali");
    get.mockResolvedValue({ ...list([user(5)]), filter: "expiring", q: "ali" });
    mount(<UsersContent />);
    await screen.findByText("مشتری ۵");
    expect(get).toHaveBeenCalledWith("/api/panel/users?q=ali&filter=expiring");
  });

  it("looks a pasted subscription link up by POST and never puts it in the address or the list request", async () => {
    const link = "https://panel.example/sub/SECRETTOKEN0123456789abcdef";
    get.mockResolvedValue(list([user(5)]));
    action.mockResolvedValue({ ok: false, message: "", location: "/users?err=not-found" });
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);
    const ui = userEvent.setup();
    mount(<UsersContent />);
    await screen.findByText("مشتری ۵");
    await ui.type(screen.getByRole("textbox", { name: "جستجوی کاربران" }), link);
    await ui.keyboard("{Enter}");
    await waitFor(() => expect(action).toHaveBeenCalledWith("/users/find-by-link", { link }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/users?err=not-found"));
    expect(window.location.search).not.toContain("SECRET");
    expect(get.mock.calls.flat().join(" ")).not.toContain("SECRET");
    assign.mockRestore();
  });
});

describe("wallet adjust form", () => {
  it("asks before moving money and posts the screen's request key", async () => {
    const done = vi.fn().mockResolvedValue(undefined);
    const ui = userEvent.setup();
    mount(<WalletAdjustForm action="/users/5/wallet-credit" nonce="abcdef0123456789" confirmMessage="تغییر کند؟" onDone={done} />);
    await ui.type(screen.getByRole("textbox", { name: /مبلغ/ }), "۵۰٬۰۰۰");
    await ui.click(screen.getByRole("button", { name: "افزایش" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/users/5/wallet-credit", { amount: "50000", mode: "credit", note: "", nonce: "abcdef0123456789" }));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalled();
  });

  it("refuses a bad amount or a missing required reason before asking", async () => {
    const ui = userEvent.setup();
    mount(<WalletAdjustForm action="/users/5/shop-wallet" nonce="abcdef0123456789" confirmMessage="؟" noteLabel="علت" noteRequired onDone={vi.fn()} />);
    await ui.type(screen.getByRole("textbox", { name: /مبلغ/ }), "500");
    await ui.click(screen.getByRole("button", { name: "کاهش" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    await ui.clear(screen.getByRole("textbox", { name: /مبلغ/ }));
    await ui.type(screen.getByRole("textbox", { name: /مبلغ/ }), "5000");
    await ui.click(screen.getByRole("button", { name: "کاهش" }));
    expect((await screen.findByRole("alert")).textContent).toContain("علت");
    expect(ask).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });

  it("posts loyalty-style field names and extra fields when asked to", async () => {
    const ui = userEvent.setup();
    mount(<WalletAdjustForm action="/loyalty/shop-adjust" nonce="abcdef0123456789" confirmMessage="؟" amountField="points" noteField="reason" minAmount={1} extraFields={{ user_id: "7" }} onDone={vi.fn()} />);
    await ui.type(screen.getByRole("textbox", { name: /مبلغ/ }), "20");
    await ui.click(screen.getByRole("button", { name: "کاهش" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/loyalty/shop-adjust", { points: "20", mode: "debit", reason: "", nonce: "abcdef0123456789", user_id: "7" }));
  });
});

function trial(patch: Partial<TrialUsers> = {}): TrialUsers {
  const row = {
    user_id: 4,
    name: "تست‌گیر",
    telegram_id: 4004,
    trial_order_id: 31,
    trial_at: "2026-10-31 12:00",
    trial_state: "active" as const,
    trial_state_label: "فعال",
    is_buyer: false,
    purchase_count: 0,
    first_purchase_at: "",
    total_spent: 0,
    is_blocked: false,
    is_opted_out: false,
    ops: ["message" as const, "block" as const],
  };
  return {
    filter: "all",
    q: "",
    filters: [
      { key: "all", label: "همه" },
      { key: "non_buyers", label: "بدون خرید" },
      { key: "buyers", label: "خریدار" },
    ],
    summary: { trials: 1, buyers: 0, non_buyers: 1, conversion_percent: 0 },
    rows: [row],
    next_before: null,
    can_message: true,
    can_block: true,
    settings_href: null,
    marketing_tabs: [],
    ...patch,
  };
}

describe("trial users", () => {
  it("blocks the selected people with the page's address as the return path", async () => {
    window.history.replaceState(null, "", "/trial-users?filter=non_buyers");
    get.mockResolvedValue(trial({ filter: "non_buyers" }));
    const ui = userEvent.setup();
    mount(<TrialContent />);
    await screen.findByText("تست‌گیر");
    await ui.click(screen.getByRole("checkbox", { name: /انتخاب تست/ }));
    await ui.click(await screen.findByRole("button", { name: "مسدود (۱)" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/trial-users/bulk-action", { action: "block", ids: [4], return_to: "/trial-users?filter=non_buyers" }));
  });

  it("sends a message only with its text", async () => {
    get.mockResolvedValue(trial());
    window.history.replaceState(null, "", "/trial-users");
    const ui = userEvent.setup();
    mount(<TrialContent />);
    await screen.findByText("تست‌گیر");
    await ui.click(screen.getByRole("button", { name: "عملیات تست‌گیر" }));
    await ui.click(await screen.findByRole("menuitem", { name: "پیام" }));
    await ui.type(await screen.findByRole("textbox", { name: /متن پیام/ }), "تخفیف ویژه");
    await ui.click(screen.getByRole("button", { name: "ارسال" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/trial-users/bulk-action", { action: "message", ids: [4], return_to: "/trial-users", reason: "تخفیف ویژه" }));
  });

  it("shows no selection or row actions without the manage permission", async () => {
    get.mockResolvedValue(trial({ can_message: false, can_block: false, rows: [{ ...trial().rows[0], ops: [] }] }));
    window.history.replaceState(null, "", "/trial-users");
    mount(<TrialContent />);
    await screen.findByText("تست‌گیر");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "عملیات تست‌گیر" })).toBeNull();
  });
});
