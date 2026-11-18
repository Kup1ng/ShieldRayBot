"use client";

import { useState } from "react";

import { run } from "../../core/actions";
import { useJson, useUrlFlash } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { StatusChip } from "../../ui/Data";
import { GlassSection, PageHeader, StatTile } from "../../ui/Page";
import { Loadable } from "../../ui/States";
import { UserNameLink } from "../../ui/UserNameLink";
import { RowActions, SelectableTable, type Column, type RowAction } from "../catalog/Tables";
import { ReasonDialog, type ReasonRequest } from "../users/ReasonDialog";
import { PolicyForm } from "./PolicyForm";
import type { CleanupExemptRow, CleanupPreviewRow, ServiceCleanupData } from "./types";

const PAGE = "/service-cleanup";
const HOLD_CHOICES = [7, 30];
const DANGER_DAYS = 1;
const WARNING_DAYS = 3;

const PREVIEW_COLUMNS: Column[] = [
  { id: "customer", label: "مشتری", rowHeader: true },
  { id: "service", label: "سرویس" },
  { id: "kind", label: "علت" },
  { id: "since", label: "از تاریخ", className: "hidden md:table-cell" },
  { id: "deadline", label: "حذف در" },
  { id: "actions", label: <span className="sr-only">عملیات</span> },
];

const EXEMPT_COLUMNS: Column[] = [
  { id: "customer", label: "مشتری", rowHeader: true },
  { id: "service", label: "سرویس" },
  { id: "actions", label: <span className="sr-only">عملیات</span> },
];

type AskReason = (request: ReasonRequest) => void;

/** How close a deadline is: tomorrow or sooner is urgent, within three days is a warning. */
export function deadlineColor(daysLeft: number): "danger" | "warning" | "default" {
  if (daysLeft <= DANGER_DAYS) return "danger";
  return daysLeft <= WARNING_DAYS ? "warning" : "default";
}

function CustomerLink({ row }: { row: { user_id: number; customer: string } }) {
  return <UserNameLink userId={row.user_id} name={row.customer} page="cleanup" />;
}

function viewUserAction(row: { user_id: number }): RowAction {
  return { id: "view", label: "مشاهده کاربر", icon: "solar:user-id-bold", run: () => window.location.assign(`/users/${row.user_id}/edit`) };
}

function holdAction(row: CleanupPreviewRow, days: number, ask: AskReason, reload: () => void): RowAction {
  return {
    id: `hold-${days}`,
    label: `${fa(days)} روز مهلت`,
    icon: "solar:clock-circle-bold",
    run: () =>
      ask({
        title: "تمدید مهلت حذف",
        message: `${fa(days)} روز به مهلت حذف سرویس ${row.username} اضافه شود؟`,
        confirmLabel: "تمدید",
        reasonLabel: "علت تمدید مهلت",
        onConfirm: async (reason) => {
          await run(`${PAGE}/${row.service_id}/hold`, { reason, days }, { refresh: reload });
        },
      }),
  };
}

function exemptAction(row: { service_id: number; username: string }, keep: boolean, ask: AskReason, reload: () => void): RowAction {
  const copy = keep
    ? { label: "معاف از پاکسازی", icon: "solar:shield-check-bold", title: "معاف‌کردن از پاکسازی", message: `سرویس ${row.username} برای همیشه از پاکسازی معاف شود؟`, confirmLabel: "معاف شود", reasonLabel: "علت معافیت" }
    : { label: "برگردان به پاکسازی", icon: "solar:restart-bold", title: "برگرداندن به پاکسازی", message: `سرویس ${row.username} دوباره در پاکسازی قرار گیرد؟`, confirmLabel: "برگردان", reasonLabel: "علت برگرداندن" };
  return {
    id: keep ? "exempt" : "unexempt",
    label: copy.label,
    icon: copy.icon,
    run: () =>
      ask({
        title: copy.title,
        message: copy.message,
        confirmLabel: copy.confirmLabel,
        reasonLabel: copy.reasonLabel,
        onConfirm: async (reason) => {
          await run(`${PAGE}/${row.service_id}/exempt`, { reason, value: keep ? "1" : "0" }, { refresh: reload });
        },
      }),
  };
}

function StatusSection({ data }: { data: ServiceCleanupData }) {
  const { preview } = data;
  return (
    <GlassSection title="وضعیت فعلی" description={preview.cache_note}>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon="solar:hourglass-bold" tone="orange" label="منقضی‌شده" value={fa(preview.expired_total)} />
        <StatTile icon="solar:database-bold" tone="yellow" label="حجم تمام‌شده" value={fa(preview.volume_total)} />
        <StatTile icon="solar:trash-bin-trash-bold" tone="red" label="آمادهٔ حذف" value={fa(preview.time_due_now + preview.volume_due_now)} />
      </div>
    </GlassSection>
  );
}

function QueueSection({ data, ask, reload }: { data: ServiceCleanupData; ask: AskReason; reload: () => void }) {
  const { preview } = data;
  const soon = preview.time_due_soon + preview.volume_due_soon;
  return (
    <GlassSection
      title="سرویس‌هایی که به‌زودی حذف می‌شوند"
      description={`${fa(soon)} سرویس تا ۷ روز دیگر به مهلتشان می‌رسند. حداکثر ${fa(preview.rows.length)} مورد، به ترتیب نزدیک‌ترین مهلت. «معاف» سرویس را برای همیشه از پاکسازی بیرون می‌برد؛ «مهلت» چند روز به مهلتش اضافه می‌کند و دوباره به مشتری هشدار می‌رسد.`}
    >
      <SelectableTable
        ariaLabel="سرویس‌های نزدیک به حذف"
        columns={PREVIEW_COLUMNS}
        rows={preview.rows}
        rowId={(row) => row.service_id}
        empty="سرویسی نزدیک به حذف نیست."
        minWidth={620}
        cells={(row) => [
          <CustomerLink key="c" row={row} />,
          <bdi key="s" dir="ltr" className="font-mono text-sm">{row.username}</bdi>,
          <StatusChip key="k" color={row.retrying ? "danger" : "default"}>{row.retrying ? "تلاش مجدد" : row.kind}</StatusChip>,
          <bdi key="f" dir="ltr" className="font-mono text-sm text-muted">{row.since}</bdi>,
          <StatusChip key="d" color={deadlineColor(row.days_left)}>
            <bdi dir="ltr" className="font-mono">{row.deadline}</bdi>
          </StatusChip>,
          <RowActions
            key="a"
            label={`عملیات ${row.username}`}
            actions={[viewUserAction(row), ...HOLD_CHOICES.map((days) => holdAction(row, days, ask, reload)), exemptAction(row, true, ask, reload)]}
          />,
        ]}
      />
    </GlassSection>
  );
}

function ExemptSection({ rows, ask, reload }: { rows: CleanupExemptRow[]; ask: AskReason; reload: () => void }) {
  if (rows.length === 0) return null;
  return (
    <GlassSection title="سرویس‌های معاف از پاکسازی" description="این سرویس‌ها هیچ‌وقت خودکار حذف نمی‌شوند.">
      <SelectableTable
        ariaLabel="سرویس‌های معاف از پاکسازی"
        columns={EXEMPT_COLUMNS}
        rows={rows}
        rowId={(row) => row.service_id}
        empty="سرویسی معاف نیست."
        minWidth={480}
        cells={(row) => [
          <CustomerLink key="c" row={row} />,
          <bdi key="s" dir="ltr" className="font-mono text-sm">{row.username}</bdi>,
          <RowActions key="a" label={`عملیات ${row.username}`} actions={[viewUserAction(row), exemptAction(row, false, ask, reload)]} />,
        ]}
      />
    </GlassSection>
  );
}

function CleanupBody({ data, reload }: { data: ServiceCleanupData; reload: () => void }) {
  const [reason, setReason] = useState<ReasonRequest | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <StatusSection data={data} />
      <PolicyForm policy={data.policy} minDays={data.min_days} maxDays={data.max_days} onSaved={reload} />
      <QueueSection data={data} ask={setReason} reload={reload} />
      <ExemptSection rows={data.exempt} ask={setReason} reload={reload} />
      <ReasonDialog request={reason} onClose={() => setReason(null)} />
    </div>
  );
}

export function ServiceCleanupPage() {
  const state = useJson<ServiceCleanupData>("/api/panel/service-cleanup");
  useUrlFlash();
  return (
    <PanelShell title="پاکسازی سرویس‌ها">
      <PageHeader
        icon="solar:trash-bin-trash-bold"
        tone="orange"
        title="پاکسازی سرویس‌ها"
        description="سرویس‌هایی که منقضی یا بی‌حجم شده‌اند و تمدید نشدند، بعد از مهلتی که تعیین می‌کنید حذف می‌شوند. قبل از حذف به مشتری هشدار می‌رسد."
      />
      <Loadable state={state} rows={4}>
        {(data) => <CleanupBody data={data} reload={state.reload} />}
      </Loadable>
    </PanelShell>
  );
}
