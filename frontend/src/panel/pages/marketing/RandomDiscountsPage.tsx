"use client";

import { Button } from "@heroui/react";
import { useState, type FormEvent } from "react";

import { Icon } from "@/icons/Icon";
import { useLocation } from "@/lib/location";

import { run } from "../../core/actions";
import { useJson, useUrlFlash } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { StatusChip } from "../../ui/Data";
import { FormGrid, FormModal, FormSection, MoneyInput, SelectInput, TextInput } from "../../ui/Fields";
import { GlassSection, PageHeader } from "../../ui/Page";
import { Loadable } from "../../ui/States";
import { FormActions } from "../catalog/PlanParts";
import { RowActions, SelectableTable, type Column } from "../catalog/Tables";
import { MarketingStrip } from "./sections";
import type { RandomDiscountRow, RandomDiscountsData } from "./types";

const PAGE = "/random-discounts";
const MAX_WINDOW_MINUTES = 10080;

const MODES = [
  { id: "automatic", label: "خودکار" },
  { id: "code", label: "کد تخفیف" },
];
const KINDS = [
  { id: "amount", label: "مبلغ" },
  { id: "percent", label: "درصد" },
];

const COLUMNS: Column[] = [
  { id: "title", label: "عنوان", rowHeader: true },
  { id: "mode", label: "حالت" },
  { id: "range", label: "بازهٔ تخفیف" },
  { id: "step", label: "گام" },
  { id: "window", label: "جلوگیری از تکرار" },
  { id: "status", label: "وضعیت" },
  { id: "actions", label: <span className="sr-only">عملیات</span> },
];

/** «۱۰ تا ۱۰۰ تومان» or «۵ تا ۲۰٪». */
export function rangeLabel(row: Pick<RandomDiscountRow, "minimum" | "maximum" | "reduction_kind">): string {
  const unit = row.reduction_kind === "percent" ? "٪" : " تومان";
  return `${fa(row.minimum)} تا ${fa(row.maximum)}${unit}`;
}

function RandomDiscountForm({ requestKey, onSaved, onCancel }: { requestKey: string; onSaved: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("automatic");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState("amount");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [step, setStep] = useState("1");
  const [windowMinutes, setWindowMinutes] = useState("60");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const fields = { title, mode, reduction_kind: kind, minimum, maximum, step, window_minutes: windowMinutes, request_key: requestKey, ...(mode === "code" ? { code } : {}) };
      // A failed or unanswered post keeps the same key, so sending again can never create the rule twice.
      const result = await run(PAGE, fields, { success: "تخفیف تصادفی ساخته شد." });
      if (result?.ok) onSaved();
    } finally {
      setPending(false);
    }
  };

  const percent = kind === "percent";
  const bound = (label: string, value: string, onChange: (v: string) => void) =>
    percent ? (
      <TextInput label={`${label} (٪)`} type="number" min={1} max={100} value={value} onChange={onChange} required />
    ) : (
      <MoneyInput label={label} value={value} onChange={onChange} required />
    );

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <FormSection title="نحوهٔ اعمال">
        <TextInput label="عنوان" value={title} onChange={setTitle} required maxLength={128} />
        <SelectInput
          label="حالت"
          value={mode}
          onChange={setMode}
          options={MODES}
          help="خودکار برای خرید سرویس، پلن دلخواه، عمده، تمدید و حجم یا زمان اضافه؛ سرویس رایگان و شارژ کیف پول مشمول نیستند."
        />
        {mode === "code" ? (
          <TextInput label="کد تخفیف" value={code} onChange={setCode} required maxLength={64} ltr help="حروف انگلیسی، عدد، خط تیره یا زیرخط؛ مشتری همین کد را هنگام خرید وارد می‌کند." />
        ) : null}
      </FormSection>
      <FormSection title="بازهٔ تخفیف" description="حتی در بازهٔ درصدی، مبلغ تخفیف به تومان و با گام زیر انتخاب می‌شود؛ مبلغ پرداخت هرگز رایگان نمی‌شود.">
        <SelectInput label="نوع بازه" value={kind} onChange={setKind} options={KINDS} />
        <FormGrid>
          {bound("حداقل تخفیف", minimum, setMinimum)}
          {bound("حداکثر تخفیف", maximum, setMaximum)}
        </FormGrid>
        <MoneyInput label="گام انتخاب مبلغ" value={step} onChange={setStep} required help="گام کوچک‌تر، مبلغ‌های متفاوت بیشتری فراهم می‌کند. برای بازهٔ مبلغی حداکثر ده‌هزار انتخاب تعریف کنید." />
      </FormSection>
      <FormSection title="جلوگیری از تکرار" description="برای تغییر قانون، ابتدا قانون فعال را متوقف کنید و قانون تازه بسازید. مبلغ سفارش‌های قبلی ثابت می‌ماند.">
        <TextInput
          label="مدت محافظت مبلغ (دقیقه)"
          type="number"
          min={1}
          max={MAX_WINDOW_MINUTES}
          value={windowMinutes}
          onChange={setWindowMinutes}
          required
          help="از ۱ دقیقه تا ۷ روز. مبلغ سفارش‌های در انتظار پرداخت ممکن است بیشتر محفوظ بماند."
        />
      </FormSection>
      <FormActions submitLabel="ساخت تخفیف" pending={pending} onCancel={onCancel} />
    </form>
  );
}

function RandomDiscountsBody({ data, reload }: { data: RandomDiscountsData; reload: () => void }) {
  const [creating, setCreating] = useState(false);
  const stop = (row: RandomDiscountRow) => ({
    id: "stop",
    label: "توقف",
    icon: "solar:stop-circle-bold",
    tone: "danger" as const,
    confirmText: {
      message: "توقف تخفیف تصادفی",
      description: "تخفیف تصادفی برای سفارش‌های تازه متوقف می‌شود. مبلغ سفارش‌های قبلی تغییر نمی‌کند.",
      confirmLabel: "توقف",
    },
    run: () => void run(`${PAGE}/${row.id}/stop`, {}, { success: "تخفیف تصادفی متوقف شد.", refresh: reload }),
  });
  const saved = () => {
    setCreating(false);
    reload();
  };
  return (
    <>
      <MarketingStrip sections={data.sections} />
      <div className="flex flex-col gap-6">
        <GlassSection
          title="قانون‌ها"
          description={`${fa(data.discounts.length)} قانون`}
          actions={
            <Button className="button--ink !h-10 !rounded-lg" onPress={() => setCreating(true)}>
              <Icon name="solar:add-circle-bold" size={18} />
              تخفیف تازه
            </Button>
          }
        >
          <p className="text-sm leading-6 text-muted">
            تخفیف از بازهٔ انتخابی و میان مبلغ‌های آزاد همین فروشگاه تعیین می‌شود و با تلاش مجدد پرداخت تغییر نمی‌کند. در هر فروشگاه یک قانون فعال است و با کد تخفیف دیگر جمع نمی‌شود. این قابلیت
            جایگزین بررسی رسید نیست.
          </p>
          <SelectableTable
            ariaLabel="قانون‌های تخفیف تصادفی"
            columns={COLUMNS}
            rows={data.discounts}
            rowId={(row) => row.id}
            empty="هنوز تخفیف تصادفی تعریف نشده است."
            cells={(row) => [
              <bdi key="t" className="font-medium text-foreground">{row.title}</bdi>,
              <span key="m" className="flex flex-col">
                <span>{row.mode === "code" ? "کد تخفیف" : "خودکار"}</span>
                {row.code ? <bdi dir="ltr" className="font-mono text-xs text-muted">{row.code}</bdi> : null}
              </span>,
              <bdi key="r" className="num">{rangeLabel(row)}</bdi>,
              <bdi key="s" className="num">{fa(row.step)} تومان</bdi>,
              <span key="w" className="num">{fa(row.window_minutes)} دقیقه</span>,
              <StatusChip key="st" color={row.is_active ? "success" : "default"}>{row.is_active ? "فعال" : "متوقف"}</StatusChip>,
              row.is_active ? <RowActions key="a" label={`عملیات ${row.title}`} actions={[stop(row)]} /> : <span key="a" />,
            ]}
            minWidth={760}
          />
          {data.next_before ? (
            <div>
              <Button variant="outline" onPress={() => window.location.assign(`${PAGE}?before=${data.next_before}`)}>
                قانون‌های قدیمی‌تر
              </Button>
            </div>
          ) : null}
        </GlassSection>
      </div>
      <FormModal isOpen={creating} onOpenChange={setCreating} title="تخفیف تصادفی تازه" size="md">
        {creating ? <RandomDiscountForm key={data.request_key} requestKey={data.request_key} onSaved={saved} onCancel={() => setCreating(false)} /> : null}
      </FormModal>
    </>
  );
}

export function RandomDiscountsPage() {
  const { search } = useLocation();
  const before = new URLSearchParams(search).get("before");
  const list = useJson<RandomDiscountsData>(`/api/panel/random-discounts${before ? `?before=${encodeURIComponent(before)}` : ""}`);
  useUrlFlash();
  return (
    <PanelShell title="تخفیف تصادفی">
      <PageHeader icon="solar:shuffle-bold" tone="orange" title="تخفیف تصادفی" description="مبلغ متفاوت برای هر سفارش، از بازه‌ای که فروشگاه تعیین می‌کند" />
      <Loadable state={list} rows={4}>
        {(data) => <RandomDiscountsBody data={data} reload={list.reload} />}
      </Loadable>
    </PanelShell>
  );
}
