import { money, num } from "../../core/format";

export type Reward = {
  id: number;
  name: string;
  description: string;
  type: string;
  type_label: string;
  value: number;
  cost: number;
  needs_service: boolean;
  affordable: boolean;
};

export type HistoryEntry = { id: number; amount: number; label: string; created_at: string | null };

export type Discount = {
  code: string;
  percent: number;
  min_purchase: number;
  max_discount: number | null;
  expires_at: string | null;
};

export type Referral = { code: string; link: string; invited: number; earned_points: number };

export type Club = {
  enabled: boolean;
  referral?: Referral;
  points?: number;
  tier?: { name: string; points_to_next: number | null };
  month_points?: number;
  rewards?: Reward[];
  services?: { id: number; name: string }[];
  discounts?: Discount[];
  history?: HistoryEntry[];
  history_more?: boolean;
};

export type RedeemResult = { message?: string; discount_code?: string | null; points?: number };

export const REDEEM_UNKNOWN = "نتیجه مشخص نشد؛ امتیاز و جوایز دوباره خوانده شد.";

export function pointsText(value: unknown): string {
  return `${num(value)} امتیاز`;
}

/** What the reward gives, in words («۵ گیگ ترافیک»). */
export function rewardValueText(reward: Reward): string {
  const value = Number(reward.value) || 0;
  if (reward.type === "traffic_gb") return `${num(value)} گیگ ترافیک`;
  if (reward.type === "time_days") return `${num(value)} روز اعتبار`;
  if (reward.type === "wallet_credit") return `${money(value)} اعتبار کیف پول`;
  if (reward.type === "discount_percent") return `${num(value)}٪ تخفیف`;
  return reward.type_label || "";
}

/** The amount alone («۵ گیگ», «۵۰,۰۰۰ تومان»): the reward's name already says what it is. */
export function rewardAmountText(reward: Reward): string {
  const value = Number(reward.value) || 0;
  if (reward.type === "traffic_gb") return `${num(value)} گیگ`;
  if (reward.type === "time_days") return `${num(value)} روز`;
  if (reward.type === "wallet_credit") return money(value);
  if (reward.type === "discount_percent") return `${num(value)}٪`;
  return reward.type_label || "";
}

const REWARD_ICONS: Record<string, string> = {
  traffic_gb: "solar:chart-2-bold",
  time_days: "solar:clock-circle-bold",
  wallet_credit: "solar:wallet-bold",
  discount_percent: "solar:sale-bold",
};

export function rewardIcon(type: string): string {
  return REWARD_ICONS[type] ?? "solar:gift-bold";
}
