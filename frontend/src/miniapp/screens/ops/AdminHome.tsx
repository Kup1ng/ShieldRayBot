"use client";

import { SectionBadge } from "@/components/ui/SectionBadge";

import { money, num } from "../../core/format";
import { invalidateResource, useResource } from "../../state/resources";
import { useMini } from "../../state/store";
import { Settled } from "../../ui/ScreenState";
import { AttentionList, ADMIN_STATS, PanelShortcuts, type OpsData } from "./opsKit";
import { Block, HeroCard, StatGrid } from "./parts";

/** Platform admin home: revenue, what needs action, panel shortcuts and platform totals. */
export function AdminHome() {
  const { go, openPanelPath, brandName } = useMini();
  const ops = useResource<OpsData>("ops");
  return (
    <>
      <SectionBadge icon="solar:widget-bold" title={brandName ? `داشبورد ${brandName}` : "داشبورد"} />
      <Settled resource={ops} rows={4} onRetry={() => invalidateResource("ops")}>
        {(data) => {
          const stats = data.stats ?? {};
          return (
            <>
              <HeroCard label="درآمد پلتفرم" value={money(stats.revenue)}>
                <span>
                  <span className="num">{num(stats.users)}</span> کاربر، <span className="num">{num(stats.resellers)}</span> نماینده
                </span>
              </HeroCard>
              <Block title="نیاز به اقدام" icon="solar:bell-bold" tone="yellow">
                <AttentionList ops={data} onGo={(view) => go(view)} onPanel={openPanelPath} />
              </Block>
              <Block title="میانبرها" icon="solar:widget-bold" tone="blue">
                <PanelShortcuts ops={data} onGo={(view) => go(view)} onPanel={openPanelPath} />
              </Block>
              <Block title="نمای کلی پلتفرم" icon="solar:chart-2-bold" tone="teal">
                <StatGrid stats={stats} specs={ADMIN_STATS} format={num} />
              </Block>
            </>
          );
        }}
      </Settled>
    </>
  );
}
