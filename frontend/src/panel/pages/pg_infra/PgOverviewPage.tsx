"use client";

import { Button, Tooltip } from "@heroui/react";

import { Icon } from "@/icons/Icon";

import { PanelShell } from "../../layout/PanelShell";
import { Loadable, Notice } from "../../ui/States";
import { GlassSection, PageHeader } from "../../ui/Page";
import { PgLimitsCard } from "../home/HomeParts";
import { usePgData } from "./data";
import { useLiveMetrics } from "./live";
import { ConnectionTiles, LiveTraffic, NodeCards, PanelFacts, ServerMeters, ShareBar, UserKpis } from "./OverviewParts";
import { ConnectionNoticeBar, ReadError } from "./PgNotice";
import type { OverviewShell, OverviewWidgets, OwnerWidgets, ShopWidgets } from "./types";

function RemediationBanner({ remediation }: { remediation: NonNullable<OverviewShell["remediation"]> }) {
  const action = remediation.can_self_serve ? (
    <Button size="sm" variant="outline" onPress={() => window.location.assign("/security")}>
      تغییر رمز
    </Button>
  ) : null;
  let title = "نیاز به تکمیل دسترسی پاسارگارد";
  let text = "برای دسترسی کامل به منوهای داده، ذخیرهٔ رمز پاسارگارد لازم است.";
  if (!remediation.username_aligned) {
    title = "نام کاربری وب با پاسارگارد هماهنگ نیست";
    text = "ورود وب کار می‌کند، ولی تغییر رمز تا هم‌ترازسازی توسط ادمین اصلی ممکن نیست. از ادمین اصلی بخواهید در «ادمین‌ها» دسترسی ادمین فرعی را ویرایش و هم‌ترازسازی را تأیید کند.";
  } else if (!remediation.credentials_ready) {
    title = "اعتبارنامه پاسارگارد ذخیره نشده";
    text = "تا وقتی رمز ذخیره نشود، بعضی بخش‌های داده محدود می‌مانند. رمز را از «امنیت» تغییر دهید یا از ادمین اصلی بخواهید آن را در «ادمین‌ها» تنظیم کند.";
  }
  return (
    <div className="flex flex-col gap-2">
      <Notice tone="warning" title={title}>
        {text}
      </Notice>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

function Banners({ shell }: { shell: OverviewShell }) {
  return (
    <>
      {shell.ticket_alert ? (
        <div className="flex flex-col gap-2">
          <Notice tone="warning" title={shell.ticket_alert.title}>
            {shell.ticket_alert.detail}
          </Notice>
          <div>
            <Button size="sm" variant="outline" onPress={() => window.location.assign(shell.ticket_alert?.href || "/tickets")}>
              مشاهده
            </Button>
          </div>
        </div>
      ) : null}
      {shell.remediation ? <RemediationBanner remediation={shell.remediation} /> : null}
    </>
  );
}

function OwnerOverview({ data }: { data: OwnerWidgets }) {
  const live = useLiveMetrics({ host: data.host, live: data.live, nodes: data.nodes });
  return (
    <>
      {live.host ? <ServerMeters host={live.host} /> : null}
      <LiveTraffic state={live} />
      <ConnectionTiles data={data} />
      <UserKpis counts={data.counts} mine={false} usersHref={data.links.users ? "/pg/users" : undefined} />
      <GlassSection title="کاربران و اجزای پنل">
        <ShareBar segments={data.segments} />
        <PanelFacts facts={data.facts} />
      </GlassSection>
      <NodeCards nodes={live.nodes} canOpen={data.links.nodes} />
    </>
  );
}

function ShopOverview({ data }: { data: ShopWidgets }) {
  if (!data.ready) {
    return data.account_error ? <Notice tone="danger">{data.account_error}</Notice> : <Notice tone="warning">اطلاعات حساب پاسارگارد در دسترس نیست؛ کمی بعد دوباره تلاش کنید.</Notice>;
  }
  return (
    <>
      {data.limits ? <PgLimitsCard limits={data.limits} /> : null}
      <UserKpis counts={data.counts} mine usersHref={data.links.users ? "/pg/users" : undefined} />
      <GlassSection title="وضعیت کاربران من">
        <ShareBar segments={data.segments} />
      </GlassSection>
    </>
  );
}

function Widgets({ data, onRetry }: { data: OverviewWidgets; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <ConnectionNoticeBar notice={data.notice} onRetry={onRetry} />
      <ReadError message={data.error} />
      {data.owner ? <OwnerOverview data={data} /> : <ShopOverview data={data} />}
    </div>
  );
}

export function OverviewContent() {
  const shell = usePgData<OverviewShell>("/api/panel/pg");
  const widgets = usePgData<OverviewWidgets>("/api/panel/pg/widgets");
  const external = shell.data?.external_url;
  return (
    <>
      <PageHeader
        icon="solar:server-square-bold"
        title="نمای کلی پاسارگارد"
        description="وضعیت سرور، نودها و کاربران پنل پاسارگارد"
        actions={
          <>
            <Tooltip delay={500}>
              <Button isIconOnly variant="outline" aria-label="تازه‌سازی" onPress={widgets.reload}>
                <Icon name="solar:refresh-linear" size={20} />
              </Button>
              <Tooltip.Content>
                <p>تازه‌سازی</p>
              </Tooltip.Content>
            </Tooltip>
            {external ? (
              <Button variant="outline" onPress={() => window.open(external, "_blank", "noopener,noreferrer")}>
                <Icon name="solar:arrow-right-up-linear" size={20} />
                ورود به پاسارگارد
              </Button>
            ) : null}
          </>
        }
      />
      <div className="flex flex-col gap-6">
        {shell.data ? <Banners shell={shell.data} /> : null}
        <Loadable state={widgets} rows={4} height="h-28">
          {(data) => <Widgets data={data} onRetry={widgets.reload} />}
        </Loadable>
      </div>
    </>
  );
}

export function PgOverviewPage() {
  return (
    <PanelShell title="نمای کلی پاسارگارد">
      <OverviewContent />
    </PanelShell>
  );
}
