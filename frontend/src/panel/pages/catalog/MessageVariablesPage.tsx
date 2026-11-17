"use client";

import { Button, toast } from "@heroui/react";

import { Icon } from "@/icons/Icon";

import { useJson } from "../../core/data";
import { PanelShell } from "../../layout/PanelShell";
import { GlassSection, PageHeader } from "../../ui/Page";
import { Loadable } from "../../ui/States";
import { SelectableTable, type Column } from "./Tables";
import type { MessageVariablesData } from "./types";

const COLUMNS: Column[] = [
  { id: "token", label: "متغیر", rowHeader: true },
  { id: "title", label: "عنوان" },
  { id: "example", label: "مثال" },
];

async function copyToken(token: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(token);
    toast.success("کپی شد");
  } catch {
    toast.danger("کپی انجام نشد؛ متن را دستی انتخاب کنید.");
  }
}

/** Two-level settings tabs: the groups, then the tabs of the active group. */
function SettingsTabs({ data }: { data: MessageVariablesData }) {
  const active = data.tab_groups.find((g) => g.is_active);
  return (
    <div className="mb-6 flex flex-col gap-3">
      <nav aria-label={`تب‌های ${data.title}`} className="flex flex-wrap gap-2">
        {data.tab_groups.map((group) => (
          <a
            key={group.key}
            href={group.tabs[0]?.href}
            aria-current={group.is_active ? "true" : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus ${group.is_active ? "bg-accent text-accent-foreground" : "inset-tile text-foreground/80 hover:bg-surface"}`}
          >
            {group.label}
          </a>
        ))}
      </nav>
      {active && active.tabs.length > 1 ? (
        <nav aria-label={active.label} className="flex flex-wrap gap-2">
          {active.tabs.map((tab) => (
            <a
              key={tab.key}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus ${tab.active ? "bg-surface font-semibold text-foreground" : "text-muted hover:text-foreground"}`}
            >
              {tab.label}
            </a>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function VariablesBody({ data }: { data: MessageVariablesData }) {
  return (
    <>
      <SettingsTabs data={data} />
      <nav aria-label="گروه‌های متغیر" className="mb-6 flex flex-wrap gap-2">
        {data.groups.map((group) => (
          <a key={group.domain} href={`#mv-${group.domain}`} className="rounded-full border border-border px-3 py-1 text-sm text-foreground/80 outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus">
            {group.label}
          </a>
        ))}
      </nav>
      <div className="flex flex-col gap-6">
        {data.groups.map((group) => (
          <section key={group.domain} id={`mv-${group.domain}`} className="scroll-mt-24">
            <GlassSection
              title={group.label}
              actions={
                <Button size="sm" variant="secondary" onPress={() => window.location.assign(group.settings_href)}>
                  <Icon name="solar:settings-bold" size={16} />
                  تنظیمات
                </Button>
              }
            >
              <SelectableTable
                ariaLabel={`متغیرهای ${group.label}`}
                columns={COLUMNS}
                rows={group.vars}
                rowId={(v) => group.vars.indexOf(v)}
                empty="متغیری نیست."
                cells={(v) => [
                  <span key="t" className="flex flex-wrap items-center gap-2">
                    <code dir="ltr" className="rounded bg-surface-secondary px-2 py-1 font-mono text-sm">{v.token}</code>
                    <Button size="sm" variant="ghost" aria-label={`کپی ${v.token}`} onPress={() => void copyToken(v.token)}>
                      <Icon name="solar:copy-linear" size={16} />
                      کپی
                    </Button>
                  </span>,
                  <span key="n" className="flex flex-col gap-0.5" title={v.description_fa}>
                    <span className="text-foreground">{v.title_fa}</span>
                    <span className="text-xs text-muted">{v.description_fa}</span>
                    {v.aliases.length ? (
                      <span className="text-xs text-muted">
                        {v.aliases.map((a, i) => (
                          <span key={a}>
                            {i ? "، " : ""}
                            <code dir="ltr" className="font-mono">{a}</code>
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>,
                  v.example ? <bdi key="e" className="font-mono text-sm text-muted">{v.example}</bdi> : <span key="e" className="text-muted">—</span>,
                ]}
                minWidth={560}
              />
            </GlassSection>
          </section>
        ))}
      </div>
    </>
  );
}

export function MessageVariablesPage() {
  const list = useJson<MessageVariablesData>("/api/panel/message-variables");
  return (
    <PanelShell title="متغیرهای پیام">
      <PageHeader icon="solar:code-bold" tone="blue" title="متغیرهای پیام" description="متغیرهایی که در متن‌های ربات می‌توانید بنویسید؛ هر متغیر فقط در بخش خودش جایگزین می‌شود" />
      <Loadable state={list} rows={4}>
        {(data) => <VariablesBody data={data} />}
      </Loadable>
    </PanelShell>
  );
}
