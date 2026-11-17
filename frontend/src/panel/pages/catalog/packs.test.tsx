import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { panelAction } from "../../core/api";
import { AddonPackCreateForm } from "./AddonPackCreateForm";
import { FixedPlanForm, PlanEditForm } from "./PlanForms";
import { ResellerPlanForm } from "./ResellerPlanForm";
import type { PlanEdit, PlansOverview, ResellerPackConfig, ResellerPlanEdit, StyleOption, UserPackConfig } from "./types";

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelAction: vi.fn(async () => ({ ok: true, message: "ذخیره شد" })) };
});

const LIMITS = { cards: [], per_user_data_max_text: null, per_user_expire_max_days: null, account_data_limit_text: null, max_users: null };
const STYLES: StyleOption[] = [
  { value: "inherit", label: "ارث از پیش‌فرض", tone: "default" },
  { value: "", label: "سفید", tone: "default" },
  { value: "primary", label: "آبی", tone: "primary" },
  { value: "success", label: "سبز", tone: "success" },
  { value: "danger", label: "قرمز", tone: "danger" },
];
const RESELLER_CONFIG: ResellerPackConfig = { max_per_kind: 3, gb: { defaults: [1, 5, 10, 50], max: 100000 }, users: { defaults: [1, 5, 10, 20], max: 100000 } };
const USER_CONFIG: UserPackConfig = { max_per_kind: 20, batch: { max_rows: 3, max_volume_gb: 10000, max_days: 3650 }, volume: { defaults: [1, 5, 10, 50], max: 10000 }, duration: { defaults: [1, 3, 6, 12], max: 120 } };

type ResellerPlan = ResellerPlanEdit["plan"];
const RESELLER_PLAN: ResellerPlan = {
  id: 9, name: "نقره‌ای", description: "", price: 100, plan_kind: "subscription", billing_mode: "fixed", price_per_gb: 0, sort_order: 0,
  category_id: null, duration_days: 30, included_gb: 10, included_users: 5, addon_gb: 0, addon_users: 0, renew_price: 0, renew_pricing_mode: "from_capacity",
  allow_buy_extra: true, extra_gb_price: 1000, extra_user_price: 5000, create_pg_admin: true, share_pg_panel_url: false, pg_role_id: 4, pg_group_ids: ["2"],
  button_style: "inherit", is_active: true, is_system: false, carry_remaining_period: false, keep_extras_on_renew: true, allow_pg_panel_access: false,
  payg_basis: "traffic", payg_charge_upfront: false, payg_user_price: 0, payg_user_price_per_30d: false, payg_unlimited_price: null,
};

function renderReseller(plan: Partial<ResellerPlan> | null, props: Partial<React.ComponentProps<typeof ResellerPlanForm>> = {}) {
  return render(
    <ResellerPlanForm
      mode={plan ? "edit" : "create"}
      plan={plan ? { ...RESELLER_PLAN, ...plan } : undefined}
      groups={[{ id: 2, name: "گروه" }]}
      pgRoles={[{ id: 4, name: "نقش" }]}
      featurePerms={[["plans", "پلن‌ها"]]}
      selectedPerms={["plans"]}
      limits={LIMITS}
      categories={[]}
      styleOptions={STYLES.slice(0, 2)}
      packStyleOptions={STYLES}
      packConfig={RESELLER_CONFIG}
      packs={{ gb: [{ amount: 2, button_style: "inherit" }, { amount: 10, button_style: "success" }], users: [{ amount: 3, button_style: "" }] }}
      onDone={() => undefined}
      onCancel={() => undefined}
      {...props}
    />,
  );
}

async function posted(): Promise<{ path: string; fields: Record<string, unknown> }> {
  await waitFor(() => expect(panelAction).toHaveBeenCalledTimes(1));
  const [path, fields] = vi.mocked(panelAction).mock.calls[0] as [string, Record<string, unknown>];
  return { path, fields };
}

afterEach(() => {
  cleanup();
  vi.mocked(panelAction).mockClear();
});

describe("reseller extra packs", () => {
  it("posts the stairs as paired repeated amount and colour fields", async () => {
    const user = userEvent.setup();
    renderReseller({});
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    const { path, fields } = await posted();
    expect(path).toBe("/resellers/plans/9/edit");
    expect(fields).toMatchObject({
      allow_buy_extra: true,
      extra_gb_price: "1000",
      extra_user_price: "5000",
      extra_gb_amount: ["2", "10"],
      extra_gb_style: ["inherit", "success"],
      extra_user_amount: ["3"],
      extra_user_style: [""],
    });
  });

  it("adds, edits and removes a line and shows the computed price of each", async () => {
    const user = userEvent.setup();
    renderReseller({});
    const volumeRows = () => screen.getAllByRole("spinbutton", { name: "مقدار حجم بسته" });
    expect(volumeRows()).toHaveLength(2);
    // 10 GB × 1,000 toman, grouped with Persian digits.
    expect(screen.getByText(/۱۰٬۰۰۰ تومان/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "افزودن بستهٔ حجم" }));
    expect(volumeRows()).toHaveLength(3);
    await user.clear(volumeRows()[2]);
    await user.type(volumeRows()[2], "7");
    await user.click(screen.getAllByRole("button", { name: "حذف بسته حجم" })[0]);
    expect(volumeRows()).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    const { fields } = await posted();
    expect(fields.extra_gb_amount).toEqual(["10", "7"]);
    expect(fields.extra_gb_style).toEqual(["success", "inherit"]);
  });

  it("switches the kind with the tabs and posts both kinds whichever tab is open", async () => {
    const user = userEvent.setup();
    renderReseller({});
    await user.click(screen.getByRole("tab", { name: /کاربر/ }));
    expect(screen.getAllByRole("spinbutton", { name: "تعداد کاربر بسته" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    const { fields } = await posted();
    expect(fields.extra_gb_amount).toEqual(["2", "10"]);
    expect(fields.extra_user_amount).toEqual(["3"]);
  });

  it("offers the stairs only while extra buying is on, and starts from the default stairs", async () => {
    const user = userEvent.setup();
    renderReseller(null, { packs: undefined });
    expect(screen.queryByRole("tab", { name: /حجم/ })).toBeNull();
    await user.click(screen.getByRole("switch", { name: /امکان خرید/ }));
    expect(screen.getAllByRole("spinbutton", { name: "مقدار حجم بسته" })).toHaveLength(4);
    await user.type(screen.getByRole("textbox", { name: /^نام/ }), "پلن");
    await user.click(screen.getByRole("button", { name: "ذخیره پلن" }));
    const { path, fields } = await posted();
    expect(path).toBe("/resellers/plans");
    expect(fields.extra_gb_amount).toEqual(["1", "5", "10", "50"]);
    expect(fields.extra_user_amount).toEqual(["1", "5", "10", "20"]);
  });

  it("leaves the stored stairs alone when extra buying is off", async () => {
    const user = userEvent.setup();
    renderReseller({ allow_buy_extra: false });
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    const { fields } = await posted();
    expect(fields.allow_buy_extra).toBe(false);
    expect(fields).not.toHaveProperty("extra_gb_amount");
    expect(fields).not.toHaveProperty("extra_user_style");
  });

  it("never offers stairs on a PAYG plan or an add-on pack", async () => {
    renderReseller({ billing_mode: "payg", price_per_gb: 700, allow_buy_extra: false });
    expect(screen.queryByRole("switch", { name: /امکان خرید/ })).toBeNull();
    cleanup();
    renderReseller(null, { initialKind: "addon_volume", packs: undefined });
    expect(screen.queryByRole("tab", { name: /حجم/ })).toBeNull();
  });

  it("keeps the line limit and a colour a line was given", async () => {
    const user = userEvent.setup();
    renderReseller({}, { packs: { gb: [{ amount: 1, button_style: "inherit" }, { amount: 2, button_style: "inherit" }, { amount: 3, button_style: "inherit" }], users: [] } });
    expect(screen.getByRole("button", { name: "افزودن بستهٔ حجم" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getAllByRole("button", { name: /رنگ دکمه بسته حجم/ })[0]);
    await user.click(await screen.findByRole("option", { name: "قرمز" }));
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    const { fields } = await posted();
    expect(fields.extra_gb_style).toEqual(["danger", "inherit", "inherit"]);
    // An empty kind starts from the default stairs when the editor opens switched on, like the old page.
    expect(fields.extra_user_amount).toEqual(["1", "5", "10", "20"]);
  });
});

describe("reseller PAYG pricing and renewal switches", () => {
  it("posts the PAYG fields the handler reads when the plan is PAYG", async () => {
    const user = userEvent.setup();
    renderReseller(null, { initialKind: "payg", packs: undefined });
    await user.type(screen.getByRole("textbox", { name: /^نام/ }), "پی‌اج");
    await user.type(screen.getByRole("textbox", { name: /^نرخ هر گیگ/ }), "700");
    await user.click(screen.getByRole("button", { name: "ذخیره پلن" }));
    const { path, fields } = await posted();
    expect(path).toBe("/resellers/plans");
    expect(fields).toMatchObject({
      billing_mode: "payg",
      price_per_gb: "700",
      payg_fields_shown: true,
      payg_basis: "traffic",
      payg_charge_upfront: true,
      payg_user_price: "0",
      payg_user_price_per_30d: false,
      payg_unlimited_price: "",
    });
  });

  it("shows each PAYG field only for the basis that prices it, and keeps what was typed", async () => {
    const user = userEvent.setup();
    renderReseller({
      billing_mode: "payg", price_per_gb: 700, allow_buy_extra: false, payg_basis: "user_traffic", payg_charge_upfront: true,
      payg_user_price: 1500, payg_user_price_per_30d: true, payg_unlimited_price: 9000,
    });
    expect(screen.getByRole("textbox", { name: /^قیمت هر کاربر/ })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /هر ۳۰ روز/ })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /کسر هزینهٔ حجم/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    const { path, fields } = await posted();
    expect(path).toBe("/resellers/plans/9/edit");
    expect(fields).toMatchObject({
      payg_fields_shown: true, payg_basis: "user_traffic", payg_charge_upfront: true, payg_user_price: "1500", payg_user_price_per_30d: true, payg_unlimited_price: "9000",
    });
    // A PAYG package has no fixed-renewal switches on screen.
    expect(screen.queryByRole("switch", { name: /انتقال زمان باقی‌مانده/ })).toBeNull();
  });

  it("hides the per-user price for a volume-only basis and sends no PAYG fields for a fixed plan", async () => {
    const user = userEvent.setup();
    renderReseller({ billing_mode: "payg", price_per_gb: 700, allow_buy_extra: false, payg_basis: "traffic" });
    expect(screen.queryByRole("textbox", { name: /^قیمت هر کاربر/ })).toBeNull();
    cleanup();
    renderReseller({});
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    const { fields } = await posted();
    expect(Object.keys(fields).filter((k) => k.startsWith("payg_"))).toEqual([]);
  });

  it("posts the renewal and panel-access switches an edit changed", async () => {
    const user = userEvent.setup();
    renderReseller({});
    await user.click(screen.getByRole("switch", { name: /انتقال زمان باقی‌مانده/ }));
    await user.click(screen.getByRole("switch", { name: /حفظ حجم و کاربر اضافه در تمدید/ }));
    await user.click(screen.getByRole("switch", { name: /^دسترسی به پاسارگارد/ }));
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    const { fields } = await posted();
    expect(fields).toMatchObject({ carry_remaining_period: true, allow_pg_panel_access: true });
    expect(fields.keep_extras_on_renew).toBe(false);
  });
});

const USER_PLAN: PlanEdit["plan"] = {
  id: 4, name: "ویژه", price: 1000, duration_days: 30, data_limit_gb: null, description: "", category_id: null, sort_order: 0, pg_template_id: null,
  pg_group_ids: ["2"], naming: { prefix: "", suffix: "", pattern: "" }, button_style: "inherit", is_trial: false, carry_remaining_quota: false,
  allow_buy_extra: true, extra_gb_price: 700, extra_month_price: 9000,
};

function userEdit(plan: Partial<PlanEdit["plan"]> = {}, packs: PlanEdit["packs"] = { volume: [{ amount: 5, button_style: "inherit" }, { amount: 20, button_style: "danger" }], duration: [{ amount: 3, button_style: "" }] }): PlanEdit {
  return {
    plan: { ...USER_PLAN, ...plan },
    packs,
    pack_style_options: STYLES,
    pack_config: { user: USER_CONFIG },
    pg_error: null,
    limits: LIMITS,
    templates: [],
    groups: [{ id: 2, name: "گروه" }],
    categories: [],
    naming_defaults: { prefix: "clk", suffix: "", pattern: "{prefix}_{random}{suffix}" },
    plan_style_options: STYLES.slice(0, 2),
  };
}

describe("customer plan add-on packs", () => {
  it("posts the plan's own volume and month stairs under the names the handler pairs by row", async () => {
    const user = userEvent.setup();
    render(<PlanEditForm data={userEdit()} onDone={() => undefined} onCancel={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));
    const { path, fields } = await posted();
    expect(path).toBe("/plans/4/edit");
    expect(fields).toMatchObject({
      allow_buy_extra: true,
      extra_gb_price: "700",
      extra_month_price: "9000",
      plan_vol_amount: ["5", "20"],
      plan_vol_style: ["inherit", "danger"],
      plan_dur_amount: ["3"],
      plan_dur_style: [""],
    });
  });

  it("prices a month line with the monthly rate and edits it", async () => {
    const user = userEvent.setup();
    render(<PlanEditForm data={userEdit()} onDone={() => undefined} onCancel={() => undefined} />);
    await user.click(screen.getByRole("tab", { name: /زمان/ }));
    // 3 months × 9,000 toman.
    expect(screen.getByText(/۲۷٬۰۰۰ تومان/)).toBeTruthy();
    const months = screen.getByRole("spinbutton", { name: "مقدار ماه بسته" });
    await user.clear(months);
    await user.type(months, "6");
    expect(screen.getByText(/۵۴٬۰۰۰ تومان/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));
    const { fields } = await posted();
    expect(fields.plan_dur_amount).toEqual(["6"]);
  });

  it("sends only the off switch when extra sales are off, so the handler clears the plan's packs", async () => {
    const user = userEvent.setup();
    render(<PlanEditForm data={userEdit()} onDone={() => undefined} onCancel={() => undefined} />);
    await user.click(screen.getByRole("switch", { name: /کاربر بتواند حجم و زمان اضافه بخرد/ }));
    await user.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));
    const { fields } = await posted();
    expect(fields.allow_buy_extra).toBe(false);
    for (const key of ["extra_gb_price", "extra_month_price", "plan_vol_amount", "plan_dur_amount"]) expect(fields).not.toHaveProperty(key);
  });

  it("posts the quota-carry switch with its stored value", async () => {
    const user = userEvent.setup();
    render(<PlanEditForm data={userEdit()} onDone={() => undefined} onCancel={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));
    expect((await posted()).fields.carry_remaining_quota).toBe(false);
  });

  it("starts a new plan with the default stairs once extra sales are switched on", async () => {
    const user = userEvent.setup();
    const data = {
      categories: [], groups: [{ id: 2, name: "گروه" }], templates: [], can_create_template: false, limits: LIMITS, is_platform_admin: false,
      naming_defaults: { prefix: "clk", suffix: "", pattern: "{prefix}_{random}{suffix}" }, plan_style_options: STYLES.slice(0, 2),
      pack_style_options: STYLES, pack_config: { user: USER_CONFIG },
    } as unknown as PlansOverview;
    render(<FixedPlanForm data={data} onDone={() => undefined} onCancel={() => undefined} />);
    expect(screen.queryByRole("tab", { name: /زمان/ })).toBeNull();
    await user.click(screen.getByRole("switch", { name: /کاربر بتواند حجم و زمان اضافه بخرد/ }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getAllByRole("spinbutton", { name: "مقدار حجم بسته" })).toHaveLength(4);
    await user.type(screen.getByRole("textbox", { name: /^نام پلن/ }), "جدید");
    await user.type(screen.getByRole("textbox", { name: /^قیمت \(تومان\)/ }), "1000");
    await user.click(screen.getByRole("button", { name: "ذخیره پلن" }));
    const { path, fields } = await posted();
    expect(path).toBe("/plans");
    expect(fields).toMatchObject({ carry_remaining_quota: true, allow_buy_extra: true, extra_gb_price: "0", extra_month_price: "0" });
    expect(fields.plan_vol_amount).toEqual(["1", "5", "10", "50"]);
    expect(fields.plan_dur_amount).toEqual(["1", "3", "6", "12"]);
    expect(fields.plan_dur_style).toEqual(["inherit", "inherit", "inherit", "inherit"]);
  });
});

describe("general add-on pack create form", () => {
  const data = {
    plans: [{ id: 4, name: "ویژه" }],
    categories: [{ id: 3, name: "دسته", audience: "users", is_active: true }],
    pack_style_options: STYLES,
    pack_config: { user: USER_CONFIG },
  } as unknown as PlansOverview;

  it("posts one pack with the single-row field names", async () => {
    const user = userEvent.setup();
    render(<AddonPackCreateForm data={data} kind="volume" onDone={() => undefined} onCancel={() => undefined} />);
    await user.type(screen.getByRole("textbox", { name: /^نام بسته/ }), "ده گیگ");
    await user.type(screen.getByRole("spinbutton", { name: "مقدار بسته" }), "10");
    await user.type(screen.getByRole("textbox", { name: "قیمت بسته (تومان)" }), "50000");
    await user.click(screen.getByRole("button", { name: "افزودن بسته" }));
    const { path, fields } = await posted();
    expect(path).toBe("/plans/addons");
    expect(fields).toMatchObject({ kind: "volume", name: "ده گیگ", plan_id: "", category_id: "", sort_order: "0", amount: ["10"], price: ["50000"], button_style: ["inherit"] });
  });

  it("posts several rows with their colours and leaves the name to the handler", async () => {
    const user = userEvent.setup();
    render(<AddonPackCreateForm data={data} kind="duration" onDone={() => undefined} onCancel={() => undefined} />);
    await user.type(screen.getByRole("textbox", { name: /^نام بسته/ }), "نام");
    await user.type(screen.getByRole("spinbutton", { name: "مقدار بسته" }), "7");
    await user.type(screen.getByRole("textbox", { name: "قیمت بسته (تومان)" }), "1000");
    await user.click(screen.getByRole("button", { name: "افزودن ردیف" }));
    const amounts = screen.getAllByRole("spinbutton", { name: "مقدار بسته" });
    await user.type(amounts[1], "30");
    await user.type(screen.getAllByRole("textbox", { name: "قیمت بسته (تومان)" })[1], "4000");
    await user.click(screen.getAllByRole("button", { name: /رنگ دکمه بسته در ربات/ })[1]);
    await user.click(await screen.findByRole("option", { name: "سبز" }));
    await user.click(screen.getByRole("button", { name: "افزودن بسته‌ها" }));
    const { fields } = await posted();
    expect(fields).toMatchObject({ kind: "duration", name: "", amount: ["7", "30"], price: ["1000", "4000"], button_style: ["inherit", "success"] });
  });

  it("stops at the row limit and drops the category when the pack belongs to a plan", async () => {
    const user = userEvent.setup();
    render(<AddonPackCreateForm data={data} kind="volume" onDone={() => undefined} onCancel={() => undefined} />);
    for (let i = 0; i < 5; i += 1) if (!screen.getByRole("button", { name: "افزودن ردیف" }).hasAttribute("disabled")) await user.click(screen.getByRole("button", { name: "افزودن ردیف" }));
    expect(screen.getAllByRole("spinbutton", { name: "مقدار بسته" })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "افزودن ردیف" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: /پلن اختصاصی/ }));
    await user.click(await screen.findByRole("option", { name: "ویژه" }));
    for (const input of screen.getAllByRole("spinbutton", { name: "مقدار بسته" })) await user.type(input, "1");
    for (const input of screen.getAllByRole("textbox", { name: "قیمت بسته (تومان)" })) await user.type(input, "5");
    await user.click(screen.getByRole("button", { name: "افزودن بسته‌ها" }));
    const { fields } = await posted();
    expect(fields).toMatchObject({ plan_id: "4", category_id: "" });
    expect(fields.amount).toEqual(["1", "1", "1"]);
  });
});
