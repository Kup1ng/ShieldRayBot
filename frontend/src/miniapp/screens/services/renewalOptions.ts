/** Shape of GET /api/mini/service/{id}/renewal-options (see app/api/miniapp_renewal.py). */
import type { Plan } from "../shop/types";

/** How a plan compares to the service's own plan, as the bot labels it. */
export type RenewRelation = "current" | "upgrade" | "downgrade";

export type RenewPlan = Plan & { relation?: RenewRelation | null };

export type RenewCategory = { id: number; name: string; /** The admin's text about the category ("" when none); plain text. */ description?: string; plans: RenewPlan[] };

export type RenewalOptions = {
  wallet_pay_enabled: boolean;
  /** With shop categories: the current plan, the categories and «سایر»; otherwise one flat list. */
  grouped: boolean;
  current: RenewPlan | null;
  categories: RenewCategory[];
  other: RenewPlan[];
  plans: RenewPlan[];
};

/** The key of the «سایر» group (plans without a category). */
export const OTHER_KEY = "other";
export const OTHER_NAME = "سایر";

export type CategoryGroup = { key: string; name: string; description?: string; plans: RenewPlan[] };

/** The categories that list a renewable plan, then «سایر» when some plans have no category. */
export function categoryGroups(options: RenewalOptions): CategoryGroup[] {
  const groups: CategoryGroup[] = (options.categories ?? [])
    .filter((c) => (c.plans ?? []).length > 0)
    .map((c) => ({ key: String(Number(c.id) || 0), name: c.name, description: c.description, plans: c.plans }));
  if ((options.other ?? []).length) groups.push({ key: OTHER_KEY, name: OTHER_NAME, plans: options.other });
  return groups;
}

export function hasRenewablePlans(options: RenewalOptions): boolean {
  if (!options.grouped) return (options.plans ?? []).length > 0;
  return Boolean(options.current) || categoryGroups(options).length > 0;
}
