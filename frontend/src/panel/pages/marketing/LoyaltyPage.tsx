"use client";

import { Button } from "@heroui/react";

import { Icon } from "@/icons/Icon";

import { useJson, useQuery, useUrlFlash } from "../../core/data";
import { Loadable } from "../../ui/States";
import { PanelShell } from "../../layout/PanelShell";
import { PageHeader } from "../../ui/Page";
import { LoyaltyOverviewTab } from "./LoyaltyOverviewTab";
import { LoyaltySettingsModal, settingsTabFor } from "./LoyaltySettingsModal";
import { LoyaltyTransactionsTab } from "./LoyaltyTransactionsTab";
import { MarketingStrip } from "./sections";
import type { LoyaltyOverview } from "./types";

/** ?settings= values that open the settings dialog (the old page's list). */
const OPENING_VALUES = new Set(["1", "true", "yes", "club", "referral", "rules", "rewards", "tiers", "wheel"]);

function LoyaltyBody() {
  const query = useQuery();
  useUrlFlash();
  const overview = useJson<LoyaltyOverview>("/api/panel/marketing/loyalty");
  const pageTab = query.get("tab") === "transactions" ? "transactions" : "overview";
  const settingsValue = query.get("settings");
  const open = OPENING_VALUES.has(settingsValue);

  return (
    <>
      <PageHeader
        icon="solar:cup-star-bold"
        title="باشگاه مشتریان"
        description="امتیاز، دعوت دوستان، جوایز و چرخ شانس مشتریان فروشگاه"
        actions={
          <Button variant="secondary" className="!h-12 !rounded-lg px-5 text-sm" onPress={() => query.set({ settings: "1" })}>
            <Icon name="solar:settings-linear" size={20} />
            تنظیمات
          </Button>
        }
      />
      <Loadable state={overview} rows={4}>
        {(data) => (
          <>
            <MarketingStrip sections={data.sections} />
            {pageTab === "transactions" ? (
              <LoyaltyTransactionsTab adjust={data.adjust} refreshOverview={overview.reload} />
            ) : (
              <LoyaltyOverviewTab overview={data} />
            )}
            <LoyaltySettingsModal
              isOpen={open}
              tab={settingsTabFor(settingsValue, data.can_edit_referral_text)}
              pageTab={pageTab}
              overview={data}
              onTab={(tab) => query.set({ settings: tab })}
              onClose={() => query.set({ settings: null })}
              refreshAll={overview.reload}
            />
          </>
        )}
      </Loadable>
    </>
  );
}

export function LoyaltyPage() {
  return (
    <PanelShell title="باشگاه مشتریان">
      <LoyaltyBody />
    </PanelShell>
  );
}
