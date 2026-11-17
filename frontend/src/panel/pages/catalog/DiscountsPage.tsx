"use client";

import { Button } from "@heroui/react";
import { useState, type FormEvent } from "react";

import { useLocation } from "@/lib/location";

import { run } from "../../core/actions";
import { useJson, useUrlFlash } from "../../core/data";
import { fa, type ChipColor } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { StatusChip } from "../../ui/Data";
import { FormGrid, SelectInput, SwitchInput, TextInput } from "../../ui/Fields";
import { GlassSection, PageHeader } from "../../ui/Page";
import { SectionTabs } from "../../ui/SectionTabs";
import { Loadable } from "../../ui/States";
import { FormActions } from "./PlanParts";
import { RowActions, SelectableTable, type Column } from "./Tables";
import type { DiscountRow, DiscountsData } from "./types";

const ANNOUNCEMENT: Record<string, { label: string; tone: ChipColor }> = {
  running: { label: "در صف ارسال", tone: "accent" },
  paused: { label: "متوقف", tone: "warning" },
  completed: { label: "تکمیل‌شده", tone: "success" },
  review: { label: "نیازمند بررسی", tone: "danger" },
};
const ANNOUNCEMENT_DEFAULT = { label: "ثبت‌شده", tone: "default" as ChipColor };

const COLUMNS: Column[] = [
  { id: "title", label: "عنوان", rowHeader: true },
  { id: "scope", label: "محدوده" },
  { id: "mode", label: "حالت" },
  { id: "reduction", label: "کاهش" },
  { id: "ends", label: "پایان" },
  { id: "status", label: "وضعیت" },
  { id: "announcement", label: "اطلاع‌رسانی" },
  { id: "actions", label: <span className="sr-only">عملیات</span> },
];

function DiscountForm({ data, onSaved }: { data: DiscountsData; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState(data.scopes[0]?.key ?? "plan");
  const [mode, setMode] = useState(data.modes[0]?.key ?? "temporary");
  const [plan, setPlan] = useState("");
  const [category, setCategory] = useState("");
  const [kind, setKind] = useState("percent");
  const [value, setValue] = useState("");
  const [hours, setHours] = useState("24");
  const [notify, setNotify] = useState(true);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      const result = await run("/catalog-discounts", { title, scope, mode, plan_id: plan, category_id: category, reduction_kind: kind, reduction_value: value, duration_hours: hours, notify, request_key: data.request_key }, { success: "تغییر قیمت ثبت شد" });
      // A new request key comes with the reloaded data (the form is keyed by it); a failed or
      // unanswered post keeps the same key, so posting again can never create the change twice.
      if (result?.ok) onSaved();
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <TextInput label="عنوان اطلاع‌رسانی" value={title} onChange={setTitle} required maxLength={128} />
      <FormGrid>
        <SelectInput label="محدوده" value={scope} onChange={setScope} options={data.scopes.map((s) => ({ id: s.key, label: s.label }))} help="همهٔ بخش‌ها شامل پلن ثابت، دلخواه، تمدید، خرید عمده و بستهٔ حجم و زمان است." />
        <SelectInput label="حالت" value={mode} onChange={setMode} options={data.modes.map((m) => ({ id: m.key, label: m.label }))} help="در محدوده‌های هم‌زمان، بیشترین کاهش هر حالت اعمال می‌شود؛ کاهش دائمی ابتدا قیمت پایه را تعیین می‌کند." />
        <SelectInput
          label="سرویس / پلن"
          value={plan}
          onChange={setPlan}
          disabled={scope !== "plan"}
          options={[{ id: "", label: "انتخاب کنید" }, ...data.plans.map((p) => ({ id: String(p.id), label: p.name }))]}
          help="فقط برای محدودهٔ یک سرویس"
        />
        <SelectInput
          label="دسته‌بندی"
          value={category}
          onChange={setCategory}
          disabled={scope !== "category"}
          options={[{ id: "", label: "انتخاب کنید" }, ...data.categories.map((c) => ({ id: String(c.id), label: c.name }))]}
          help="فقط برای محدودهٔ یک دسته؛ شامل پلن‌ها و بسته‌های همان دسته است."
        />
        <SelectInput
          label="نوع کاهش"
          value={kind}
          onChange={setKind}
          options={[
            { id: "percent", label: "درصد" },
            { id: "amount", label: "مبلغ ثابت (تومان)" },
          ]}
        />
        <TextInput label="مقدار کاهش" type="number" min={1} max={2000000000} value={value} onChange={setValue} required ltr />
        <TextInput label="مدت (ساعت)" type="number" min={1} max={8760} value={hours} onChange={setHours} ltr disabled={mode !== "temporary"} help="فقط برای تخفیف زمان‌دار" />
      </FormGrid>
      <SwitchInput label="اطلاع‌رسانی به مشتریان" help="پیام به مشتریان همین فروشگاه، با ذکر مدت تخفیف، در صف ارسال قرار می‌گیرد." checked={notify} onChange={setNotify} />
      <FormActions submitLabel="ثبت قیمت و صف اطلاع‌رسانی" pending={pending} />
    </form>
  );
}

function DiscountsBody({ data, reload }: { data: DiscountsData; reload: () => void }) {
  const scopeLabel = (key: string) => data.scopes.find((s) => s.key === key)?.label ?? key;
  const modeLabel = (key: string) => data.modes.find((m) => m.key === key)?.label ?? key;
  const actions = (row: DiscountRow) =>
    row.is_active
      ? [
          {
            id: "stop",
            label: "توقف",
            icon: "solar:stop-circle-bold",
            tone: "danger" as const,
            confirmText: {
              message: "این تغییر قیمت متوقف می‌شود و قیمت‌ها با قوانین باقی‌مانده محاسبه می‌شوند. اطلاع‌رسانی باقی‌مانده نیز متوقف می‌شود. ادامه می‌دهید؟",
              description: "توقف تغییر قیمت",
              confirmLabel: "توقف",
            },
            run: async () => {
              await run(`/catalog-discounts/${row.id}/stop`, {}, { success: "تغییر قیمت متوقف شد" });
              reload();
            },
          },
        ]
      : [];
  const announcementChip = (row: DiscountRow) => {
    if (!row.has_announcement) return <span className="text-muted">—</span>;
    const info = (row.announcement && ANNOUNCEMENT[row.announcement]) || ANNOUNCEMENT_DEFAULT;
    return <StatusChip color={info.tone}>{info.label}</StatusChip>;
  };

  return (
    <>
      <SectionTabs label="بازاریابی و وفاداری" items={data.tabs} active={data.tabs.find((tab) => tab.active)?.key ?? ""} />
      <div className="flex flex-col gap-6">
        <GlassSection title="تخفیف جدید یا کاهش دائمی قیمت" description="کاهش دائمی قیمت را بدون برچسب تغییر می‌دهد. تخفیف زمان‌دار قیمت قبلی و جدید را نشان می‌دهد و بعد از پایان خودکار برداشته می‌شود. پلن تست رایگان تغییر نمی‌کند.">
          <DiscountForm key={data.request_key} data={data} onSaved={reload} />
        </GlassSection>
        <GlassSection title="تاریخچه" description={`${fa(data.rows.length)} تغییر قیمت`}>
          <SelectableTable
            ariaLabel="تاریخچه تغییر قیمت"
            columns={COLUMNS}
            rows={data.rows}
            rowId={(r) => r.id}
            empty="هنوز تغییری در قیمت ثبت نشده است."
            cells={(r) => [
              <bdi key="t" className="font-medium text-foreground">{r.title}</bdi>,
              scopeLabel(r.scope),
              modeLabel(r.mode),
              <bdi key="r" className="num">
                {r.reduction_kind === "percent" ? `${fa(r.reduction_value)}٪` : `${fa(r.reduction_value)} تومان`}
              </bdi>,
              r.ends_at ? (
                <span key="e" className="flex flex-col">
                  <bdi dir="ltr" className="num">{r.ends_at}</bdi>
                  <span className="text-xs text-muted">(تهران)</span>
                </span>
              ) : (
                "دائمی"
              ),
              <StatusChip key="s" color={r.is_active ? "success" : "default"}>{r.is_active ? "ثبت‌شده" : "متوقف‌شده"}</StatusChip>,
              announcementChip(r),
              r.is_active ? <RowActions key="a" label={`عملیات ${r.title}`} actions={actions(r)} /> : <span key="a" />,
            ]}
            minWidth={820}
          />
          {data.next_before ? (
            <div>
              <Button variant="outline" onPress={() => window.location.assign(`/catalog-discounts?before=${data.next_before}`)}>
                تاریخچهٔ قدیمی‌تر
              </Button>
            </div>
          ) : null}
        </GlassSection>
      </div>
    </>
  );
}

export function DiscountsPage() {
  const { search } = useLocation();
  const list = useJson<DiscountsData>(`/api/panel/catalog-discounts${search}`);
  useUrlFlash();
  return (
    <PanelShell title="تخفیف‌ها">
      <PageHeader icon="solar:sale-bold" tone="orange" title="تخفیف‌ها" description="کاهش قیمت دائمی یا زمان‌دار، با اطلاع‌رسانی به مشتریان همین فروشگاه" />
      <Loadable state={list} rows={4}>
        {(data) => <DiscountsBody data={data} reload={list.reload} />}
      </Loadable>
    </PanelShell>
  );
}
