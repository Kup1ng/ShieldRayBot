"use client";

import { useMini } from "../../state/store";
import { RowButton } from "../ops/parts";

/**
 * The way into «اشتراک نمایندگی»: only for a shop owner in the platform Mini App (the server
 * refuses these routes in a shop's Mini App and for everyone else, and `viewAllowed` agrees).
 */
export function SubscriptionLink() {
  const { persona, commerce, me, go } = useMini();
  if (persona !== "reseller" || !commerce || me.shop) return null;
  return (
    <RowButton
      icon="solar:shop-bold"
      tone="teal"
      title="اشتراک نمایندگی"
      subtitle="ظرفیت، زمان باقی‌مانده، تمدید و خرید بسته"
      onPress={() => go("subscription")}
    />
  );
}
