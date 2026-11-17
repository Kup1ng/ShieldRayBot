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

import { basisLabel, ChildPricingPage, childPlanName } from "./ChildPricingPage";
import type { ChildPlan, ChildPricingData, ChildShop } from "./childPricingTypes";
import { ResellersPage } from "./ResellersPage";

const PLAN: ChildPlan = { id: 4, name: "فروش ویژه", payg_basis: "user_traffic", price_per_gb: 1500, payg_user_price: 900, payg_user_price_per_30d: true, payg_unlimited_price: 5000 };
const CHILD: ChildShop = { shop_id: 6, label: "alpha", plan_id: 4, credit_limit: 20000 };

function data(patch: Partial<ChildPricingData> = {}): ChildPricingData {
  return { plans: [PLAN], children: [CHILD], free_credit: 50000, plan_limit: 50, ...patch };
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
      <ChildPricingPage />
    </>,
  );
}

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, label: string, item: RegExp) {
  await user.click(await screen.findByRole("button", { name: label }));
  await user.click(await screen.findByRole("menuitem", { name: item }));
}

describe("child pricing helpers", () => {
  it("names the basis and falls back to the owner's package for a child without a list", () => {
    expect(basisLabel("user_traffic")).toBe("کاربر + حجم");
    expect(childPlanName(CHILD, [PLAN])).toBe("فروش ویژه");
    expect(childPlanName({ plan_id: null }, [PLAN])).toBe("پکیج مالک");
    expect(childPlanName({ plan_id: 99 }, [PLAN])).toBe("پکیج مالک");
  });
});

describe("child pricing page", () => {
  it("shows the free credit, the price lists and each child's list and credit", async () => {
    get.mockResolvedValue(data({ children: [CHILD, { shop_id: 7, label: "beta", plan_id: null, credit_limit: 0 }] }));
    mount();
    expect(await screen.findByText("اعتبار آزاد شما")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/panel/resellers/children-pricing");
    expect(screen.getAllByText(/۵۰٬۰۰۰ تومان/).length).toBeGreaterThan(0);
    const plans = screen.getByRole("grid", { name: "پلن‌های قیمت" });
    expect(within(plans).getByText("فروش ویژه")).toBeTruthy();
    expect(within(plans).getByText("کاربر + حجم")).toBeTruthy();
    expect(within(plans).getByText("۱٬۵۰۰ تومان")).toBeTruthy();
    const children = screen.getByRole("grid", { name: "زیرمجموعه‌ها" });
    expect(within(children).getByText("alpha")).toBeTruthy();
    expect(within(children).getByText("فروش ویژه")).toBeTruthy();
    expect(within(children).getByText("پکیج مالک")).toBeTruthy();
    expect(within(children).getByText("۲۰٬۰۰۰ تومان")).toBeTruthy();
  });

  it("says so when there are no price lists and no children", async () => {
    get.mockResolvedValue(data({ plans: [], children: [] }));
    mount();
    expect(await screen.findByText("هنوز پلن قیمتی نساخته‌اید.")).toBeTruthy();
    expect(screen.getByText("نمایندهٔ زیرمجموعه‌ای با فروشگاه ندارید")).toBeTruthy();
  });

  it("shows a hostile plan name and label as text", async () => {
    get.mockResolvedValue(data({ plans: [{ ...PLAN, name: "<img src=x onerror=alert(1)>" }], children: [{ ...CHILD, label: "<b>x</b>" }] }));
    const { container } = mount();
    expect((await screen.findAllByText("<img src=x onerror=alert(1)>")).length).toBeGreaterThan(0);
    expect(screen.getByText("<b>x</b>")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("creates a price list with the posted field names of the old form", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data({ plans: [], children: [] }));
    mount();
    await user.click(await screen.findByRole("button", { name: "پلن قیمت تازه" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /^نام پلن/ }), "عمده");
    await user.clear(within(dialog).getByRole("textbox", { name: /^نرخ هر گیگ/ }));
    await user.type(within(dialog).getByRole("textbox", { name: /^نرخ هر گیگ/ }), "1,500");
    await user.click(within(dialog).getByRole("button", { name: "ساخت پلن" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [path, fields] = action.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/resellers/children-pricing/plans");
    expect(fields).toMatchObject({ name: "عمده", payg_basis: "traffic", price_per_gb: "1500", payg_user_price: "0", payg_unlimited_price: "" });
    expect(fields.payg_user_price_per_30d).toBeFalsy();
    expect(within(dialog).queryByText(/تغییر فقط روی هزینه‌های بعدی/)).toBeNull();
  });

  it("edits a price list from its saved values and says only later charges change", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data());
    mount();
    await openRowMenu(user, "عملیات فروش ویژه", /ویرایش/);
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByRole("textbox", { name: /^نام پلن/ }) as HTMLInputElement).value).toBe("فروش ویژه");
    expect((within(dialog).getByRole("textbox", { name: /^قیمت کاربر نامحدود/ }) as HTMLInputElement).value).toBe("5000");
    expect(within(dialog).getByText("تغییر فقط روی هزینه‌های بعدی اثر دارد.")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "ذخیرهٔ پلن" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [path, fields] = action.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/resellers/children-pricing/plans/4");
    expect(fields).toMatchObject({ name: "فروش ویژه", payg_basis: "user_traffic", price_per_gb: "1500", payg_user_price: "900", payg_unlimited_price: "5000", payg_user_price_per_30d: true });
  });

  it("keeps the form open and reports the handler's refusal", async () => {
    const user = userEvent.setup();
    action.mockResolvedValue({ ok: false, message: "قیمت پلن باید بیشتر از صفر باشد" });
    get.mockResolvedValue(data({ plans: [], children: [] }));
    mount();
    await user.click(await screen.findByRole("button", { name: "پلن قیمت تازه" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /^نام پلن/ }), "رایگان");
    await user.click(within(dialog).getByRole("button", { name: "ساخت پلن" }));
    expect(await screen.findByText("قیمت پلن باید بیشتر از صفر باشد")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("asks before deleting a price list and says old charges stay", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data());
    mount();
    await openRowMenu(user, "عملیات فروش ویژه", /حذف/);
    await waitFor(() => expect(action).toHaveBeenCalledWith("/resellers/children-pricing/plans/4/delete", {}));
    const [title, options] = ask.mock.calls[0] as [string, { description: string; tone: string }];
    expect(title).toBe("حذف پلن");
    expect(options.description).toBe("پلن «فروش ویژه» حذف شود؟ هزینه‌های قبلی تغییری نمی‌کنند.");
    expect(options.tone).toBe("danger");
  });

  it("does not delete when the confirmation is declined", async () => {
    const user = userEvent.setup();
    ask.mockResolvedValue(false);
    get.mockResolvedValue(data());
    mount();
    await openRowMenu(user, "عملیات فروش ویژه", /حذف/);
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(action).not.toHaveBeenCalled();
  });

  it("saves a child's price list and credit, showing how much credit is still free", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data());
    mount();
    await openRowMenu(user, "عملیات alpha", /ویرایش/);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/آزاد: ۵۰٬۰۰۰ تومان/)).toBeTruthy();
    const credit = within(dialog).getByRole("textbox", { name: /^سقف اعتبار/ });
    expect((credit as HTMLInputElement).value).toBe("20000");
    await user.clear(credit);
    await user.type(credit, "30,000");
    await user.click(within(dialog).getByRole("button", { name: "ذخیره" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action).toHaveBeenCalledWith("/resellers/children-pricing/6", { plan_id: "4", credit_limit: "30000" });
  });

  it("sends an empty plan for a child that pays the owner's package", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(data({ children: [{ shop_id: 7, label: "beta", plan_id: null, credit_limit: 0 }] }));
    mount();
    await openRowMenu(user, "عملیات beta", /ویرایش/);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "ذخیره" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/resellers/children-pricing/7", { plan_id: "", credit_limit: "0" }));
  });
});

describe("the resellers list link", () => {
  const LIST = {
    owner_view: false,
    can_create: "child",
    q: "",
    color: "",
    color_tags: [],
    oversold_ids: [],
    rows: [],
    pager: { page: 1, page_size: 25, total: 0, pages: 1, has_prev: false, has_next: false, prev_page: null, next_page: null },
  };

  it("is offered to a viewer who can price children", async () => {
    get.mockResolvedValue({ ...LIST, can_price_children: true });
    render(<ResellersPage />);
    expect(await screen.findByRole("button", { name: "قیمت و اعتبار زیرمجموعه" })).toBeTruthy();
  });

  it("is not offered otherwise", async () => {
    get.mockResolvedValue({ ...LIST, can_price_children: false });
    render(<ResellersPage />);
    expect(await screen.findByRole("button", { name: "افزودن نماینده" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "قیمت و اعتبار زیرمجموعه" })).toBeNull();
  });
});
