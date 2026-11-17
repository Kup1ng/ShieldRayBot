"use client";

import { Button } from "@heroui/react";

import { Icon } from "@/icons/Icon";

import { useJson } from "../../core/data";
import { toman, type ChipColor } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { Ltr, StatusChip } from "../../ui/Data";
import { GlassSection, PageHeader, StatTile } from "../../ui/Page";
import { Loadable } from "../../ui/States";
import { FinanceTabStrip, PAYG_TAB, stripTabs, tabHref, type StripTab } from "../finance/FinanceTabStrip";
import type { FinanceOverview } from "../finance/types";
import { DownloadLink } from "../system/ui";
import { SelectableTable, type Column } from "../catalog/Tables";
import type { PaygReportData, PaygReportRow } from "./types";

const CSV_PATH = "/finance/payg.csv";
const REVIEW_PATH = "/payg/charges/review";

const COLUMNS: Column[] = [
  { id: "shop", label: "نماینده", rowHeader: true },
  { id: "balance", label: "موجودی" },
  { id: "limit", label: "سقف اعتبار" },
  { id: "charges", label: "هزینهٔ این ماه" },
  { id: "debt", label: "بدهی صورت‌حساب" },
  { id: "cashback", label: "کش‌بک این ماه" },
  { id: "credit", label: "اعتبار" },
  { id: "card", label: <span className="sr-only">کارت نماینده</span> },
];

const CREDIT_STATUS: Record<string, { label: string; color: ChipColor }> = {
  frozen: { label: "منجمد", color: "accent" },
  overdue: { label: "سررسید گذشته", color: "warning" },
  blocked: { label: "مسدود", color: "danger" },
};

/** «عادی» unless the credit line is frozen, overdue or blocked. */
export function creditChip(status: string): { label: string; color: ChipColor } {
  return CREDIT_STATUS[status] ?? { label: "عادی", color: "success" };
}

function ReportBody({ data }: { data: PaygReportData }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon="solar:wallet-money-bold" tone="red" label="بدهی نمایندگان" value={<Ltr>{toman(data.totals.debt)}</Ltr>} />
        <StatTile icon="solar:bill-list-bold" tone="blue" label="هزینهٔ این ماه" value={<Ltr>{toman(data.totals.month_charges)}</Ltr>} />
        <StatTile icon="solar:gift-bold" tone="green" label="کش‌بک این ماه" value={<Ltr>{toman(data.totals.month_cashback)}</Ltr>} />
      </div>
      <GlassSection title="نمایندگان PAYG">
        <SelectableTable<PaygReportRow>
          ariaLabel="نمایندگان PAYG"
          columns={COLUMNS}
          rows={data.rows}
          rowId={(row) => row.shop_id}
          empty="نمایندهٔ PAYG وجود ندارد"
          cells={(row) => {
            const chip = creditChip(row.credit_status);
            return [
              <Ltr key="s" className="font-medium text-foreground">{row.label}</Ltr>,
              <Ltr key="b">{toman(row.balance)}</Ltr>,
              <Ltr key="l">{toman(row.credit_limit)}</Ltr>,
              <Ltr key="c">{toman(row.month_charges)}</Ltr>,
              <Ltr key="d">{toman(row.open_debt)}</Ltr>,
              <Ltr key="k">{toman(row.month_cashback)}</Ltr>,
              <StatusChip key="st" color={chip.color}>{chip.label}</StatusChip>,
              <a
                key="a"
                href={`/resellers/${row.shop_id}/edit`}
                aria-label={`کارت نماینده ${row.label}`}
                className="text-sm font-medium text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus"
              >
                کارت نماینده
              </a>,
            ];
          }}
          minWidth={900}
        />
      </GlassSection>
    </div>
  );
}

export function PaygReportPage() {
  const report = useJson<PaygReportData>("/api/panel/finance/payg");
  const overview = useJson<FinanceOverview>("/api/panel/finance");
  // Until the finance rights arrive the strip shows just this tab; the report itself is already guarded.
  const tabs: StripTab[] = overview.data ? stripTabs(overview.data) : [PAYG_TAB];
  return (
    <PanelShell title="مدیریت مالی">
      <PageHeader
        icon="solar:wallet-money-bold"
        tone="green"
        title="مدیریت مالی"
        description="وضعیت اعتبار، بدهی و هزینهٔ نمایندگان PAYG"
        actions={
          <>
            <Button variant="outline" onPress={() => window.location.assign(REVIEW_PATH)}>
              <Icon name="solar:bill-list-bold" size={20} />
              بازبینی هزینه‌ها
            </Button>
            <DownloadLink href={CSV_PATH}>
              <Icon name="solar:download-linear" size={18} />
              خروجی CSV
            </DownloadLink>
          </>
        }
      />
      <FinanceTabStrip tabs={tabs} selected={PAYG_TAB} cancelAlert={false} onSelect={(tab) => tab !== PAYG_TAB && window.location.assign(tabHref(tab))} />
      <Loadable state={report} rows={5}>
        {(data) => <ReportBody data={data} />}
      </Loadable>
    </PanelShell>
  );
}
