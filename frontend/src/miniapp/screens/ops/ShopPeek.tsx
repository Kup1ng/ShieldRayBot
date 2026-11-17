"use client";

import { Button } from "@heroui/react";

import { num } from "../../core/format";
import { invalidateResource, useResource } from "../../state/resources";
import { useMini } from "../../state/store";
import { Settled } from "../../ui/ScreenState";
import { SHOP_PEEK_STATS, type OpsData } from "./opsKit";
import { Block, StatGrid } from "./parts";

/** A reseller's shop numbers on the home screen, with a way into the full shop screen. */
export function ShopPeek() {
  const { go } = useMini();
  const ops = useResource<OpsData>("ops");
  return (
    <Block
      title="فروشگاه من"
      icon="solar:shop-bold"
      tone="purple"
      action={
        <Button size="sm" variant="ghost" onPress={() => go("ops")}>
          بیشتر
        </Button>
      }
    >
      <Settled resource={ops} rows={1} onRetry={() => invalidateResource("ops")}>
        {(data) => <StatGrid stats={data.stats ?? {}} specs={SHOP_PEEK_STATS} format={num} />}
      </Settled>
    </Block>
  );
}
