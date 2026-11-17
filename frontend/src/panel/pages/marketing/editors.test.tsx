import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const panelAction = vi.fn();
vi.mock("../../core/api", async (importOriginal) => ({ ...(await importOriginal<object>()), panelAction: (...args: unknown[]) => panelAction(...args) }));

import { LoyaltyRewards } from "./LoyaltyRewards";
import { LoyaltyRules } from "./LoyaltyRules";
import { LoyaltyTiers } from "./LoyaltyTiers";
import { LoyaltyWheel } from "./LoyaltyWheel";
import type { PointsRule, Reward, Tier, WheelSettings } from "./types";

const RULE: PointsRule = {
  id: 7,
  event_label: "خرید موفق",
  name: "خرید",
  amount_mode: "per_gb",
  amount: 2,
  max_reward: null,
  min_purchase_toman: 0,
  min_purchase_gb: 0,
  cooldown_hours: 0,
  enabled: true,
  first_time_only: false,
};

const REWARD: Reward = {
  id: 3,
  name: "تخفیف",
  description: "",
  reward_type: "discount_percent",
  type_label: "تخفیف درصدی",
  reward_value: 10,
  points_cost: 50,
  sort_order: 100,
  enabled: true,
  redemption_count: 4,
  max_redemptions_global: null,
  max_redemptions_per_user: 2,
  min_purchase_toman: 1000,
  max_discount_toman: null,
  expires_days: 30,
};

const WHEEL: WheelSettings = {
  degraded: false,
  enabled: true,
  spin_cost: 10,
  daily_limit: 3,
  cooldown_seconds: 0,
  free_spins_daily: 0,
  submenu_active: ["loy_points", "loy_rewards"],
  submenu_hidden: ["loy_wheel"],
  submenu_labels: { loy_points: "امتیاز من", loy_rewards: "جوایز", loy_wheel: "چرخ شانس" },
  prizes: [],
  spins: [],
  prize_types: [{ value: "points", label: "امتیاز" }],
};

beforeEach(() => {
  panelAction.mockReset();
  panelAction.mockResolvedValue({ ok: true, message: "ذخیره شد." });
});

describe("loyalty editors post the old forms' fields", () => {
  it("saves a rule with the old field names and checkbox semantics", async () => {
    const refresh = vi.fn();
    render(<LoyaltyRules rules={[RULE]} refresh={refresh} />);
    fireEvent.click(screen.getByRole("button", { name: "ذخیره قانون" }));
    await waitFor(() => expect(panelAction).toHaveBeenCalledTimes(1));
    const [path, fields] = panelAction.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/loyalty/rules/7/save");
    expect(Object.keys(fields).sort()).toEqual(
      ["amount", "amount_mode", "cooldown_hours", "enabled", "first_time_only", "max_reward", "min_purchase_gb", "min_purchase_toman", "name"].sort(),
    );
    expect(fields.amount_mode).toBe("per_gb");
    expect(fields.enabled).toBe(true);
    expect(fields.first_time_only).toBe(false);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the discount-only fields of a percentage reward and posts them", async () => {
    render(<LoyaltyRewards rewards={[REWARD]} types={[{ value: "discount_percent", label: "تخفیف درصدی" }]} refresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    await waitFor(() => expect(panelAction).toHaveBeenCalled());
    const [path, fields] = panelAction.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/loyalty/rewards/3/save");
    expect(fields).toMatchObject({ reward_value: "10", points_cost: "50", max_redemptions_per_user: "2", min_purchase_toman: "1000", expires_days: "30", max_discount_toman: "" });
  });

  it("reads a tier as plain text for staff who may not edit it", () => {
    const tier: Tier = { id: 1, name: "طلایی", min_points: 100, max_points: null, multiplier_bps: 15000, enabled: true };
    render(<LoyaltyTiers tiers={[tier]} canEdit={false} refresh={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "ذخیره سطح" })).toBeNull();
    expect(screen.getByText("طلایی")).toBeTruthy();
  });

  it("saves the wheel settings with the submenu order of the buttons left active", async () => {
    render(<LoyaltyWheel wheel={WHEEL} refresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "پنهان کردن امتیاز من" }));
    fireEvent.click(screen.getByRole("button", { name: "ذخیره تنظیمات چرخ" }));
    await waitFor(() => expect(panelAction).toHaveBeenCalled());
    const [path, fields] = panelAction.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/loyalty/wheel/settings");
    expect(fields.loyalty_submenu_order).toBe("loy_rewards");
    expect(fields.lucky_wheel_enabled).toBe(true);
    expect(fields.lucky_wheel_spin_cost_points).toBe("10");
  });
});
