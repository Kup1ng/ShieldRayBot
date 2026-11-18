"use client";

import { useState } from "react";

import { run } from "../../core/actions";
import { useJson, useUrlFlash } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { StatusChip } from "../../ui/Data";
import { FormModal } from "../../ui/Fields";
import { GlassSection, PageHeader } from "../../ui/Page";
import { SectionTabs } from "../../ui/SectionTabs";
import { Loadable } from "../../ui/States";
import { GiftCodeForm } from "./GiftCodeForm";
import { BulkBar, RowActions, SelectableTable, type BulkOp, type Column } from "./Tables";
import type { GiftCode, GiftCodesData } from "./types";
import { useBulk } from "./useBulk";

const BULK: BulkOp[] = [
  { key: "toggle", label: "روشن/خاموش", confirmMessage: (n) => `وضعیت ${n.toLocaleString("fa-IR")} کد هدیه تغییر کند؟`, confirmTitle: "تغییر وضعیت گروهی", confirmLabel: "اعمال" },
];

const COLUMNS: Column[] = [
  { id: "code", label: "کد", rowHeader: true },
  { id: "amount", label: "مبلغ" },
  { id: "uses", label: "مصرف" },
  { id: "terms", label: "شرایط" },
  { id: "expiry", label: "انقضا" },
  { id: "status", label: "وضعیت" },
  { id: "actions", label: <span className="sr-only">عملیات</span> },
];

function GiftCodesBody({ data, reload }: { data: GiftCodesData; reload: () => void }) {
  const [editing, setEditing] = useState<GiftCode | null>(null);
  const bulk = useBulk("/plans/gift-codes/bulk-action", "/gift-codes", data.codes.map((c) => c.id), reload);
  const saved = () => {
    setEditing(null);
    reload();
  };
  return (
    <>
      <SectionTabs label="بازاریابی و وفاداری" items={data.tabs} active={data.tabs.find((tab) => tab.active)?.key ?? ""} />
      <div className="flex flex-col gap-6">
        <GlassSection title="ساخت کد جدید">
          <GiftCodeForm key={data.codes[0]?.id ?? 0} data={data} onSaved={reload} />
        </GlassSection>
        <GlassSection title="کدهای اخیر" description={`${fa(data.codes.length)} کد`}>
          <SelectableTable
            ariaLabel="کدهای هدیه"
            columns={COLUMNS}
            rows={data.codes}
            rowId={(c) => c.id}
            empty="هنوز کدی ساخته نشده."
            selected={bulk.selected}
            onSelectedChange={bulk.setSelected}
            cells={(c) => [
              <span key="c" className="flex flex-col">
                <bdi dir="ltr" className="font-mono font-medium text-foreground">{c.code}</bdi>
                {c.note ? <bdi className="text-xs text-muted">{c.note}</bdi> : null}
              </span>,
              c.kind === "discount" ? (
                <span key="a" className="flex flex-col">
                  <bdi className="num">{fa(c.percent)}٪</bdi>
                  {c.max_discount_toman !== null ? <span className="text-xs text-muted">تا <bdi className="num">{fa(c.max_discount_toman)}</bdi> تومان</span> : null}
                </span>
              ) : (
                <span key="a" className="flex flex-col">
                  <bdi className="num">{fa(c.amount)}</bdi>
                  <span className="text-xs text-muted">شارژ کیف پول</span>
                </span>
              ),
              <bdi key="u" className="num">
                {fa(c.used_count)}
                {c.max_uses !== null ? `/${fa(c.max_uses)}` : ""}
              </bdi>,
              <span key="t" className="flex flex-col text-sm">
                <span>هر کاربر: {c.max_uses_per_user !== null ? fa(c.max_uses_per_user) : "نامحدود"}</span>
                {c.kind === "discount" ? (
                  <span className="text-xs text-muted">
                    {c.first_purchase_only ? "فقط خرید اول" : c.purchase_label}
                    {c.plan_ids.length ? <> · <bdi>{c.plans_label}</bdi></> : null}
                  </span>
                ) : null}
              </span>,
              <bdi key="e" dir="ltr" className="num">{c.expiry_label}</bdi>,
              <StatusChip key="s" color={c.state === "فعال" ? "success" : "warning"}>{c.state}</StatusChip>,
              <RowActions
                key="r"
                label={`عملیات کد ${c.code}`}
                actions={[
                  { id: "edit", label: "ویرایش", icon: "solar:pen-linear", run: () => setEditing(c) },
                  {
                    id: "toggle",
                    label: c.is_active ? "خاموش‌کردن" : "روشن‌کردن",
                    icon: "solar:power-linear",
                    run: async () => {
                      await run(`/plans/gift-codes/${c.id}/toggle`);
                      reload();
                    },
                  },
                ]}
              />,
            ]}
            minWidth={780}
          />
          <BulkBar count={bulk.count} ops={BULK} busy={bulk.busy} onRun={(op) => void bulk.run(op)} onClear={bulk.clear} />
        </GlassSection>
      </div>
      <FormModal isOpen={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} title={editing ? <>ویرایش کد <bdi dir="ltr" className="font-mono">{editing.code}</bdi></> : "ویرایش کد"} size="lg">
        {editing ? <GiftCodeForm key={editing.id} data={data} code={editing} onSaved={saved} onCancel={() => setEditing(null)} /> : null}
      </FormModal>
    </>
  );
}

export function GiftCodesPage() {
  const list = useJson<GiftCodesData>("/api/panel/gift-codes");
  useUrlFlash();
  return (
    <PanelShell title="کد هدیه">
      <PageHeader icon="solar:gift-bold" tone="pink" title="کد هدیه" description="کد شارژ کیف پول و کد تخفیف خرید برای مشتریان فروشگاه" />
      <Loadable state={list} rows={4}>
        {(data) => <GiftCodesBody data={data} reload={list.reload} />}
      </Loadable>
    </PanelShell>
  );
}
