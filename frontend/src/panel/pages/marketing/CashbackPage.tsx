"use client";

import { Button } from "@heroui/react";
import { useState, type FormEvent } from "react";

import { Icon } from "@/icons/Icon";

import { run } from "../../core/actions";
import { useJson, useUrlFlash } from "../../core/data";
import { fa, toman } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { StatusChip } from "../../ui/Data";
import { FormGrid, FormModal, FormSection, MoneyInput, SelectInput, SwitchInput, TextInput } from "../../ui/Fields";
import { GlassSection, PageHeader } from "../../ui/Page";
import { Loadable } from "../../ui/States";
import { FormActions } from "../catalog/PlanParts";
import { RowActions, SelectableTable, type Column } from "../catalog/Tables";
import type { CashbackData, CashbackEvent, CashbackLimits, CashbackMode, CashbackRule, CashbackSettings } from "./cashbackTypes";
import { MarketingStrip } from "./sections";

const PAGE = "/cashback";
const MAX_NAME = 128;
const MAX_PERCENT = 100;

const EVENT_LABELS: Record<CashbackEvent, string> = { new: "تازه", renew: "تمدید", addon: "اضافه" };
const EVENT_SWITCHES: Array<{ id: CashbackEvent; label: string }> = [
  { id: "new", label: "خرید تازه" },
  { id: "renew", label: "تمدید" },
  { id: "addon", label: "حجم یا زمان اضافه" },
];
const MODES = [
  { id: "percent", label: "درصدی" },
  { id: "fixed", label: "مبلغ ثابت" },
];
const COMBINE_MODES = [
  { id: "best", label: "بهترین قانون" },
  { id: "sum", label: "جمع قانون‌ها" },
];

const COLUMNS: Column[] = [
  { id: "name", label: "نام", rowHeader: true },
  { id: "value", label: "مقدار" },
  { id: "cap", label: "سقف" },
  { id: "purchases", label: "خریدها" },
  { id: "status", label: "وضعیت" },
  { id: "actions", label: <span className="sr-only">عملیات</span> },
];

/** «۱۰٪» for a percentage rule, «۷٬۰۰۰ تومان» for a fixed one. */
export function valueLabel(rule: Pick<CashbackRule, "mode" | "percent" | "fixed_amount">): string {
  return rule.mode === "fixed" ? toman(rule.fixed_amount) : `${fa(Number(rule.percent))}٪`;
}

/** The purchase kinds a rule covers, «تازه، تمدید · فقط اولین خرید». */
export function purchasesLabel(rule: Pick<CashbackRule, "events" | "first_purchase_only">): string {
  const kinds = rule.events.map((event) => EVENT_LABELS[event] ?? event).join("، ");
  return rule.first_purchase_only ? `${kinds} · فقط اولین خرید` : kinds;
}

const text = (value: number | null): string => (value === null ? "" : String(value));

function RuleForm({ rule, limits, onSaved, onCancel }: { rule: CashbackRule | null; limits: CashbackLimits; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(rule?.name ?? "");
  const [mode, setMode] = useState<CashbackMode>(rule?.mode ?? "percent");
  const [percent, setPercent] = useState(rule && rule.mode === "percent" ? rule.percent : "");
  const [fixedAmount, setFixedAmount] = useState(rule && rule.mode === "fixed" ? String(rule.fixed_amount) : "");
  const [maxPerOrder, setMaxPerOrder] = useState(text(rule?.max_per_order ?? null));
  const [minOrder, setMinOrder] = useState(String(rule?.min_order_amount ?? 0));
  const [priority, setPriority] = useState(String(rule?.priority ?? 0));
  const [customerCount, setCustomerCount] = useState(text(rule?.customer_max_count ?? null));
  const [customerAmount, setCustomerAmount] = useState(text(rule?.customer_max_amount ?? null));
  const [events, setEvents] = useState<CashbackEvent[]>(rule?.events ?? ["new", "renew", "addon"]);
  const [firstOnly, setFirstOnly] = useState(rule?.first_purchase_only ?? false);
  const [withDiscount, setWithDiscount] = useState(rule?.allow_with_discount ?? true);
  const [pending, setPending] = useState(false);

  const toggleEvent = (event: CashbackEvent, on: boolean) => setEvents((current) => (on ? [...new Set([...current, event])] : current.filter((e) => e !== event)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const fields = {
        name,
        mode,
        ...(mode === "percent" ? { percent } : { fixed_amount: fixedAmount }),
        max_per_order: maxPerOrder,
        min_order_amount: minOrder,
        priority,
        customer_max_count: customerCount,
        customer_max_amount: customerAmount,
        event_new: events.includes("new"),
        event_renew: events.includes("renew"),
        event_addon: events.includes("addon"),
        first_purchase_only: firstOnly,
        allow_with_discount: withDiscount,
      };
      const result = await run(rule ? `${PAGE}/rules/${rule.id}` : `${PAGE}/rules`, fields);
      if (result?.ok) onSaved();
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <FormSection title="قانون">
        <TextInput label="نام قانون" value={name} onChange={setName} required maxLength={MAX_NAME} placeholder="مثلاً: ۱۰٪ خرید اول" />
        <SelectInput label="نوع" value={mode} onChange={(value) => setMode(value === "fixed" ? "fixed" : "percent")} options={MODES} />
        <FormGrid>
          {mode === "percent" ? (
            <TextInput label="درصد (٪)" type="number" min={0} max={MAX_PERCENT} step="any" value={percent} onChange={setPercent} placeholder="10" ltr />
          ) : (
            <MoneyInput label="مبلغ ثابت (تومان)" value={fixedAmount} onChange={setFixedAmount} />
          )}
          <MoneyInput label="سقف هر سفارش (تومان)" value={maxPerOrder} onChange={setMaxPerOrder} placeholder="بدون سقف" />
        </FormGrid>
      </FormSection>
      <FormSection title="محدودیت‌ها">
        <FormGrid>
          <MoneyInput label="حداقل خرید (تومان)" value={minOrder} onChange={setMinOrder} />
          <TextInput label="اولویت" type="number" min={0} max={limits.max_priority} value={priority} onChange={setPriority} />
          <TextInput label="سقف تعداد هر مشتری در ماه" type="number" min={0} max={limits.max_monthly_count} value={customerCount} onChange={setCustomerCount} placeholder="بدون سقف" />
          <MoneyInput label="سقف مبلغ هر مشتری در ماه (تومان)" value={customerAmount} onChange={setCustomerAmount} placeholder="بدون سقف" />
        </FormGrid>
      </FormSection>
      <FormSection title="خریدها">
        {EVENT_SWITCHES.map((item) => (
          <SwitchInput key={item.id} label={item.label} checked={events.includes(item.id)} onChange={(on) => toggleEvent(item.id, on)} />
        ))}
        <SwitchInput label="فقط اولین خرید مشتری" checked={firstOnly} onChange={setFirstOnly} />
        <SwitchInput label="همراه با کد تخفیف هم بدهد" help="مبنای محاسبه مبلغ بعد از تخفیف است" checked={withDiscount} onChange={setWithDiscount} />
      </FormSection>
      {rule ? <p className="text-xs leading-5 text-muted">تغییر فقط روی خریدهای بعدی اثر دارد؛ کش‌بک‌های داده‌شده عوض نمی‌شوند.</p> : null}
      <FormActions submitLabel={rule ? "ذخیرهٔ قانون" : "ساخت قانون"} pending={pending} onCancel={onCancel} />
    </form>
  );
}

function SettingsSection({ settings, budgetUsed, limits, reload }: { settings: CashbackSettings; budgetUsed: number; limits: CashbackLimits; reload: () => void }) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [combine, setCombine] = useState<string>(settings.combine);
  const [holdHours, setHoldHours] = useState(String(settings.hold_hours));
  const [budget, setBudget] = useState(String(settings.monthly_budget));
  const [pending, setPending] = useState(false);

  const save = async (nextEnabled: boolean) => {
    if (pending) return;
    setPending(true);
    try {
      const fields = { enabled: nextEnabled, combine, hold_hours: holdHours, monthly_budget: budget };
      // Reloading shows what the server kept (a refused save puts the switch back) and the month's usage.
      await run(`${PAGE}/settings`, fields, { success: "تنظیمات کش‌بک ذخیره شد", refresh: reload });
    } finally {
      setPending(false);
    }
  };
  // The old page saved on flipping the switch, together with the other fields.
  const flip = (on: boolean) => {
    setEnabled(on);
    void save(on);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save(enabled);
  };

  return (
    <GlassSection title="کش‌بک" description="بخشی از مبلغ خرید بعد از تحویل به کیف پول مشتری در همین فروشگاه برمی‌گردد.">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <SwitchInput label="کش‌بک روشن" checked={enabled} onChange={flip} disabled={pending} />
        {enabled ? (
          <>
            <FormGrid cols={3}>
              <SelectInput label="ترکیب قانون‌ها" value={combine} onChange={setCombine} options={COMBINE_MODES} />
              <TextInput
                label="دورهٔ انتظار (ساعت)"
                type="number"
                min={0}
                max={limits.max_hold_hours}
                value={holdHours}
                onChange={setHoldHours}
                help="تا این مدت بعد از تحویل، کش‌بک قابل خرج نیست"
              />
              <MoneyInput
                label="بودجهٔ ماهانه (تومان)"
                value={budget}
                onChange={setBudget}
                help={
                  <>
                    ۰ یعنی بدون سقف · مصرف این ماه: <bdi dir="ltr" className="num">{toman(budgetUsed)}</bdi>
                  </>
                }
              />
            </FormGrid>
            <FormActions submitLabel="ذخیرهٔ تنظیمات" pending={pending} />
          </>
        ) : null}
      </form>
    </GlassSection>
  );
}

function CashbackBody({ data, reload }: { data: CashbackData; reload: () => void }) {
  const [editing, setEditing] = useState<CashbackRule | "new" | null>(null);
  const rule = editing === "new" ? null : editing;
  const saved = () => {
    setEditing(null);
    reload();
  };
  const actionsOf = (row: CashbackRule) => [
    { id: "edit", label: "ویرایش", icon: "solar:pen-bold", run: () => setEditing(row) },
    {
      id: "toggle",
      label: row.enabled ? "خاموش کردن" : "روشن کردن",
      icon: "solar:power-bold",
      // The handler turns a rule on only when «enabled» is posted.
      run: () => void run(`${PAGE}/rules/${row.id}/toggle`, row.enabled ? {} : { enabled: true }, { success: "وضعیت قانون ذخیره شد", refresh: reload }),
    },
    {
      id: "delete",
      label: "حذف",
      icon: "solar:trash-bin-trash-bold",
      tone: "danger" as const,
      confirmText: { message: "حذف قانون", description: "این قانون حذف شود؟ کش‌بک‌هایی که قبلاً داده شده عوض نمی‌شوند.", confirmLabel: "حذف" },
      run: () => void run(`${PAGE}/rules/${row.id}/delete`, {}, { success: "قانون کش‌بک حذف شد", refresh: reload }),
    },
  ];
  return (
    <>
      <MarketingStrip sections={data.sections} />
      <div className="flex flex-col gap-6">
        <SettingsSection key={JSON.stringify(data.settings)} settings={data.settings} budgetUsed={data.budget_used} limits={data.limits} reload={reload} />
        <GlassSection
          title="قانون‌ها"
          description={`${fa(data.rules.length)} قانون`}
          actions={
            <Button className="button--ink !h-10 !rounded-lg" onPress={() => setEditing("new")}>
              <Icon name="solar:add-circle-bold" size={18} />
              قانون تازه
            </Button>
          }
        >
          <SelectableTable
            ariaLabel="قانون‌های کش‌بک"
            columns={COLUMNS}
            rows={data.rules}
            rowId={(row) => row.id}
            empty="هنوز قانونی ساخته نشده است."
            cells={(row) => [
              <bdi key="n" className="font-medium text-foreground">{row.name}</bdi>,
              <bdi key="v" dir="ltr" className="num">{valueLabel(row)}</bdi>,
              <bdi key="c" dir="ltr" className="num">{row.max_per_order === null ? "—" : toman(row.max_per_order)}</bdi>,
              <span key="p" className="text-sm text-muted">{purchasesLabel(row)}</span>,
              <StatusChip key="s" color={row.enabled ? "success" : "default"}>{row.enabled ? "روشن" : "خاموش"}</StatusChip>,
              <RowActions key="a" label={`عملیات ${row.name}`} actions={actionsOf(row)} />,
            ]}
            minWidth={720}
          />
        </GlassSection>
      </div>
      <FormModal isOpen={editing !== null} onOpenChange={(open) => !open && setEditing(null)} title={rule ? "ویرایش قانون کش‌بک" : "قانون تازهٔ کش‌بک"} size="md">
        {editing !== null ? <RuleForm key={rule?.id ?? "new"} rule={rule} limits={data.limits} onSaved={saved} onCancel={() => setEditing(null)} /> : null}
      </FormModal>
    </>
  );
}

export function CashbackPage() {
  const list = useJson<CashbackData>("/api/panel/cashback");
  useUrlFlash();
  return (
    <PanelShell title="کش‌بک">
      <PageHeader icon="solar:gift-bold" tone="orange" title="کش‌بک" description="بازگشت بخشی از مبلغ خرید به کیف پول مشتری" />
      <Loadable state={list} rows={4}>
        {(data) => <CashbackBody data={data} reload={list.reload} />}
      </Loadable>
    </PanelShell>
  );
}
