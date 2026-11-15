"use client";

import { Button } from "@heroui/react";
import { useState, type FormEvent } from "react";

import type { ActionResult } from "../../core/api";
import { FormGrid, FormSection, MoneyInput, SelectInput, SwitchInput, TextInput } from "../../ui/Fields";
import { serializeTiers } from "./format";
import { Notice } from "../../ui/States";
import { ButtonStyleField, CategorySelect, FormActions, NamingFields, PgSourceFields, durationHelp, groupFields, volumeHelp, type SourceMode } from "./PlanParts";
import type { CustomPlan, Naming, PlanEdit, PlansOverview, TrialPlan, WholesalePlan } from "./types";
import { useFormSubmit } from "./useFormSubmit";

type Done = (result: ActionResult) => void;
type Common = { data: PlansOverview; onDone: Done; onCancel: () => void };

const gbText = (gb: number | null | undefined) => (gb === null || gb === undefined ? "" : String(gb));
const submitOn = (handler: () => void) => (event: FormEvent) => {
  event.preventDefault();
  handler();
};
const usersCategories = (data: PlansOverview) => data.categories.filter((c) => c.is_active && c.audience === "users");

/* ───────── fixed plan (create) ───────── */

export function FixedPlanForm({ data, onDone, onCancel }: Common) {
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("30");
  const [gb, setGb] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<SourceMode>("custom");
  const [groups, setGroups] = useState<string[]>([]);
  const [alsoTemplate, setAlsoTemplate] = useState(false);
  const [template, setTemplate] = useState("");
  const [naming, setNaming] = useState<Naming>({ prefix: "", suffix: "", pattern: "" });
  const [style, setStyle] = useState("inherit");
  const { pending, send } = useFormSubmit(onDone);

  const submit = () =>
    send(
      "/plans",
      {
        category_id: category,
        name,
        price,
        duration_days: days,
        data_limit_gb: gb,
        description,
        mode,
        ...(mode === "template" ? { pg_template_id: template } : { ...groupFields(groups), also_create_template: alsoTemplate }),
        pg_username_prefix: naming.prefix,
        pg_username_suffix: naming.suffix,
        pg_username_pattern: naming.pattern,
        button_style: style,
      },
      "پلن ذخیره شد",
    );

  return (
    <form className="flex flex-col gap-4" onSubmit={submitOn(() => void submit())}>
      <CategorySelect value={category} onChange={setCategory} categories={usersCategories(data)} help="برچسب نمایش در بات — بسته‌های حجم/زمان همین دسته فقط روی سرویس‌های همین برچسب دیده می‌شوند" />
      <FormGrid>
        <TextInput label="نام پلن" value={name} onChange={setName} required placeholder="مثلاً ویژه ۴۰ گیگ" />
        <MoneyInput label="قیمت (تومان)" value={price} onChange={setPrice} required placeholder="150000" />
        <TextInput label="مدت (روز)" type="number" min={0} value={days} onChange={setDays} placeholder="خالی = نامحدود" help={durationHelp(data.limits)} />
        <TextInput label="حجم (گیگ)" type="number" min={0} step={0.1} value={gb} onChange={setGb} placeholder="خالی = نامحدود" help={volumeHelp(data.limits)} />
      </FormGrid>
      <TextInput label="توضیح کوتاه" value={description} onChange={setDescription} placeholder="نمایش در بات" />
      <PgSourceFields
        mode={mode}
        onMode={setMode}
        groups={data.groups}
        templates={data.templates}
        selectedGroups={groups}
        onGroups={setGroups}
        templateId={template}
        onTemplate={setTemplate}
        groupLabel="گروه‌های پاسارگارد (حداقل یکی)"
        extra={data.can_create_template ? <SwitchInput label="همزمان تمپلیت مشابه در پاسارگارد هم ساخته شود" checked={alsoTemplate} onChange={setAlsoTemplate} /> : null}
      />
      <NamingFields naming={naming} onChange={setNaming} defaults={data.naming_defaults} volumeGb={gb} />
      <ButtonStyleField value={style} onChange={setStyle} options={data.plan_style_options} />
      <FormActions submitLabel="ذخیره پلن" pending={pending} onCancel={onCancel} />
    </form>
  );
}

/* ───────── trial ───────── */

export function TrialForm({ data, onDone, onCancel }: Common) {
  const trial: TrialPlan = data.trial;
  const [enabled, setEnabled] = useState(trial.enabled);
  const [name, setName] = useState(trial.name);
  const [days, setDays] = useState(String(trial.duration_days));
  const [gb, setGb] = useState(gbText(trial.data_limit_gb));
  const [mode, setMode] = useState<SourceMode>(trial.pg_template_id ? "template" : "custom");
  const [groups, setGroups] = useState<string[]>(trial.pg_group_ids);
  const [template, setTemplate] = useState(trial.pg_template_id ? String(trial.pg_template_id) : "");
  const [naming, setNaming] = useState<Naming>(trial.naming);
  const [style, setStyle] = useState(trial.button_style);
  const { pending, send } = useFormSubmit(onDone);

  const submit = () =>
    send(
      "/plans/trial",
      {
        trial_enabled: enabled,
        name,
        duration_days: days,
        data_limit_gb: gb,
        mode,
        ...(mode === "template" ? { pg_template_id: template } : groupFields(groups)),
        pg_username_prefix: naming.prefix,
        pg_username_suffix: naming.suffix,
        pg_username_pattern: naming.pattern,
        button_style: style,
      },
      "تنظیمات پلن تست ذخیره شد",
    );

  return (
    <form className="flex flex-col gap-4" onSubmit={submitOn(() => void submit())}>
      <p className="text-sm text-muted">حجم، مدت و اتصال پاسارگارد برای تست — از فروشگاه فقط یک‌بار به کاربر نشان داده می‌شود.</p>
      <SwitchInput label="نمایش پلن تست در فروشگاه" checked={enabled} onChange={setEnabled} />
      <FormGrid cols={3}>
        <TextInput label="نام" value={name} onChange={setName} required />
        <TextInput
          label="مدت (روز)"
          type="number"
          min={1}
          value={days}
          onChange={setDays}
          required
          help={data.limits.per_user_expire_max_days ? `سقف زنده: ${data.limits.per_user_expire_max_days.toLocaleString("fa-IR")} روز` : undefined}
        />
        <TextInput label="حجم (گیگ)" type="number" min={0} step={0.1} value={gb} onChange={setGb} placeholder="خالی = نامحدود" help={volumeHelp(data.limits)} />
      </FormGrid>
      <PgSourceFields
        mode={mode}
        onMode={setMode}
        groups={data.groups}
        templates={data.templates}
        selectedGroups={groups}
        onGroups={setGroups}
        templateId={template}
        onTemplate={setTemplate}
        modeLabels={["سفارشی (گروه + حجم + مدت)", "از تمپلیت آماده"]}
      />
      <NamingFields naming={naming} onChange={setNaming} defaults={data.naming_defaults} volumeGb={gb} />
      <ButtonStyleField value={style} onChange={setStyle} options={data.plan_style_options} />
      <FormActions submitLabel="ذخیره پلن تست" pending={pending} onCancel={onCancel} />
    </form>
  );
}

/* ───────── custom plan ───────── */

export function CustomForm({ data, onDone, onCancel }: Common) {
  const custom: CustomPlan = data.custom;
  const [enabled, setEnabled] = useState(custom.enabled);
  const [perGb, setPerGb] = useState(custom.price_per_gb);
  const [perDay, setPerDay] = useState(custom.price_per_day);
  const [minGb, setMinGb] = useState(custom.min_gb);
  const [maxGb, setMaxGb] = useState(custom.max_gb);
  const [minDays, setMinDays] = useState(custom.min_days);
  const [maxDays, setMaxDays] = useState(custom.max_days);
  const [mode, setMode] = useState<SourceMode>(custom.template_id ? "template" : "custom");
  const [groups, setGroups] = useState<string[]>(custom.group_ids);
  const [template, setTemplate] = useState(custom.template_id ?? "");
  const [naming, setNaming] = useState<Naming>(custom.naming);
  const [style, setStyle] = useState(custom.button_style);
  const { pending, send } = useFormSubmit(onDone);

  const submit = () =>
    send(
      "/plans/custom",
      {
        custom_plan_enabled: enabled,
        custom_plan_price_per_gb: perGb,
        custom_plan_price_per_day: perDay,
        custom_plan_min_gb: minGb,
        custom_plan_max_gb: maxGb,
        custom_plan_min_days: minDays,
        custom_plan_max_days: maxDays,
        mode,
        ...(mode === "template" ? { custom_plan_template_id: template } : groupFields(groups)),
        custom_plan_username_prefix: naming.prefix,
        custom_plan_username_suffix: naming.suffix,
        custom_plan_username_pattern: naming.pattern,
        custom_plan_button_style: style,
      },
      "تنظیمات پلن دلخواه ذخیره شد",
    );

  return (
    <form className="flex flex-col gap-4" onSubmit={submitOn(() => void submit())}>
      <p className="text-sm text-muted">کاربر در بات حجم و روز دلخواه می‌چیند؛ قیمت از روی هر گیگ/روز حساب می‌شود.</p>
      {custom.limit_issue ? <Notice>{custom.limit_issue}</Notice> : null}
      <SwitchInput label="فعال‌سازی پلن دلخواه در فروشگاه" checked={enabled} onChange={setEnabled} />
      <FormGrid>
        <MoneyInput label="قیمت هر گیگ (تومان)" value={perGb} onChange={setPerGb} />
        <MoneyInput label="قیمت هر روز (تومان)" value={perDay} onChange={setPerDay} />
        <div className="flex min-w-0 flex-col gap-1">
          <FormGrid>
            <TextInput label="حداقل گیگ" type="number" min={1} value={minGb} onChange={setMinGb} />
            <TextInput label="حداکثر گیگ" type="number" min={1} value={maxGb} onChange={setMaxGb} />
          </FormGrid>
          {data.limits.per_user_data_max_text ? <p className="text-xs text-muted">سقف زنده حداکثر: {data.limits.per_user_data_max_text}</p> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <FormGrid>
            <TextInput label="حداقل روز" type="number" min={1} value={minDays} onChange={setMinDays} />
            <TextInput label="حداکثر روز" type="number" min={1} value={maxDays} onChange={setMaxDays} />
          </FormGrid>
          {data.limits.per_user_expire_max_days ? <p className="text-xs text-muted">سقف زنده حداکثر: {data.limits.per_user_expire_max_days.toLocaleString("fa-IR")} روز</p> : null}
        </div>
      </FormGrid>
      <PgSourceFields
        mode={mode}
        onMode={setMode}
        groups={data.groups}
        templates={data.templates}
        selectedGroups={groups}
        onGroups={setGroups}
        templateId={template}
        onTemplate={setTemplate}
        modeLabels={["گروه اینباند", "تمپلیت"]}
        groupLabel="گروه‌ها"
      />
      <NamingFields naming={naming} onChange={setNaming} defaults={data.naming_defaults} volumeGb="" />
      <ButtonStyleField value={style} onChange={setStyle} options={data.plan_style_options} />
      <FormActions submitLabel="ذخیره پلن دلخواه" pending={pending} onCancel={onCancel} />
    </form>
  );
}

/* ───────── wholesale ───────── */

type TierRow = { key: number; min: string; percent: string };

export function WholesaleForm({ data, onDone, onCancel }: Common) {
  const wholesale: WholesalePlan = data.wholesale;
  const [enabled, setEnabled] = useState(wholesale.enabled);
  const [minQty, setMinQty] = useState(wholesale.min_qty);
  const [maxQty, setMaxQty] = useState(wholesale.max_qty);
  const [button, setButton] = useState(wholesale.button_text);
  const [nextKey, setNextKey] = useState(wholesale.tiers.length);
  const [tiers, setTiers] = useState<TierRow[]>(wholesale.tiers.map((t, key) => ({ key, min: String(t.min), percent: String(t.percent) })));
  const { pending, send } = useFormSubmit(onDone);

  const patch = (key: number, change: Partial<TierRow>) => setTiers((rows) => rows.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const submit = () =>
    send(
      "/plans/wholesale",
      {
        wholesale_enabled: enabled,
        wholesale_min_qty: minQty,
        wholesale_max_qty: maxQty,
        btn_wholesale: button,
        wholesale_tiers: serializeTiers(tiers),
      },
      "تنظیمات فروش عمده ذخیره شد",
    );

  return (
    <form className="flex flex-col gap-4" onSubmit={submitOn(() => void submit())}>
      <p className="text-sm text-muted">کاربر در ربات نوع سرویس و تعداد را انتخاب می‌کند؛ تخفیف پلکانی بر اساس تعداد اعمال می‌شود.</p>
      <SwitchInput label="فعال‌سازی فروش عمده در فروشگاه" checked={enabled} onChange={setEnabled} />
      <FormGrid cols={3}>
        <TextInput label="حداقل تعداد خرید" type="number" min={1} value={minQty} onChange={setMinQty} required />
        <TextInput label="حداکثر تعداد خرید" type="number" min={1} value={maxQty} onChange={setMaxQty} required />
        <TextInput label="متن دکمه در ربات" value={button} onChange={setButton} />
      </FormGrid>
      <FormSection title="پله‌های تخفیف" description="مثلاً از ۵ عدد ۱۰٪ و از ۲۰ عدد ۲۰٪ — تعداد و درصد را تنظیم کنید.">
        {tiers.map((tier) => (
          <div key={tier.key} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
            <TextInput label="از تعداد" type="number" min={1} value={tier.min} onChange={(min) => patch(tier.key, { min })} />
            <TextInput label="درصد تخفیف" type="number" min={0} max={100} value={tier.percent} onChange={(percent) => patch(tier.key, { percent })} />
            <Button type="button" variant="ghost" className="!h-10" onPress={() => setTiers((rows) => rows.filter((r) => r.key !== tier.key))}>
              حذف
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          className="w-fit"
          onPress={() => {
            setTiers((rows) => [...rows, { key: nextKey, min: "1", percent: "5" }]);
            setNextKey((k) => k + 1);
          }}
        >
          + پله تخفیف
        </Button>
      </FormSection>
      <FormActions submitLabel="ذخیره فروش عمده" pending={pending} onCancel={onCancel} />
    </form>
  );
}

/* ───────── service add-on pack (create and edit) ───────── */

export type PackDraft = { id: number | null; name: string; kind: "volume" | "duration"; category: string; amount: string; price: string; sort: string; description: string };

export const EMPTY_PACK: PackDraft = { id: null, name: "", kind: "volume", category: "", amount: "", price: "", sort: "0", description: "" };

export function AddonPackForm({ data, initial, fixedKind, onDone, onCancel }: Common & { initial: PackDraft; fixedKind?: "volume" | "duration" }) {
  const [draft, setDraft] = useState<PackDraft>(fixedKind ? { ...initial, kind: fixedKind } : initial);
  const { pending, send } = useFormSubmit(onDone);
  const days = draft.kind === "duration";
  const set = (change: Partial<PackDraft>) => setDraft((d) => ({ ...d, ...change }));
  const editing = draft.id !== null;

  const submit = () =>
    send(
      editing ? `/plans/addons/${draft.id}/edit` : "/plans/addons",
      {
        name: draft.name,
        kind: draft.kind,
        category_id: draft.category,
        amount: draft.amount,
        price: draft.price,
        sort_order: draft.sort,
        description: draft.description,
      },
      "بسته ذخیره شد",
    );

  return (
    <form className="flex flex-col gap-4" onSubmit={submitOn(() => void submit())}>
      <p className="text-sm text-muted">
        {days ? "کاربر می‌تواند این بستهٔ زمان را بخرد و به مدت سرویس فعلی‌اش اضافه کند." : "کاربر می‌تواند این بستهٔ حجم را بخرد و به حجم سرویس فعلی‌اش اضافه کند."} بستهٔ «عمومی» برای همهٔ دسته‌ها دیده می‌شود؛ برای قیمت جدا، برچسب دسته را با پلن سرویس یکی بگذارید.
      </p>
      <FormGrid>
        <TextInput label="نام بسته" value={draft.name} onChange={(name) => set({ name })} required maxLength={128} placeholder={days ? "مثلاً ۷ روز اضافه" : "مثلاً ۱۰ گیگ اضافه"} />
        {fixedKind ? null : (
          <SelectInput
            label="نوع"
            value={draft.kind}
            onChange={(kind) => set({ kind: kind === "duration" ? "duration" : "volume" })}
            options={[
              { id: "volume", label: "حجم (گیگ)" },
              { id: "duration", label: "زمان (روز)" },
            ]}
          />
        )}
        <SelectInput
          label="دسته‌ی بسته"
          value={draft.category}
          onChange={(category) => set({ category })}
          options={[{ id: "", label: "عمومی (همه‌ی دسته‌ها)" }, ...usersCategories(data).map((c) => ({ id: String(c.id), label: c.name }))]}
          help="پیش‌فرض «عمومی» است و برای همهٔ سرویس‌ها دیده می‌شود. با انتخاب برچسب، فقط برای سرویس‌های همان برچسب نمایش داده می‌شود."
        />
        <TextInput
          label="مقدار"
          type="number"
          min={days ? 1 : 0.1}
          step={days ? 1 : 0.1}
          value={draft.amount}
          onChange={(amount) => set({ amount })}
          required
          placeholder="۱۰"
          help={days ? "تعداد روز — فقط عدد صحیح" : "حجم به گیگ — اعشار مجاز است"}
        />
        <MoneyInput label="قیمت (تومان)" value={draft.price} onChange={(price) => set({ price })} required placeholder="50000" />
        <TextInput label="ترتیب" type="number" value={draft.sort} onChange={(sort) => set({ sort })} />
      </FormGrid>
      <TextInput label="توضیح (اختیاری)" value={draft.description} onChange={(description) => set({ description })} maxLength={255} placeholder="نمایش در بات" />
      <FormActions submitLabel={editing ? "ذخیره تغییرات" : "ذخیره بسته"} pending={pending} onCancel={onCancel} />
    </form>
  );
}

/* ───────── sales plan edit page ───────── */

export function PlanEditForm({ data, onDone, onCancel }: { data: PlanEdit; onDone: Done; onCancel: () => void }) {
  const plan = data.plan;
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(String(plan.price));
  const [days, setDays] = useState(plan.duration_days ? String(plan.duration_days) : "");
  const [gb, setGb] = useState(gbText(plan.data_limit_gb));
  const [description, setDescription] = useState(plan.description);
  const [category, setCategory] = useState(plan.category_id ? String(plan.category_id) : "");
  const [sort, setSort] = useState(String(plan.sort_order));
  const [mode, setMode] = useState<SourceMode>(plan.pg_template_id ? "template" : "custom");
  const [groups, setGroups] = useState<string[]>(plan.pg_group_ids);
  const [template, setTemplate] = useState(plan.pg_template_id ? String(plan.pg_template_id) : "");
  const [naming, setNaming] = useState<Naming>(plan.naming);
  const [style, setStyle] = useState(plan.button_style);
  const { pending, send } = useFormSubmit(onDone);

  const submit = () =>
    send(
      `/plans/${plan.id}/edit`,
      {
        name,
        price,
        duration_days: days,
        data_limit_gb: gb,
        description,
        category_id: category,
        sort_order: sort,
        mode,
        ...(mode === "template" ? { pg_template_id: template } : groupFields(groups)),
        pg_username_prefix: naming.prefix,
        pg_username_suffix: naming.suffix,
        pg_username_pattern: naming.pattern,
        button_style: style,
      },
      "پلن به‌روزرسانی شد",
    );

  return (
    <form className="flex flex-col gap-4" onSubmit={submitOn(() => void submit())}>
      <FormGrid>
        <TextInput label="نام پلن" value={name} onChange={setName} required />
        <MoneyInput label="قیمت (تومان)" value={price} onChange={setPrice} required />
        <TextInput label="مدت (روز)" type="number" min={0} value={days} onChange={setDays} placeholder="خالی = نامحدود" help={durationHelp(data.limits)} />
        <TextInput label="حجم (گیگ)" type="number" min={0} step={0.1} value={gb} onChange={setGb} placeholder="خالی = نامحدود" help={volumeHelp(data.limits)} />
      </FormGrid>
      <TextInput label="توضیح کوتاه" value={description} onChange={setDescription} placeholder="نمایش در بات" />
      <FormGrid>
        <CategorySelect value={category} onChange={setCategory} categories={data.categories} help="نوع پلن (ثابت/تست/…) عوض نمی‌شود؛ برچسب خاموش فعلی قابل نگه‌داشتن است" />
        <TextInput label="ترتیب نمایش" type="number" value={sort} onChange={setSort} />
      </FormGrid>
      <PgSourceFields
        mode={mode}
        onMode={setMode}
        groups={data.groups}
        templates={data.templates}
        selectedGroups={groups}
        onGroups={setGroups}
        templateId={template}
        onTemplate={setTemplate}
        groupLabel="گروه‌های پاسارگارد (حداقل یکی)"
      />
      <NamingFields naming={naming} onChange={setNaming} defaults={data.naming_defaults} volumeGb={gb} />
      <ButtonStyleField value={style} onChange={setStyle} options={data.plan_style_options} />
      <FormActions submitLabel="ذخیره تغییرات" pending={pending} onCancel={onCancel} />
    </form>
  );
}
