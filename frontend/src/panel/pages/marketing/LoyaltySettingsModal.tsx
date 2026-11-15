"use client";

import { Modal, Tabs } from "@heroui/react";
import { useState } from "react";

import { IconTile } from "@/components/ui/IconTile";

import { run, usePending } from "../../core/actions";
import { useJson } from "../../core/data";
import { TextInput, SwitchInput, TextAreaInput } from "../../ui/Fields";
import { Loadable } from "../../ui/States";
import { EditorCard, EditorForm } from "./editor";
import { LoyaltyRewards } from "./LoyaltyRewards";
import { LoyaltyRules } from "./LoyaltyRules";
import { LoyaltyTiers } from "./LoyaltyTiers";
import { LoyaltyWheel } from "./LoyaltyWheel";
import type { LoyaltyOverview, LoyaltySettings } from "./types";

export const SETTINGS_TABS = ["club", "referral", "rules", "rewards", "wheel", "tiers"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** The tab a ?settings= value opens: unknown or hidden values open the club tab. */
export function settingsTabFor(value: string, hasReferral: boolean): SettingsTab {
  const known = SETTINGS_TABS.find((tab) => tab === value);
  if (!known || (known === "referral" && !hasReferral)) return "club";
  return known;
}

const TAB_LABELS: Record<SettingsTab, string> = {
  club: "باشگاه",
  referral: "معرف و دعوت",
  rules: "قوانین امتیاز",
  rewards: "جوایز",
  wheel: "چرخ شانس",
  tiers: "سطوح",
};

function ClubForm({ club, pageTab, refresh }: { club: LoyaltyOverview["club"]; pageTab: string; refresh: () => void }) {
  const [enabled, setEnabled] = useState(club.enabled);
  const [rate, setRate] = useState(club.wallet_rate);
  const { pending, track } = usePending();
  const save = () =>
    track(() =>
      run("/loyalty/settings", { loyalty_enabled: enabled, points_to_wallet_rate: rate, next_tab: pageTab }, { success: "تنظیمات ذخیره شد.", refresh }),
    );
  return (
    <EditorCard title="باشگاه مشتریان">
      <EditorForm onSubmit={() => void save()} pending={pending} submitLabel="ذخیره تنظیمات">
        <SwitchInput
          label="فعال بودن سیستم امتیاز"
          help="با خاموش کردن، امتیاز جدید صادر نمی‌شود و فروشگاه جوایز در ربات مخفی می‌ماند."
          checked={enabled}
          onChange={setEnabled}
        />
        <TextInput type="number"
          label="نرخ تبدیل امتیاز به کیف پول (تومان به‌ازای هر امتیاز)"
          value={rate}
          onChange={setRate}
          min={0}
          help="مرجع جوایز نوع کیف‌پول. پاداش کیف‌پولی دعوت (referral_bonus) در تنظیمات مالی جداست."
        />
      </EditorForm>
    </EditorCard>
  );
}

function ReferralForm({ referral, refresh }: { referral: NonNullable<LoyaltySettings["referral"]>; refresh: () => void }) {
  const [values, setValues] = useState(() => Object.fromEntries(referral.fields.map((field) => [field.name, field.value])));
  const { pending, track } = usePending();
  const save = () => track(() => run(referral.action, values, { success: "تنظیمات ذخیره شد.", refresh }));
  return (
    <EditorCard title="متن دعوت دوستان">
      <EditorForm onSubmit={() => void save()} pending={pending} submitLabel="ذخیره تنظیمات">
        {referral.fields.map((field) => {
          const change = (next: string) => setValues((prev) => ({ ...prev, [field.name]: next }));
          return field.kind === "textarea" ? (
            <TextAreaInput key={field.name} label={field.label} value={values[field.name] ?? ""} onChange={change} rows={5} help={field.help} />
          ) : (
            <TextInput key={field.name} label={field.label} value={values[field.name] ?? ""} onChange={change} help={field.help} />
          );
        })}
      </EditorForm>
    </EditorCard>
  );
}

function SettingsBody({
  tab,
  overview,
  pageTab,
  refreshAll,
}: {
  tab: SettingsTab;
  overview: LoyaltyOverview;
  pageTab: string;
  refreshAll: () => void;
}) {
  // The editors' data is read only while the dialog is open (the club tab needs none).
  const resource = useJson<LoyaltySettings>(tab === "club" ? null : "/api/panel/marketing/loyalty/settings");
  const refresh = () => {
    resource.reload();
    refreshAll();
  };
  if (tab === "club") return <ClubForm club={overview.club} pageTab={pageTab} refresh={refresh} />;
  return (
    <Loadable state={resource} rows={4}>
      {(data) => {
        if (tab === "referral" && data.referral) return <ReferralForm referral={data.referral} refresh={refresh} />;
        if (tab === "rules") return <LoyaltyRules rules={data.rules} refresh={refresh} />;
        if (tab === "rewards") return <LoyaltyRewards rewards={data.rewards} types={data.reward_types} refresh={refresh} />;
        if (tab === "wheel") return <LoyaltyWheel wheel={data.wheel} refresh={refresh} />;
        if (tab === "tiers") return <LoyaltyTiers tiers={data.tiers} canEdit={data.is_platform_admin} refresh={refresh} />;
        return null;
      }}
    </Loadable>
  );
}

/** The old «تنظیمات باشگاه مشتریان» dialog: club switch, invite text, rules, rewards, wheel and tiers. */
export function LoyaltySettingsModal({
  isOpen,
  tab,
  pageTab,
  overview,
  onTab,
  onClose,
  refreshAll,
}: {
  isOpen: boolean;
  tab: SettingsTab;
  pageTab: string;
  overview: LoyaltyOverview;
  onTab: (tab: SettingsTab) => void;
  onClose: () => void;
  refreshAll: () => void;
}) {
  const tabs = visibleTabs(overview.can_edit_referral_text);
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()} variant="blur">
      <Modal.Container size="lg" scroll="inside">
        <Modal.Dialog className="sm:max-w-[960px]" aria-label="تنظیمات باشگاه مشتریان">
          <Modal.CloseTrigger aria-label="بستن" />
          <Modal.Header className="flex-row items-center gap-3">
            <IconTile icon="solar:cup-star-bold" tone="purple" size="lg" />
            <div className="flex flex-col">
              <Modal.Heading>تنظیمات باشگاه مشتریان</Modal.Heading>
              <p className="text-sm text-muted">امتیاز، دعوت، جوایز و چرخ شانس</p>
            </div>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-4">
            <Tabs selectedKey={tab} onSelectionChange={(key) => onTab(settingsTabFor(String(key), overview.can_edit_referral_text))}>
              <Tabs.ListContainer>
                <Tabs.List aria-label="تب‌های تنظیمات باشگاه">
                  {tabs.map((id) => (
                    <Tabs.Tab key={id} id={id}>
                      {TAB_LABELS[id]}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
            {isOpen ? <SettingsBody key={tab} tab={tab} overview={overview} pageTab={pageTab} refreshAll={refreshAll} /> : null}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function visibleTabs(hasReferral: boolean): SettingsTab[] {
  return SETTINGS_TABS.filter((tab) => tab !== "referral" || hasReferral);
}
