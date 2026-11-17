"use client";

import { run } from "../../core/actions";
import { useJson, useUrlFlash } from "../../core/data";
import { fa, toman } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { Ltr } from "../../ui/Data";
import { GlassSection, PageHeader } from "../../ui/Page";
import { Loadable } from "../../ui/States";
import { RowActions, SelectableTable, type Column, type RowAction } from "../catalog/Tables";
import type { ReviewCharge, ReviewData } from "./types";

const API = "/api/panel/payg/charges/review";

const EVENT_LABELS: Record<string, string> = {
  create: "ساخت",
  renew: "تمدید",
  add_volume: "افزایش حجم",
  add_days: "افزایش روز",
  reset: "ریست ترافیک",
  reactivate: "فعال‌سازی دوباره",
};

const COLUMNS: Column[] = [
  { id: "shop", label: "نماینده", rowHeader: true },
  { id: "change", label: "تغییر" },
  { id: "user", label: "کاربر پنل" },
  { id: "time", label: "زمان" },
  { id: "amount", label: "مبلغ" },
  { id: "actions", label: <span className="sr-only">اقدام</span> },
];

/** «ساخت × ۳» for a change that touched several users. */
export function changeLabel(charge: Pick<ReviewCharge, "event" | "quantity">): string {
  const label = EVENT_LABELS[charge.event] ?? charge.event;
  return charge.quantity > 1 ? `${label} × ${fa(charge.quantity)}` : label;
}

/** The two decisions the Owner can take; each says what happens to the held amount before it posts. */
export function decisions(charge: ReviewCharge, reload: () => void): RowAction[] {
  const post = (verb: "settle" | "refund", success: string) => () =>
    void run(`/payg/charges/${charge.id}/${verb}`, {}, { success, refresh: reload });
  return [
    {
      id: "settle",
      label: "اعمال شده",
      icon: "solar:check-circle-bold",
      confirmText: {
        message: "تأیید هزینه",
        description: `کاربر در پنل همان‌طور که خواسته شده بود تغییر کرده است؟ مبلغ کسرشده (${toman(charge.amount)}) قطعی می‌شود و به کیف پول نماینده برنمی‌گردد.`,
        confirmLabel: "اعمال شده",
      },
      run: post("settle", "هزینه تأیید شد"),
    },
    {
      id: "refund",
      label: "انجام نشده، برگشت مبلغ",
      icon: "solar:undo-left-round-bold",
      tone: "danger",
      confirmText: {
        message: "برگشت مبلغ",
        description: `تغییر در پنل انجام نشده است؟ ${toman(charge.amount)} به کیف پول نماینده برمی‌گردد.`,
        confirmLabel: "برگشت مبلغ",
      },
      run: post("refund", "مبلغ به کیف پول نماینده برگشت"),
    },
  ];
}

function ReviewBody({ data, reload }: { data: ReviewData; reload: () => void }) {
  return (
    <GlassSection
      title="در انتظار بازبینی"
      description={`${fa(data.charges.length)} هزینه — پنل به این تغییرها پاسخ روشن نداد؛ مبلغ از کیف پول نماینده کم شده و نگه داشته شده است.`}
    >
      <SelectableTable
        ariaLabel="هزینه‌های PAYG در انتظار بازبینی"
        columns={COLUMNS}
        rows={data.charges}
        rowId={(row) => row.id}
        empty="هزینه‌ای در انتظار بازبینی نیست"
        cells={(row) => [
          <bdi key="s" dir="auto" className="font-medium text-foreground">{row.shop_name}</bdi>,
          <span key="c">{changeLabel(row)}</span>,
          <Ltr key="u">{row.pg_username || "—"}</Ltr>,
          <Ltr key="t" className="font-mono text-xs">{row.created_at || "—"}</Ltr>,
          <bdi key="a" className="num">{toman(row.amount)}</bdi>,
          <RowActions key="x" label={`بازبینی هزینهٔ ${row.shop_name}`} actions={decisions(row, reload)} />,
        ]}
        minWidth={760}
      />
    </GlassSection>
  );
}

export function PaygChargesReviewPage() {
  const list = useJson<ReviewData>(API);
  useUrlFlash();
  return (
    <PanelShell title="بازبینی هزینه‌های PAYG">
      <PageHeader icon="solar:bill-list-bold" tone="orange" title="بازبینی هزینه‌های PAYG" description="تغییرهایی که نتیجهٔ آن‌ها در پنل معلوم نشد" />
      <Loadable state={list} rows={4}>
        {(data) => <ReviewBody data={data} reload={list.reload} />}
      </Loadable>
    </PanelShell>
  );
}
