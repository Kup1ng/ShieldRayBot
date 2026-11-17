"use client";

import { Button } from "@heroui/react";

import { useLocation } from "@/lib/location";

import { useJson, useUrlFlash } from "../../core/data";
import { fa, formatDateTime, toman } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { Ltr, StatusChip } from "../../ui/Data";
import { GlassSection, PageHeader, StatTile } from "../../ui/Page";
import { Loadable } from "../../ui/States";
import { SelectableTable, type Column } from "../catalog/Tables";
import { MyAccountTabs } from "./MyAccountTabs";
import { CHARGE_EVENTS, CHARGE_STATUS, statusOf } from "./myFinanceLabels";
import type { ChargeRow, ChargesData } from "./myFinanceTypes";

const PAGE = "/my-subscription/charges";
const DATA_PATH = "/api/panel/my-subscription/charges";

const COLUMNS: Column[] = [
  { id: "event", label: "تغییر", rowHeader: true },
  { id: "user", label: "کاربر" },
  { id: "date", label: "زمان" },
  { id: "amount", label: "مبلغ" },
  { id: "status", label: "وضعیت" },
];

/** «تمدید × ۳»: the change, and how many users it covered when more than one. */
export function chargeTitle(row: Pick<ChargeRow, "event" | "quantity">): string {
  const name = CHARGE_EVENTS[row.event] ?? row.event;
  return row.quantity > 1 ? `${name} × ${fa(row.quantity)}` : name;
}

function chargeCells(row: ChargeRow) {
  const status = statusOf(CHARGE_STATUS, row.status);
  return [
    <bdi key="e" className="font-medium text-foreground">{chargeTitle(row)}</bdi>,
    <Ltr key="u">{row.pg_username || "—"}</Ltr>,
    <span key="d" className="text-muted">{formatDateTime(row.created_at)}</span>,
    <Ltr key="a">{toman(row.amount)}</Ltr>,
    <StatusChip key="s" color={status.color}>{status.label}</StatusChip>,
  ];
}

function ChargesBody({ data }: { data: ChargesData }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile icon="solar:wallet-money-bold" tone="green" label="موجودی کیف پول" value={<Ltr>{toman(data.balance)}</Ltr>} />
      </div>
      <GlassSection title="هزینه‌های PAYG" description={data.is_payg ? undefined : "پلن شما PAYG نیست؛ هزینه‌ای اینجا ثبت نمی‌شود."}>
        <SelectableTable ariaLabel="هزینه‌های PAYG" columns={COLUMNS} rows={data.charges} rowId={(row) => row.id} cells={chargeCells} empty="هزینه‌ای ثبت نشده است" minWidth={600} />
        {data.next_before ? (
          <div>
            <Button variant="outline" onPress={() => window.location.assign(`${PAGE}?before=${data.next_before}`)}>
              قدیمی‌تر
            </Button>
          </div>
        ) : null}
      </GlassSection>
    </div>
  );
}

function Body() {
  const { search } = useLocation();
  const before = new URLSearchParams(search).get("before");
  useUrlFlash();
  const state = useJson<ChargesData>(`${DATA_PATH}${before ? `?before=${encodeURIComponent(before)}` : ""}`);
  return (
    <>
      <PageHeader icon="solar:card-bold" tone="green" title="اشتراک من" description="بستهٔ فروشگاه شما، کیف پول، اعتبار و هزینه‌ها" />
      <MyAccountTabs active="charges" />
      <Loadable state={state} rows={5}>
        {(data) => <ChargesBody data={data} />}
      </Loadable>
    </>
  );
}

export function MyChargesPage() {
  return (
    <PanelShell title="اشتراک من">
      <Body />
    </PanelShell>
  );
}
