/** Shapes of `GET /api/panel/resellers/children-pricing` (app/api/child_pricing_pages.py). */

export type PaygBasis = "traffic" | "user" | "user_traffic";

export type ChildPlan = {
  id: number;
  name: string;
  payg_basis: PaygBasis;
  price_per_gb: number;
  payg_user_price: number;
  payg_user_price_per_30d: boolean;
  /** `null` forbids unlimited users on this price list. */
  payg_unlimited_price: number | null;
};

export type ChildShop = {
  shop_id: number;
  label: string;
  /** The assigned price list, or `null` for the owner's package. */
  plan_id: number | null;
  credit_limit: number;
};

export type ChildPricingData = {
  plans: ChildPlan[];
  children: ChildShop[];
  free_credit: number;
  plan_limit: number;
};

/** The reseller list says whether its viewer may open the pricing page (a level-1 shop). */
export type ChildPricingLink = { can_price_children?: boolean };
