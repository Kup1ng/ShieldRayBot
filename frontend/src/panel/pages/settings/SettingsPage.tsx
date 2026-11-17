"use client";

import { Tabs } from "@heroui/react";
import { useState, type ReactNode } from "react";

import { useJson, useQuery, useUrlFlash } from "../../core/data";
import { PanelShell } from "../../layout/PanelShell";
import { PageHeader } from "../../ui/Page";
import { ErrorBlock, LoadingBlock } from "../../ui/States";
import { SYSTEM_TAB_VIEWS } from "../system";
import { AppearanceTab } from "./AppearanceTab";
import { BotTab } from "./BotTab";
import { ColorsTab } from "./ColorsTab";
import { DailyReportTab } from "./DailyReportTab";
import { GenericTab } from "./GenericTab";
import { LinksTab } from "./LinksTab";
import { MenuTab } from "./MenuTab";
import { MiniappTab } from "./MiniappTab";
import { NotificationsTab } from "./NotificationsTab";
import type { AppearanceExtra, BotExtra, ColorsExtra, DailyReportExtra, LinksExtra, MenuExtra, MiniappExtra, NotificationsExtra, SettingsNav, TabData } from "./types";

const DEFAULT_TAB = "welcome";
/** The web-panel tabs (app/services/users.py PANEL_SETTINGS_TABS); their views load their own data. */
const PANEL_TABS = [
  { key: "general", label: "عمومی" },
  { key: "backup", label: "بکاپ" },
  { key: "pwa", label: "ظاهر و برند" },
  { key: "ssl", label: "دامنه‌ها" },
  { key: "update", label: "آپدیت" },
];
const PANEL_TAB_KEYS = new Set(PANEL_TABS.map((tab) => tab.key));
const SECURITY_HREF = "/security";

/** Counts up whenever the server sent a new answer, so a tab's form starts over from what was saved. */
function useVersion(value: unknown): number {
  const [state, setState] = useState({ seen: value, version: 0 });
  if (state.seen !== value) setState({ seen: value, version: state.version + 1 });
  return state.version;
}

function PanelNav({ active, onSelect }: { active: string; onSelect: (tab: string) => void }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <div className="min-w-0 overflow-x-auto">
        <Tabs selectedKey={active} onSelectionChange={(key) => onSelect(String(key))}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="تب‌های تنظیمات وب پنل">
              {PANEL_TABS.map((tab) => (
                <Tabs.Tab key={tab.key} id={tab.key}>
                  {tab.label}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>
      <a href={SECURITY_HREF} className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/75 outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-focus">
        امنیت
      </a>
    </div>
  );
}

function BotNav({ nav, active, onSelect }: { nav: SettingsNav; active: string; onSelect: (key: string, href: string | null) => void }) {
  const group = nav.groups.find((item) => item.is_active) ?? nav.groups[0];
  if (!group) return null;
  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="overflow-x-auto">
        <Tabs
          selectedKey={group.key}
          onSelectionChange={(key) => {
            const next = nav.groups.find((item) => item.key === String(key));
            if (next && next.tabs[0]) onSelect(next.tabs[0].key, next.tabs[0].href);
          }}
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="تب‌های تنظیمات ربات">
              {nav.groups.map((item) => (
                <Tabs.Tab key={item.key} id={item.key}>
                  {item.label}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>
      {group.tabs.length > 1 ? (
        <div className="overflow-x-auto">
          <Tabs
            variant="secondary"
            selectedKey={active}
            onSelectionChange={(key) => {
              const next = group.tabs.find((item) => item.key === String(key));
              if (next) onSelect(next.key, next.href);
            }}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label={group.label}>
                {group.tabs.map((item) => (
                  <Tabs.Tab key={item.key} id={item.key}>
                    {item.label}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </div>
      ) : null}
    </div>
  );
}

function BotTabView({ data, reload }: { data: TabData; reload: () => void }) {
  switch (data.tab) {
    case "appearance":
      return <AppearanceTab data={data as TabData<AppearanceExtra>} reload={reload} />;
    case "colors":
      return <ColorsTab data={data as TabData<ColorsExtra>} reload={reload} />;
    case "menu":
      return <MenuTab data={data as TabData<MenuExtra>} reload={reload} />;
    case "miniapp":
      return <MiniappTab data={data as TabData<MiniappExtra>} reload={reload} />;
    case "links":
      return <LinksTab data={data as TabData<LinksExtra>} reload={reload} />;
    case "notifications":
      return <NotificationsTab data={data as TabData<NotificationsExtra>} reload={reload} />;
    case "daily_report":
      return <DailyReportTab data={data as TabData<DailyReportExtra>} reload={reload} />;
    case "bot":
      return <BotTab data={data as TabData<BotExtra>} reload={reload} />;
    default:
      return <GenericTab data={data} reload={reload} />;
  }
}

function Frame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <>
      <PageHeader icon="solar:settings-bold" tone="purple" title={title} description={description} />
      {children}
    </>
  );
}

function PanelSettings({ tab, goTab }: { tab: string; goTab: (tab: string) => void }) {
  const View = SYSTEM_TAB_VIEWS[tab];
  return (
    <Frame title="تنظیمات وب پنل" description="دامنه، بکاپ، ظاهر و برند، آپدیت و اتصال پنل">
      <PanelNav active={tab} onSelect={goTab} />
      {View ? <View key={tab} /> : <LoadingBlock rows={4} />}
    </Frame>
  );
}

function BotSettings({ tab, goTab }: { tab: string; goTab: (tab: string, href: string | null) => void }) {
  const resource = useJson<TabData>(`/api/panel/settings?tab=${encodeURIComponent(tab)}`, { keepPrevious: true });
  const version = useVersion(resource.data);
  const data = resource.data;
  return (
    <Frame title="تنظیمات ربات" description="متن‌ها، دکمه‌ها، منو، رنگ‌ها، مینی‌اپ و اتصال ربات تلگرام">
      {data ? <BotNav nav={data.nav} active={data.tab} onSelect={goTab} /> : null}
      {resource.status === "error" ? (
        <div className="mb-4">
          <ErrorBlock message={resource.message} onRetry={resource.reload} />
        </div>
      ) : null}
      {data ? (
        <div aria-busy={resource.status === "loading"} className={resource.status === "loading" && data.tab !== tab ? "opacity-60" : ""}>
          <BotTabView key={`${data.tab}-${version}`} data={data} reload={resource.reload} />
        </div>
      ) : resource.status === "loading" ? (
        <LoadingBlock rows={6} />
      ) : null}
    </Frame>
  );
}

function SettingsFrame() {
  useUrlFlash();
  const query = useQuery();
  const tab = query.get("tab") || DEFAULT_TAB;
  const goBot = (key: string, href: string | null) => {
    if (href) window.location.assign(href);
    else query.set({ tab: key });
  };
  if (PANEL_TAB_KEYS.has(tab)) return <PanelSettings tab={tab} goTab={(next) => query.set({ tab: next })} />;
  return <BotSettings tab={tab} goTab={goBot} />;
}

export function SettingsPage() {
  return (
    <PanelShell title="تنظیمات">
      <SettingsFrame />
    </PanelShell>
  );
}
