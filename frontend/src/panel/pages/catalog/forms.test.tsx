import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { panelAction } from "../../core/api";
import { WholesaleForm } from "./PlanForms";
import { ResellerPlanForm } from "./ResellerPlanForm";
import type { PlansOverview } from "./types";

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelAction: vi.fn(async () => ({ ok: true, message: "ذخیره شد" })) };
});

const LIMITS = { cards: [], per_user_data_max_text: null, per_user_expire_max_days: null, account_data_limit_text: null, max_users: null };

afterEach(() => {
  cleanup();
  vi.mocked(panelAction).mockClear();
});

describe("reseller plan form", () => {
  it("posts an add-on pack to the existing handler without any subscription-only fields", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(
      <ResellerPlanForm
        mode="create"
        groups={[{ id: 3, name: "g" }]}
        pgRoles={[{ id: 1, name: "r" }]}
        featurePerms={[["plans", "پلن‌ها"]]}
        limits={LIMITS}
        categories={[]}
        styleOptions={[{ value: "inherit", label: "ارث", tone: "default" }]}
        initialKind="addon_volume"
        onDone={onDone}
        onCancel={() => undefined}
      />,
    );
    await user.type(screen.getByRole("textbox", { name: /^نام/ }), "بسته ۲۰ گیگ");
    await user.type(screen.getByRole("textbox", { name: /^قیمت بسته/ }), "50000");
    await user.type(screen.getByRole("spinbutton", { name: /حجم بسته/ }), "20");
    await user.click(screen.getByRole("button", { name: "ذخیره پلن" }));

    await waitFor(() => expect(panelAction).toHaveBeenCalledTimes(1));
    const [path, fields] = vi.mocked(panelAction).mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/resellers/plans");
    expect(fields).toMatchObject({ plan_kind: "addon_volume", billing_mode: "fixed", name: "بسته ۲۰ گیگ", price: "50000", addon_gb: "20", is_active: true });
    expect(Object.keys(fields).filter((k) => k.startsWith("group_") || k.startsWith("perm_"))).toEqual([]);
    expect(fields).not.toHaveProperty("pg_role_id");
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("posts a subscription with its permission switches under the handler's field names", async () => {
    const user = userEvent.setup();
    render(
      <ResellerPlanForm
        mode="edit"
        plan={{
          id: 9, name: "نقره‌ای", description: "", price: 100, plan_kind: "subscription", billing_mode: "fixed", price_per_gb: 0, sort_order: 0,
          category_id: null, duration_days: 30, included_gb: 10, included_users: 5, addon_gb: 0, addon_users: 0, renew_price: 0, renew_pricing_mode: "fixed",
          allow_buy_extra: false, extra_gb_price: 0, extra_user_price: 0, create_pg_admin: true, share_pg_panel_url: false, pg_role_id: 4, pg_group_ids: ["2"],
          button_style: "inherit", is_active: true, is_system: false,
        }}
        groups={[{ id: 2, name: "گروه" }]}
        pgRoles={[{ id: 4, name: "نقش" }]}
        featurePerms={[["plans", "پلن‌ها"], ["orders", "سفارش‌ها"]]}
        selectedPerms={["plans"]}
        limits={LIMITS}
        categories={[]}
        styleOptions={[{ value: "inherit", label: "ارث", tone: "default" }]}
        onDone={() => undefined}
        onCancel={() => undefined}
      />,
    );
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    await waitFor(() => expect(panelAction).toHaveBeenCalledTimes(1));
    const [path, fields] = vi.mocked(panelAction).mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/resellers/plans/9/edit");
    expect(fields).toMatchObject({ plan_kind: "subscription", billing_mode: "fixed", group_2: "2", perm_plans: true, pg_role_id: "4", included_gb: "10", included_users: "5", create_pg_admin: true });
    expect(fields).not.toHaveProperty("perm_orders");
  });
});

describe("wholesale form", () => {
  it("posts the tiers as the JSON the handler stores", async () => {
    const user = userEvent.setup();
    const data = {
      wholesale: { enabled: true, min_qty: "5", max_qty: "20", button_text: "📦 فروش عمده", tiers: [{ min: 20, percent: 20 }, { min: 5, percent: 10 }] },
    } as unknown as PlansOverview;
    render(<WholesaleForm data={data} onDone={() => undefined} onCancel={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "ذخیره فروش عمده" }));
    await waitFor(() => expect(panelAction).toHaveBeenCalledTimes(1));
    const [path, fields] = vi.mocked(panelAction).mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/plans/wholesale");
    expect(fields).toMatchObject({ wholesale_enabled: true, wholesale_min_qty: "5", wholesale_max_qty: "20", btn_wholesale: "📦 فروش عمده" });
    expect(JSON.parse(String(fields.wholesale_tiers))).toEqual([{ min: 5, percent: 10 }, { min: 20, percent: 20 }]);
  });
});
