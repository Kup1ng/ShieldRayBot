"use client";

import { Chip } from "@heroui/react";

import { SectionBadge } from "@/components/ui/SectionBadge";

import { money, num } from "../../core/format";
import { invalidateResource, useResource } from "../../state/resources";
import { useMini } from "../../state/store";
import { Settled } from "../../ui/ScreenState";
import { AttentionList, PanelShortcuts, RESELLER_STATS, type OpsData } from "./opsKit";
import { Block, HeroCard, StatGrid } from "./parts";

/** Shop hero: revenue, bot state and, for pay-as-you-go shops, the credit left. */
function ShopHero({ ops }: { ops: OpsData }) {
  const shop = ops.shop ?? {};
  const billing = shop.billing;
  return (
    <HeroCard label="درآمد فروشگاه" chip={shop.active ? "ربات فعال" : "ربات غیرفعال"} value={money(ops.stats?.revenue)} ariaLabel="فروشگاه من">
      {billing ? (
        <span>
          اعتبار فروشگاه (پرداخت به‌ازای مصرف): <bdi className="num font-semibold">{money(billing.balance)}</bdi>
          {billing.suspended ? <strong>، مسدود</strong> : null}
        </span>
      ) : null}
    </HeroCard>
  );
}

function ResellerOps({ ops }: { ops: OpsData }) {
  const { go, openPanelPath } = useMini();
  return (
    <>
      <ShopHero ops={ops} />
      <Block title="نیاز به اقدام" icon="solar:bell-bold" tone="yellow">
        <AttentionList ops={ops} onGo={(view) => go(view)} onPanel={openPanelPath} />
      </Block>
      <Block title="میانبرها" icon="solar:widget-bold" tone="blue">
        <PanelShortcuts ops={ops} onGo={(view) => go(view)} onPanel={openPanelPath} />
      </Block>
      <Block title="آمار فروشگاه" icon="solar:chart-2-bold" tone="teal">
        <StatGrid stats={ops.stats ?? {}} specs={RESELLER_STATS} format={num} />
      </Block>
    </>
  );
}

/** Admin «میانبرها» (receipt review and web-panel links) or the reseller's «فروشگاه من». */
export function OpsScreen() {
  const { persona, go, openPanelPath } = useMini();
  const ops = useResource<OpsData>("ops");
  const reseller = persona === "reseller";
  const botName = ops.status === "ready" ? String(ops.data.shop?.bot_username || "") : "";
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionBadge icon={reseller ? "solar:shop-bold" : "solar:widget-bold"} title={reseller ? "فروشگاه من" : "میانبرها"} />
        {reseller && botName ? (
          <Chip size="sm" variant="soft" color="accent">
            <Chip.Label>
              <bdi className="ltr">@{botName}</bdi>
            </Chip.Label>
          </Chip>
        ) : null}
      </div>
      <Settled resource={ops} rows={4} onRetry={() => invalidateResource("ops")}>
        {(data) =>
          reseller ? (
            <ResellerOps ops={data} />
          ) : (
            <Block title="عملیات و پنل وب" icon="solar:widget-bold" tone="blue">
              <PanelShortcuts ops={data} onGo={(view) => go(view)} onPanel={openPanelPath} />
            </Block>
          )
        }
      </Settled>
    </>
  );
}
