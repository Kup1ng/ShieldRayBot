"use client";

import { useState, type FormEvent } from "react";

import { run } from "../../core/actions";
import { useJson, useUrlFlash } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { StatusChip } from "../../ui/Data";
import { CheckGroup, FormGrid, FormModal, MoneyInput, SelectInput, SwitchInput, TextInput } from "../../ui/Fields";
import { GlassSection, PageHeader } from "../../ui/Page";
import { SectionTabs } from "../../ui/SectionTabs";
import { Loadable } from "../../ui/States";
import { FormActions } from "./PlanParts";
import { BulkBar, RowActions, SelectableTable, type BulkOp, type Column } from "./Tables";
import type { GiftCode, GiftCodesData } from "./types";
import { useBulk } from "./useBulk";
import { useFormSubmit } from "./useFormSubmit";

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

const orEmpty = (n: number | null) => (n === null ? "" : String(n));

/** The create form and the edit form of one code; the kind of an existing code cannot change. */
function GiftCodeForm({ data, code, onSaved, onCancel }: { data: GiftCodesData; code?: GiftCode; onSaved: () => void; onCancel?: () => void }) {
  const editing = Boolean(code);
  const [kind, setKind] = useState<"wallet" | "discount">(code?.kind ?? "wallet");
  const [amount, setAmount] = useState(code && code.kind === "wallet" ? String(code.amount) : "");
  const [percent, setPercent] = useState(code && code.kind === "discount" ? String(code.percent) : "");
  const [cap, setCap] = useState(code ? orEmpty(code.max_discount_toman) : "");
  const [maxUses, setMaxUses] = useState(code ? orEmpty(code.max_uses) : "1");
  const [perUser, setPerUser] = useState(code ? orEmpty(code.max_uses_per_user) : "1");
  const [expires, setExpires] = useState(code?.expiry_input ?? "");
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState(code?.note ?? "");
  const [firstOnly, setFirstOnly] = useState(code?.first_purchase_only ?? false);
  const [types, setTypes] = useState<string[]>(code?.purchase_types ?? []);
  const { pending, send } = useFormSubmit(onSaved);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(
      code ? `/plans/gift-codes/${code.id}/edit` : "/plans/gift-codes",
      {
        kind,
        ...(kind === "wallet" ? { amount } : { percent, max_discount_toman: cap, first_purchase_only: firstOnly, purchase_types: types }),
        max_uses: maxUses,
        max_uses_per_user: perUser,
        expires_at: expires,
        ...(code ? {} : { code: custom }),
        note,
      },
      code ? "تنظیمات کد ذخیره شد" : "کد ساخته شد",
    );
  };
  const toggleFirst = (on: boolean) => {
    setFirstOnly(on);
    if (on) setTypes(["new"]);
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <FormGrid>
        {editing ? (
          <TextInput label="نوع کد" value={kind === "wallet" ? "شارژ کیف پول" : "تخفیف درصدی خرید"} onChange={() => undefined} disabled />
        ) : (
          <SelectInput
            label="نوع کد"
            value={kind}
            onChange={(v) => setKind(v === "discount" ? "discount" : "wallet")}
            options={[
              { id: "wallet", label: "شارژ کیف پول" },
              { id: "discount", label: "تخفیف درصدی خرید" },
            ]}
          />
        )}
        {kind === "wallet" ? (
          <MoneyInput label="مبلغ شارژ (تومان)" value={amount} onChange={setAmount} required placeholder="50000" help={`حداکثر ${fa(data.limits.max_amount)}`} />
        ) : (
          <>
            <TextInput label="درصد تخفیف" type="number" min={1} max={100} value={percent} onChange={setPercent} required ltr placeholder="20" />
            <MoneyInput label="سقف تخفیف (تومان)" value={cap} onChange={setCap} placeholder="خالی = بدون سقف" />
          </>
        )}
        <TextInput label="سقف استفاده کل" type="number" min={1} max={data.limits.max_uses} value={maxUses} onChange={setMaxUses} ltr placeholder="خالی = نامحدود" />
        <TextInput label="سقف استفاده هر کاربر" type="number" min={1} max={data.limits.max_uses} value={perUser} onChange={setPerUser} ltr placeholder="خالی = نامحدود" />
        <TextInput
          label="تاریخ و ساعت انقضا (به وقت تهران)"
          value={expires}
          onChange={setExpires}
          ltr
          maxLength={32}
          placeholder="2030-01-01 23:59"
          help="خالی = بدون انقضا · میلادی · YYYY-MM-DD HH:MM"
        />
        {editing ? null : <TextInput label="کد سفارشی (اختیاری)" value={custom} onChange={setCustom} ltr maxLength={64} placeholder="خالی = خودکار" />}
        <TextInput label="یادداشت" value={note} onChange={setNote} maxLength={255} placeholder="مثلاً کمپین نوروز" />
      </FormGrid>
      {kind === "discount" ? (
        <div className="flex flex-col gap-3">
          <SwitchInput label="فقط خرید اول" help="فقط برای کاربرانی که در این فروشگاه هنوز خرید موفقی ندارند. تست رایگان و سفارش لغوشده حساب نمی‌شود." checked={firstOnly} onChange={toggleFirst} />
          <CheckGroup label="قابل استفاده برای" help="بدون انتخاب = همه نوع خرید. می‌توانید چند مورد را انتخاب کنید." options={data.purchase_types.map((t) => ({ id: t.key, label: t.label }))} selected={types} onChange={setTypes} />
          <p className="text-sm text-muted">کاربر کد تخفیف را هنگام پرداخت وارد می‌کند. سقف تخفیف روی مجموع مبلغ سفارش اعمال می‌شود.</p>
        </div>
      ) : null}
      <FormActions submitLabel={editing ? "ذخیره تنظیمات" : "ساخت کد"} pending={pending} onCancel={onCancel} cancelLabel="بستن" />
    </form>
  );
}

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
                {c.kind === "discount" ? <span className="text-xs text-muted">{c.first_purchase_only ? "فقط خرید اول" : c.purchase_label}</span> : null}
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
