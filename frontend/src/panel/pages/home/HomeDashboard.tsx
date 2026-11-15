"use client";

import { Button, Skeleton, Tooltip } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { useJson } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { GlassSection, PageHeader } from "../../ui/Page";
import { ErrorBlock, LoadingBlock, Notice } from "../../ui/States";
import { DismissDialog, type DismissTarget } from "./DismissDialog";
import { AccountCard, BillingCard, KpiStrip, LinkHealthCard, PeriodsCard, PgLimitsCard, Portals, StatusTiles, WorkQueue } from "./HomeParts";
import { SalesChart } from "./SalesChart";
import type { HomeShell, HomeWidgets, QueueEntry } from "./types";
import { LinkButton } from "./ui";

function Alerts({ shell, widgets, onRetry }: { shell: HomeShell | null; widgets: HomeWidgets | null; onRetry: () => void }) {
  const retry = (
    <Button size="sm" variant="outline" onPress={onRetry}>
      تلاش دوباره
    </Button>
  );
  const setupNeeded = widgets ? widgets.bot_setup_needed : Boolean(shell?.bot_setup_needed);
  return (
    <>
      {widgets?.degraded ? (
        <Notice tone="warning" title="بارگذاری ناقص داشبورد" action={retry}>
          بعضی بخش‌ها خوانده نشدند و وضعیت اتصال را جعلی «قطع» نشان نمی‌دهیم؛ صفحه را تازه کنید.
        </Notice>
      ) : null}
      {widgets?.notice?.kind === "stale" ? (
        <Notice tone="warning" title="آخرین اطلاعات دریافت‌شده نمایش داده می‌شود" action={retry}>
          ارتباط با پاسارگارد کند یا قطع است. بخشی از اعداد این صفحه مربوط به حدود <bdi dir="ltr">{fa(widgets.notice.minutes)}</bdi> دقیقه پیش است و ممکن است به‌روز نباشد.
        </Notice>
      ) : null}
      {widgets?.notice?.kind === "unavailable" ? (
        <Notice tone="warning" title="اطلاعات پاسارگارد در دسترس نیست" action={retry}>
          ارتباط با پاسارگارد کند یا قطع است. بقیهٔ بخش‌های پنل کار می‌کنند؛ کمی بعد دوباره تلاش کنید.
        </Notice>
      ) : null}
      {widgets?.update ? (
        <Notice tone="accent" title="نسخهٔ جدید" action={<LinkButton href="/settings?tab=update">مشاهده و نصب</LinkButton>}>
          نسخه <bdi dir="ltr">{widgets.update.remote_version}</bdi> آمادهٔ نصب است.
        </Notice>
      ) : null}
      {setupNeeded ? (
        <Notice tone="danger" title="ربات تلگرام شما هنوز تنظیم نشده" action={<LinkButton href="/shop-settings?tab=bot">تنظیمات ربات تلگرام</LinkButton>}>
          برای راه‌اندازی فروشگاه، توکن ربات اختصاصی را در تنظیمات ثبت کنید.
        </Notice>
      ) : null}
    </>
  );
}

function WidgetsPlaceholder() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="در حال دریافت آمار">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <GlassSection title="وضعیت اتصال">
        <LoadingBlock rows={1} height="h-16" />
      </GlassSection>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <GlassSection title="فروش">
          <LoadingBlock rows={1} height="h-56" />
        </GlassSection>
        <GlassSection title="صف کار">
          <LoadingBlock rows={3} />
        </GlassSection>
      </div>
    </div>
  );
}

function Widgets({ data, onDismiss }: { data: HomeWidgets; onDismiss: (entry: QueueEntry) => void }) {
  return (
    <div className="flex flex-col gap-6">
      {data.billing ? <BillingCard billing={data.billing} /> : null}
      <KpiStrip kpi={data.kpi} />
      <StatusTiles tiles={data.tiles} />
      <Portals portals={data.portals} />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <SalesChart initial={data.trend} />
        <WorkQueue queue={data.queue} onDismiss={onDismiss} />
      </div>
      {data.link_health ? <LinkHealthCard health={data.link_health} /> : null}
      {data.pg_limits ? <PgLimitsCard limits={data.pg_limits} /> : null}
      <div className={data.account ? "grid gap-6 lg:grid-cols-[2fr_3fr]" : ""}>
        {data.account ? <AccountCard account={data.account} /> : null}
        <PeriodsCard periods={data.periods} />
      </div>
    </div>
  );
}

function HomeContent() {
  const shell = useJson<HomeShell>("/api/panel/home");
  const widgets = useJson<HomeWidgets>("/api/panel/home/widgets");
  const [dismiss, setDismiss] = useState<DismissTarget | null>(null);
  const reloadAll = () => {
    shell.reload();
    widgets.reload();
  };

  return (
    <>
      <PageHeader
        icon="solar:home-2-bold"
        title="داشبورد"
        description="نمای کلی شیلدری، صف کار و وضعیت اتصال‌ها"
        actions={
          <Tooltip delay={500}>
            <Button isIconOnly variant="outline" aria-label="تازه‌سازی داشبورد" isPending={widgets.status === "loading"} onPress={widgets.reload}>
              <Icon name="solar:refresh-linear" size={20} />
            </Button>
            <Tooltip.Content>
              <p>تازه‌سازی</p>
            </Tooltip.Content>
          </Tooltip>
        }
      />
      {shell.status === "error" && !shell.data ? (
        <ErrorBlock message={shell.message} onRetry={reloadAll} />
      ) : (
        <div className="flex flex-col gap-6">
          <Alerts shell={shell.data} widgets={widgets.data} onRetry={widgets.reload} />
          {widgets.data ? (
            <Widgets data={widgets.data} onDismiss={(entry) => setDismiss({ key: `ac:${entry.key}`, entity: "" })} />
          ) : widgets.status === "error" ? (
            <>
              {shell.data ? <Portals portals={shell.data.portals} /> : null}
              <ErrorBlock message={widgets.message} onRetry={widgets.reload} />
            </>
          ) : (
            <WidgetsPlaceholder />
          )}
        </div>
      )}
      <DismissDialog target={dismiss} onClose={() => setDismiss(null)} onDone={widgets.reload} />
    </>
  );
}

export function HomeDashboard() {
  return (
    <PanelShell title="داشبورد">
      <HomeContent />
    </PanelShell>
  );
}
