"use client";

import { useJson, useUrlFlash } from "../../core/data";
import { formatDate, toman } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { Ltr, StatusChip } from "../../ui/Data";
import { GlassSection, PageHeader, StatTile } from "../../ui/Page";
import { Loadable, Notice } from "../../ui/States";
import { SelectableTable, type Column } from "../catalog/Tables";
import { MyAccountTabs } from "./MyAccountTabs";
import { STATEMENT_STATUS, statusOf } from "./myFinanceLabels";
import type { CreditBlock, CreditData, StatementRow } from "./myFinanceTypes";

const DATA_PATH = "/api/panel/my-subscription/credit";

const COLUMNS: Column[] = [
  { id: "period", label: "دوره", rowHeader: true },
  { id: "charges", label: "هزینه‌های دوره" },
  { id: "due", label: "مبلغ بدهی" },
  { id: "date", label: "سررسید" },
  { id: "status", label: "وضعیت" },
];

function CreditNotice({ credit }: { credit: CreditBlock }) {
  if (credit.status === "frozen") return <Notice tone="warning">اعتبار شما منجمد است؛ تا باز شدن، فقط با موجودی خودتان می‌فروشید.</Notice>;
  if (credit.status === "overdue" || credit.status === "blocked") {
    return <Notice tone="danger">صورت‌حساب سررسیدگذشته دارید؛ با شارژ کیف پول همهٔ محدودیت‌ها خودکار برداشته می‌شود.</Notice>;
  }
  return null;
}

function statementCells(row: StatementRow) {
  const status = statusOf(STATEMENT_STATUS, row.status);
  return [
    <Ltr key="p">{row.period}</Ltr>,
    <Ltr key="c">{toman(row.charges_total)}</Ltr>,
    <Ltr key="a">{toman(row.amount_due)}</Ltr>,
    <span key="d" className="text-muted">{formatDate(row.due_at)}</span>,
    <StatusChip key="s" color={status.color}>{status.label}</StatusChip>,
  ];
}

function CreditBody({ data }: { data: CreditData }) {
  const { credit } = data;
  return (
    <div className="flex flex-col gap-6">
      <CreditNotice credit={credit} />
      {credit.limit ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile icon="solar:hand-money-bold" tone="blue" label="سقف اعتبار" value={<Ltr>{toman(credit.limit)}</Ltr>} />
          <StatTile icon="solar:hand-money-bold" tone="orange" label="اعتبار استفاده‌شده" value={<Ltr>{toman(credit.used)}</Ltr>} />
          <StatTile icon="solar:hand-money-bold" tone="teal" label="اعتبار قابل استفاده" value={<Ltr>{toman(credit.available)}</Ltr>} />
          <StatTile icon="solar:wallet-money-bold" tone="green" label="موجودی کیف پول" value={<Ltr>{toman(data.balance)}</Ltr>} />
        </div>
      ) : (
        <GlassSection>
          <p className="text-sm text-muted">اعتباری برای شما تعریف نشده است.</p>
        </GlassSection>
      )}
      <GlassSection title="صورت‌حساب‌ها" description="برای پرداخت بدهی کیف پول را شارژ کنید؛ پرداخت اول قدیمی‌ترین صورت‌حساب را صاف می‌کند.">
        <SelectableTable ariaLabel="صورت‌حساب‌ها" columns={COLUMNS} rows={data.statements} rowId={(row) => row.id} cells={statementCells} empty="هنوز صورت‌حسابی صادر نشده است" minWidth={560} />
      </GlassSection>
    </div>
  );
}

function Body() {
  useUrlFlash();
  const state = useJson<CreditData>(DATA_PATH);
  return (
    <>
      <PageHeader icon="solar:card-bold" tone="green" title="اشتراک من" description="بستهٔ فروشگاه شما، کیف پول، اعتبار و هزینه‌ها" />
      <MyAccountTabs active="credit" />
      <Loadable state={state} rows={4}>
        {(data) => <CreditBody data={data} />}
      </Loadable>
    </>
  );
}

export function MyCreditPage() {
  return (
    <PanelShell title="اشتراک من">
      <Body />
    </PanelShell>
  );
}
