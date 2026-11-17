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
vi.mock("../../core/confirm", () => ({ confirm: (message: string, options: unknown) => ask(message, options) }));
vi.mock("../../layout/PanelShell", () => ({ PanelShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { CashbackPage, purchasesLabel, valueLabel } from "./CashbackPage";
import type { CashbackData, CashbackRule } from "./cashbackTypes";

const PERCENT_RULE: CashbackRule = {
  id: 7, name: "خرید اول", mode: "percent", percent: "2.5", fixed_amount: 0, max_per_order: 50000, min_order_amount: 1000,
  events: ["new", "renew"], first_purchase_only: true, allow_with_discount: false, customer_max_count: 3, customer_max_amount: null,
  priority: 4, enabled: true,
};
const FIXED_RULE: CashbackRule = {
  ...PERCENT_RULE, id: 8, name: "مبلغ ثابت", mode: "fixed", percent: "0", fixed_amount: 7000, max_per_order: null, events: ["addon"],
  first_purchase_only: false, allow_with_discount: true, customer_max_count: null, priority: 0, enabled: false,
};

function data(patch: Partial<CashbackData> = {}): CashbackData {
  return {
    sections: [],
    rules: [PERCENT_RULE, FIXED_RULE],
    settings: { enabled: true, combine: "best", hold_hours: 24, monthly_budget: 9000 },
    budget_used: 1234,
    limits: { rule_limit: 50, max_hold_hours: 2160, max_priority: 1000, max_monthly_count: 10000 },
    ...patch,
  };
}

beforeEach(() => {
  get.mockReset();
  action.mockReset();
  ask.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "" });
});

afterEach(() => {
  cleanup();
  toast.clear();
  window.history.replaceState(null, "", "/");
});

function mount() {
  return render(
    <>
      <AppToastProvider />
      <CashbackPage />
    </>,
  );
}

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string, item: RegExp) {
  await user.click(await screen.findByRole("button", { name: `عملیات ${name}` }));
  await user.click(await screen.findByRole("menuitem", { name: item }));
}

describe("cashback labels", () => {
  it("shows a rule's value in its own unit", () => {
    expect(valueLabel(PERCENT_RULE)).toBe("۲٫۵٪");
    expect(valueLabel(FIXED_RULE)).toBe("۷٬۰۰۰ تومان");
  });

  it("lists the purchase kinds and the first-purchase limit", () => {
    expect(purchasesLabel(PERCENT_RULE)).toBe("تازه، تمدید · فقط اولین خرید");
    expect(purchasesLabel(FIXED_RULE)).toBe("اضافه");
  });
});

describe("cashback page", () => {
  it("lists the rules with their status and the month's budget use", async () => {
    get.mockResolvedValue(data());
    mount();
    expect(await screen.findByText("خرید اول")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/panel/cashback");
    expect(screen.getByText("۲ قانون")).toBeTruthy();
    expect(screen.getByText("روشن", { selector: "span" })).toBeTruthy();
    expect(screen.getByText(/مصرف این ماه/).textContent).toContain("۱٬۲۳۴ تومان");
  });

  it("shows the empty state and hides the settings fields while cashback is off", async () => {
    get.mockResolvedValue(data({ rules: [], settings: { enabled: false, combine: "sum", hold_hours: 0, monthly_budget: 0 } }));
    mount();
    expect(await screen.findByText("هنوز قانونی ساخته نشده است.")).toBeTruthy();
    expect(screen.queryByText("دورهٔ انتظار (ساعت)")).toBeNull();
    expect(screen.queryByRole("button", { name: "ذخیرهٔ تنظیمات" })).toBeNull();
  });

  it("shows a hostile rule name as text", async () => {
    get.mockResolvedValue(data({ rules: [{ ...PERCENT_RULE, name: "<img src=x onerror=alert(1)>" }] }));
    const { container } = mount();
    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("saves the settings with the posted field names", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data());
    mount();
    const hold = await screen.findByRole("spinbutton", { name: /^دورهٔ انتظار/ });
    await user.clear(hold);
    await user.type(hold, "48");
    await user.click(screen.getByRole("button", { name: "ذخیرهٔ تنظیمات" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action).toHaveBeenCalledWith("/cashback/settings", { enabled: true, combine: "best", hold_hours: "48", monthly_budget: "9000" });
  });

  it("saves as soon as the main switch is flipped, like the old page", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data());
    mount();
    await user.click(await screen.findByRole("switch", { name: "کش‌بک روشن" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action).toHaveBeenCalledWith("/cashback/settings", { enabled: false, combine: "best", hold_hours: "24", monthly_budget: "9000" });
  });

  it("creates a percentage rule and sends no fixed amount", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data({ rules: [] }));
    mount();
    await user.click(await screen.findByRole("button", { name: "قانون تازه" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /^نام قانون/ }), "عید");
    await user.type(within(dialog).getByRole("spinbutton", { name: /^درصد/ }), "2.5");
    await user.click(within(dialog).getByRole("button", { name: "ساخت قانون" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [path, fields] = action.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/cashback/rules");
    expect(fields).toMatchObject({
      name: "عید", mode: "percent", percent: "2.5", max_per_order: "", min_order_amount: "0", priority: "0", customer_max_count: "", customer_max_amount: "",
      event_new: true, event_renew: true, event_addon: true, first_purchase_only: false, allow_with_discount: true,
    });
    expect(fields).not.toHaveProperty("fixed_amount");
    expect(fields).not.toHaveProperty("shop_id");
  });

  it("keeps the form open with its values when the handler refuses", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data({ rules: [] }));
    action.mockResolvedValue({ ok: false, message: "نام قانون الزامی است" });
    mount();
    await user.click(await screen.findByRole("button", { name: "قانون تازه" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /^نام قانون/ }), "عید");
    await user.click(within(dialog).getByRole("button", { name: "ساخت قانون" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("نام قانون الزامی است")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((within(screen.getByRole("dialog")).getByRole("textbox", { name: /^نام قانون/ }) as HTMLInputElement).value).toBe("عید");
  });

  it("edits a rule in place with its saved values, and only posts the mode's amount", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data());
    mount();
    await openRowMenu(user, "مبلغ ثابت", /ویرایش/);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("ویرایش قانون کش‌بک")).toBeTruthy();
    expect(within(dialog).getByText(/تغییر فقط روی خریدهای بعدی اثر دارد/)).toBeTruthy();
    expect((within(dialog).getByRole("textbox", { name: /^مبلغ ثابت/ }) as HTMLInputElement).value).toBe("7000");
    expect(within(dialog).queryByRole("spinbutton", { name: /^درصد/ })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "ذخیرهٔ قانون" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [path, fields] = action.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/cashback/rules/8");
    expect(fields).toMatchObject({ name: "مبلغ ثابت", mode: "fixed", fixed_amount: "7000", event_new: false, event_renew: false, event_addon: true });
    expect(fields).not.toHaveProperty("percent");
  });

  it("turns a rule off by posting nothing and on by posting enabled", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data());
    mount();
    await openRowMenu(user, "خرید اول", /خاموش کردن/);
    await waitFor(() => expect(action).toHaveBeenCalledWith("/cashback/rules/7/toggle", {}));
    await openRowMenu(user, "مبلغ ثابت", /روشن کردن/);
    await waitFor(() => expect(action).toHaveBeenCalledWith("/cashback/rules/8/toggle", { enabled: true }));
  });

  it("asks before deleting and says granted cashback stays", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data());
    mount();
    await openRowMenu(user, "خرید اول", /حذف/);
    await waitFor(() => expect(action).toHaveBeenCalledWith("/cashback/rules/7/delete", {}));
    const [message, options] = ask.mock.calls[0] as [string, { description: string; confirmLabel: string }];
    expect(message).toBe("حذف قانون");
    expect(options.description).toContain("کش‌بک‌هایی که قبلاً داده شده عوض نمی‌شوند");
    expect(options.confirmLabel).toBe("حذف");
  });

  it("does not delete when the confirmation is declined", async () => {
    const user = userEvent.setup();
    ask.mockResolvedValue(false);
    get.mockResolvedValue(data());
    mount();
    await openRowMenu(user, "خرید اول", /حذف/);
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    expect(action).not.toHaveBeenCalled();
  });
});
