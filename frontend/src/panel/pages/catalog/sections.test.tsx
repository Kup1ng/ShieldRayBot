import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { panelAction } from "../../core/api";
import { ResellerPlansSection } from "./ResellerPlansSection";
import type { PlansOverview, ResellerPlanRow } from "./types";
import { UserPlansSection } from "./UserPlansSection";

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelAction: vi.fn(async () => ({ ok: true, message: "انجام شد" })) };
});

afterEach(() => {
  cleanup();
  vi.mocked(panelAction).mockClear();
});

const HOSTILE = "<img src=x onerror=alert(1)>";

const OVERVIEW = {
  plans: [
    { id: 4, name: HOSTILE, price: 150000, duration_days: 30, data_limit_gb: 40, pg_template_id: 9, pg_group_ids: null, category_id: null, category_name: null, is_active: true, template_missing: true, source_empty: false, limit_issue: null },
    { id: 5, name: "دوم", price: 1, duration_days: 0, data_limit_gb: null, pg_template_id: null, pg_group_ids: null, category_id: null, category_name: "ویژه", is_active: false, template_missing: false, source_empty: true, limit_issue: "خارج از سقف حساب" },
  ],
  plan_board: { has_categories: false, groups: [], other: { title: "", note: "", plan_ids: [] } },
  trial: { exists: true, enabled: true, name: "تست", duration_days: 1, data_limit_gb: 1, pg_template_id: null, pg_group_ids: ["1"], naming: { prefix: "", suffix: "", pattern: "" }, button_style: "inherit", limit_issue: null },
  custom: { enabled: false, price_per_gb: "1000", price_per_day: "500", min_gb: "1", max_gb: "500", min_days: "1", max_days: "365", template_id: null, group_ids: [], naming: { prefix: "", suffix: "", pattern: "" }, button_style: "inherit", limit_issue: null },
  wholesale: { enabled: false, min_qty: "5", max_qty: "20", button_text: "x", tiers: [] },
  addon_packs: [{ id: 1, name: "ده گیگ", description: "", kind: "volume", amount: 10, price: 5000, sort_order: 0, is_active: true, is_general: true, category_id: null, category_name: null }],
} as unknown as PlansOverview;

const reseller = (over: Partial<ResellerPlanRow>): ResellerPlanRow => ({
  id: 1, group: "fixed", name: "نقره‌ای", description: "", price: 100, plan_kind: "subscription", billing_mode: "fixed", price_per_gb: 0, pg_group_ids: null,
  addon_gb: 0, addon_users: 0, is_system: false, is_active: true, category_id: null, category_name: null, ...over,
});

describe("user plans section", () => {
  it("lists plans, the trial, custom and wholesale rows and the add-on packs, escaping names", () => {
    render(<UserPlansSection data={OVERVIEW} reload={() => undefined} onSetting={() => undefined} onEditPack={() => undefined} onAddPlan={() => undefined} onEditCategory={() => undefined} />);
    expect(screen.getByText(HOSTILE)).toBeTruthy();
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByText("پلن دلخواه")).toBeTruthy();
    expect(screen.getByText("فروش عمده")).toBeTruthy();
    expect(screen.getByText("ده گیگ")).toBeTruthy();
    // Warnings the old rows showed: a deleted template, an incomplete source and an out-of-limit plan.
    expect(screen.getAllByText("منبع ناقص").length).toBeGreaterThan(0);
    expect(screen.getAllByText("خارج از سقف").length).toBeGreaterThan(0);
    expect(screen.getByText("خالی")).toBeTruthy();
  });

  it("asks before bulk actions and posts the selected ids to the existing handler", async () => {
    const user = userEvent.setup();
    render(<UserPlansSection data={OVERVIEW} reload={() => undefined} onSetting={() => undefined} onEditPack={() => undefined} onAddPlan={() => undefined} onEditCategory={() => undefined} />);
    const table = screen.getByRole("grid", { name: "پلن‌های کاربران" });
    // The dialog falls back to the browser confirm in tests.
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const boxes = within(table).getAllByRole("checkbox").slice(1);
    await user.click(boxes[0]);
    await user.click(await screen.findByRole("button", { name: "روشن/خاموش" }));
    await waitFor(() => expect(panelAction).toHaveBeenCalled());
    const [path, fields] = vi.mocked(panelAction).mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/plans/bulk-action");
    expect(fields).toMatchObject({ action: "toggle", ids: ["4"], return_to: "/plans" });
  });
});

describe("reseller plans section", () => {
  it("never lets a system plan be selected, toggled or deleted", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ResellerPlansSection plans={[reseller({ id: 1, name: "ظرفیت فعلی", is_system: true }), reseller({ id: 2, name: "عادی" })]} error={null} reload={() => undefined} />);
    const table = screen.getByRole("grid", { name: "پلن‌های اشتراک ثابت نمایندگان" });
    const boxes = within(table).getAllByRole("checkbox").slice(1);
    expect((boxes[0] as HTMLInputElement).disabled || boxes[0].getAttribute("aria-disabled") === "true").toBe(true);
    await user.click(screen.getByRole("button", { name: "عملیات ظرفیت فعلی" }));
    expect(await screen.findByRole("menuitem", { name: "ویرایش" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "حذف" })).toBeNull();
  });
});
