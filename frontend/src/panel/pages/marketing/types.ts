/** Shapes of the marketing JSON endpoints (app/api/panel_marketing_api.py). */

export type MarketingSection = { key: string; label: string; href: string };

export type TopReferrer = { label: string; count: number };

export type LoyaltyOverview = {
  sections: MarketingSection[];
  metrics: {
    total_referrals: number;
    qualified_referrals: number;
    points_issued: number;
    points_redeemed: number;
    wallet_credits_issued: number;
    active_rewards: number;
    top_referrers: TopReferrer[];
  };
  wheel: { wheel_enabled: boolean; active_prizes: number; total_spins: number; spin_cost: number };
  club: { enabled: boolean; wallet_rate: string };
  adjust: {
    platform: { allowed: boolean; nonce: string };
    shop: { allowed: boolean; nonce: string; max_points: number; daily_points: number };
  };
  is_platform_admin: boolean;
  can_edit_referral_text: boolean;
};

export type PointsTransaction = {
  id: number;
  user_label: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string | null;
};

export type PointsRule = {
  id: number;
  event_label: string;
  name: string;
  amount_mode: string;
  amount: number;
  max_reward: number | null;
  min_purchase_toman: number;
  min_purchase_gb: number;
  cooldown_hours: number;
  enabled: boolean;
  first_time_only: boolean;
};

export type Reward = {
  id: number;
  name: string;
  description: string;
  reward_type: string;
  type_label: string;
  reward_value: number;
  points_cost: number;
  sort_order: number;
  enabled: boolean;
  redemption_count: number;
  max_redemptions_global: number | null;
  max_redemptions_per_user: number | null;
  min_purchase_toman: number;
  max_discount_toman: number | null;
  expires_days: number | null;
};

export type Tier = {
  id: number;
  name: string;
  min_points: number;
  max_points: number | null;
  multiplier_bps: number;
  enabled: boolean;
};

export type Option = { value: string; label: string };

export type WheelPrize = {
  id: number;
  label: string;
  prize_type: string;
  type_label: string;
  prize_value: number;
  weight: number;
  sort_order: number;
  enabled: boolean;
  win_count: number;
  max_wins_global: number | null;
  max_wins_per_user: number | null;
  min_purchase_toman: number;
  max_discount_toman: number | null;
  expires_days: number | null;
};

export type WheelSpin = {
  id: number;
  user_label: string;
  prize_label: string;
  type_label: string;
  cost_points: number;
  used_free_spin: boolean;
  status: string;
};

export type WheelSettings = {
  degraded: boolean;
  enabled: boolean;
  spin_cost: number;
  daily_limit: number;
  cooldown_seconds: number;
  free_spins_daily: number;
  submenu_active: string[];
  submenu_hidden: string[];
  submenu_labels: Record<string, string>;
  prizes: WheelPrize[];
  spins: WheelSpin[];
  prize_types: Option[];
};

export type ReferralField = { name: string; label: string; kind: "text" | "textarea"; help: string; value: string };

export type LoyaltySettings = {
  rules: PointsRule[];
  rewards: Reward[];
  reward_types: Option[];
  tiers: Tier[];
  wheel: WheelSettings;
  referral: { action: string; fields: ReferralField[] } | null;
  is_platform_admin: boolean;
};

export type CampaignRow = {
  id: number;
  audience_title: string;
  status: string;
  status_label: string;
  text: string;
  progress: { status: string; label: string; count: number }[];
  has_review: boolean;
  can_control: boolean;
};

export type CampaignsData = {
  sections: MarketingSection[];
  audiences: Option[];
  audience: string;
  days: number;
  count: number;
  limit: number;
  campaigns: CampaignRow[];
};

export type FunnelData = {
  sections: MarketingSection[];
  days: number;
  counts: { shop_open: number; plan_view: number; pay_start: number; receipt: number; delivered: number };
};

export type BroadcastRow = {
  id: number;
  created_at: string | null;
  audience_label: string;
  text_snippet: string;
  text_truncated: boolean;
  total: number;
  ok_count: number;
  fail_count: number;
  review_count: number;
  status: string;
  status_label: string;
  created_by: string;
  is_active: boolean;
};

export type BroadcastData = { sections: MarketingSection[]; history: BroadcastRow[] };
