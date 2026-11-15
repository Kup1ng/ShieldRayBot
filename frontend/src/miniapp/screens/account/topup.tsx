import { parseAmount } from "../../core/format";
import { invalidateResource } from "../../state/resources";
import type { MiniContextValue } from "../../state/store";
import type { TopupOptions } from "./types";

const CUSTOM = "custom";

/** Route follow-up that tells the account screen to show the top-up flow instead of the wallet. */
export const TOPUP_STEP = "topup";

/** The amount the form asks for, or null when it is outside the shop's bounds. */
export function topupAmount(preset: string, custom: string, options: Pick<TopupOptions, "min_amount" | "max_amount">): number | null {
  const amount = preset === CUSTOM ? parseAmount(custom) : Number(preset);
  if (!amount || !Number.isInteger(amount) || amount < options.min_amount || amount > options.max_amount) return null;
  return amount;
}

/** Opens the full-page top-up flow (fresh methods and limits every time). */
export function openTopup(mini: MiniContextValue): void {
  if (!mini.commerce) return;
  invalidateResource("topup");
  mini.go("account", { then: TOPUP_STEP });
}
