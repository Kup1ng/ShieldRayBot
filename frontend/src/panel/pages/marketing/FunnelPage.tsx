"use client";

import { useJson } from "../../core/data";
import { fa } from "../../core/format";
import { Loadable } from "../../ui/States";
import { PanelShell } from "../../layout/PanelShell";
import { GlassSection, PageHeader, StatTile } from "../../ui/Page";
import type { TileTone } from "@/components/ui/IconTile";

import { MarketingStrip } from "./sections";
import type { FunnelData } from "./types";

type Step = { key: keyof FunnelData["counts"]; label: string; icon: string; tone: TileTone };

const STEPS: Step[] = [
  { key: "shop_open", label: "فروشگاه", icon: "solar:bag-4-bold", tone: "blue" },
  { key: "plan_view", label: "پلن", icon: "solar:box-bold", tone: "purple" },
  { key: "pay_start", label: "پرداخت", icon: "solar:wallet-bold", tone: "yellow" },
  { key: "receipt", label: "رسید", icon: "solar:bill-list-bold", tone: "orange" },
  { key: "delivered", label: "تحویل", icon: "solar:check-circle-bold", tone: "green" },
];

function FunnelBody() {
  const resource = useJson<FunnelData>("/api/panel/marketing/funnel");
  return (
    <Loadable state={resource} rows={2}>
      {(data) => (
        <>
          <MarketingStrip sections={data.sections} />
          <GlassSection title="رفتار کاربر" description={`${fa(data.days)} روز اخیر — از باز کردن فروشگاه تا تحویل`}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((step) => (
                <StatTile key={step.key} icon={step.icon} tone={step.tone} label={step.label} value={fa(data.counts[step.key])} />
              ))}
            </div>
          </GlassSection>
        </>
      )}
    </Loadable>
  );
}

export function FunnelPage() {
  return (
    <PanelShell title="رفتار کاربر">
      <PageHeader icon="solar:routing-2-bold" title="رفتار کاربر" description="مسیر مشتری‌ها در ۷ روز اخیر، از باز کردن فروشگاه تا تحویل سرویس" />
      <FunnelBody />
    </PanelShell>
  );
}
