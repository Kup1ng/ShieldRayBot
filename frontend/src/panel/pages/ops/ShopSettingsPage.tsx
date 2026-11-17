"use client";

import { useState } from "react";

import { useJson, useQuery, useUrlFlash } from "../../core/data";
import { PanelShell } from "../../layout/PanelShell";
import { EntryApprovalRequests } from "../../settings-ui/EntryApprovalRequests";
import { PageHeader } from "../../ui/Page";
import { Loadable } from "../../ui/States";
import { ShopSettingsForm } from "./settings/ShopSettingsForm";
import { AppearanceTab, DailyReportTab, NotificationsTab } from "./tabs/AlertTabs";
import { BotTab, BrandTab, LinksTab, type TabProps } from "./tabs/ConnectTabs";
import { ServiceImportPanel } from "./tabs/ServiceImportPanel";
import { ColorsTab, MenuTab, MiniappTab } from "./tabs/ShopTabs";
import type { GuidesExtra, NavGroup, ShopSettings } from "./types";

const DEFAULT_TAB = "welcome";

/** The grouped tab strip: a group shows its tabs, a tab on this page switches in place, one with its own page is a link. */
function SettingsNav({ groups, tab, onTab }: { groups: NavGroup[]; tab: string; onTab: (key: string) => void }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const activeGroup = groups.find((group) => group.tabs.some((item) => item.key === tab)) ?? groups[0];
  const current = groups.find((group) => group.key === chosen) ?? activeGroup;
  return (
    <div className="mb-6 flex flex-col gap-2">
      <nav aria-label="بخش‌های تنظیمات فروشگاه" className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface/70 p-1">
        {groups.map((group) => (
          <button
            key={group.key}
            type="button"
            aria-pressed={group === current}
            onClick={() => setChosen(group.key)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-focus ${group === current ? "bg-accent text-accent-foreground" : "text-foreground/75 hover:bg-surface-secondary"}`}
          >
            {group.label}
          </button>
        ))}
      </nav>
      {current ? (
        <nav aria-label="تب‌های تنظیمات فروشگاه" className="flex gap-1 overflow-x-auto">
          {current.tabs.map((item) => {
            const active = item.key === tab;
            const own = item.href.startsWith("/shop-settings");
            return (
              <a
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={(event) => {
                  if (own && !event.metaKey && !event.ctrlKey) {
                    event.preventDefault();
                    setChosen(null);
                    onTab(item.key);
                  }
                }}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-focus ${active ? "bg-surface font-semibold text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

/** A generic settings form, with the live Telegram preview beside it on the tabs that have one. */
function GenericTab({ data, reload }: TabProps) {
  return (
    <ShopSettingsForm
      tab={data.tab}
      sections={data.sections}
      action={`/shop-settings?tab=${encodeURIComponent(data.tab)}`}
      reload={reload}
      shopTitle={data.shop_title}
      styleOptions={data.style_options}
      guides={data.tab === "guides" ? (data.extra as GuidesExtra) : undefined}
      reset={data.reset}
      chatPreview={data.preview}
      before={data.tab === "service_import" ? <ServiceImportPanel /> : data.tab === "limits" ? <EntryApprovalRequests /> : undefined}
    />
  );
}

function TabBody({ data, reload }: TabProps) {
  // A new tab (or a reload after saving) restarts its form from the server's values.
  const key = `${data.tab}:${JSON.stringify(data.sections.map((s) => s.fields.map((f) => f.value)))}:${JSON.stringify(data.extra)}`;
  const props = { data, reload };
  switch (data.tab) {
    case "bot":
      return <BotTab key={key} {...props} />;
    case "brand":
      return <BrandTab key={key} {...props} />;
    case "miniapp":
      return <MiniappTab key={key} {...props} />;
    case "menu":
      return <MenuTab key={key} {...props} />;
    case "colors":
      return <ColorsTab key={key} {...props} />;
    case "links":
      return <LinksTab key={key} {...props} />;
    case "appearance":
      return <AppearanceTab key={key} {...props} />;
    case "notifications":
      return <NotificationsTab key={key} {...props} />;
    case "daily_report":
      return <DailyReportTab key={key} {...props} />;
    default:
      return <GenericTab key={key} {...props} />;
  }
}

function Content() {
  const query = useQuery();
  useUrlFlash();
  const tab = query.get("tab") || DEFAULT_TAB;
  const state = useJson<ShopSettings>(`/api/panel/shop-settings?tab=${encodeURIComponent(tab)}`, { keepPrevious: true });
  return (
    <>
      <PageHeader icon="solar:settings-linear" tone="purple" title="تنظیمات فروشگاه" description="متن‌ها، دکمه‌ها، ظاهر و اتصال ربات فروشگاه شما" />
      <Loadable state={state} rows={6}>
        {(data) => (
          <>
            <SettingsNav groups={data.nav} tab={data.tab} onTab={(key) => query.set({ tab: key })} />
            <TabBody data={data} reload={state.reload} />
          </>
        )}
      </Loadable>
    </>
  );
}

export function ShopSettingsPage() {
  return (
    <PanelShell title="تنظیمات فروشگاه">
      <Content />
    </PanelShell>
  );
}
