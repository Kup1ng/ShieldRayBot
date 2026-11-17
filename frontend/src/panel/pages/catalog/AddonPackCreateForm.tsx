"use client";

/** The general «بسته حجم / زمان» create form: several packs of one kind in one save, each with its own button colour. */

import { Button, Input, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";

import { Icon } from "@/icons/Icon";

import type { ActionResult } from "../../core/api";
import { digitsOnly } from "../../core/format";
import { FormGrid, SelectInput, TextInput } from "../../ui/Fields";
import { PackStyleSelect } from "./PackEditor";
import { FormActions } from "./PlanParts";
import type { PlansOverview } from "./types";
import { useFormSubmit } from "./useFormSubmit";

type Kind = "volume" | "duration";
type Row = { key: number; amount: string; price: string; style: string };

let rowCounter = 0;
const blankRow = (): Row => ({ key: ++rowCounter, amount: "", price: "", style: "inherit" });

const KIND_TEXT: Record<Kind, { unit: string; hint: string; amountHint: string; placeholder: string }> = {
  volume: { unit: "گیگ", hint: "کاربر می‌تواند این بستهٔ حجم را بخرد و به حجم سرویس فعلی‌اش اضافه کند.", amountHint: "حجم به گیگ — اعشار مجاز است", placeholder: "مثلاً ۱۰ گیگ اضافه" },
  duration: { unit: "روز", hint: "کاربر می‌تواند این بستهٔ زمان را بخرد و به مدت سرویس فعلی‌اش اضافه کند.", amountHint: "تعداد روز — فقط عدد صحیح", placeholder: "مثلاً ۷ روز اضافه" },
};

export function AddonPackCreateForm({ data, kind, onDone, onCancel }: { data: PlansOverview; kind: Kind; onDone: (result: ActionResult) => void; onCancel: () => void }) {
  const [rows, setRows] = useState<Row[]>(() => [blankRow()]);
  const [name, setName] = useState("");
  const [planId, setPlanId] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("0");
  const [description, setDescription] = useState("");
  const { pending, send } = useFormSubmit(onDone);
  const text = KIND_TEXT[kind];
  const batch = data.pack_config.user.batch;
  const several = rows.length > 1;
  const patch = (key: number, change: Partial<Row>) => setRows((all) => all.map((row) => (row.key === key ? { ...row, ...change } : row)));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(
      "/plans/addons",
      {
        kind,
        // A typed name needs a single row; several rows are named from their amounts by the handler.
        name: several ? "" : name,
        plan_id: planId,
        category_id: planId ? "" : category,
        sort_order: sort,
        description,
        amount: rows.map((row) => row.amount),
        price: rows.map((row) => row.price),
        button_style: rows.map((row) => row.style),
      },
      "بسته ذخیره شد",
    );
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <p className="text-sm text-muted">{text.hint} بستهٔ «عمومی» برای همهٔ دسته‌ها دیده می‌شود؛ برای قیمت جدا، برچسب دسته را با پلن سرویس یکی بگذارید.</p>
      <FormGrid>
        <TextInput
          label="نام بسته"
          value={several ? "" : name}
          onChange={setName}
          disabled={several}
          maxLength={128}
          placeholder="خالی: از مقدار ساخته می‌شود"
          help={several ? "برای چند بسته نام هر بسته مثل «۱۰ گیگ» از مقدارش ساخته می‌شود." : text.placeholder}
        />
        <SelectInput
          label="پلن اختصاصی (اختیاری)"
          value={planId}
          onChange={setPlanId}
          options={[{ id: "", label: "— بدون پلن (عمومی / دسته) —" }, ...data.plans.map((plan) => ({ id: String(plan.id), label: plan.name }))]}
          help="اگر پلن انتخاب شود، بسته فقط روی سرویس‌های همان پلن دیده می‌شود و دسته نادیده گرفته می‌شود. بستهٔ مخصوص پلن برای یک نوع، بسته‌های عمومی همان نوع را برای آن پلن مخفی می‌کند."
        />
        <SelectInput
          label="دسته‌ی بسته"
          value={planId ? "" : category}
          onChange={setCategory}
          disabled={Boolean(planId)}
          options={[{ id: "", label: "عمومی (همه‌ی دسته‌ها)" }, ...data.categories.filter((c) => c.is_active && c.audience === "users").map((c) => ({ id: String(c.id), label: c.name }))]}
          help="پیش‌فرض «عمومی» است و برای همهٔ سرویس‌ها دیده می‌شود. با انتخاب برچسب، فقط سرویس‌های همان دسته این بسته را می‌بینند."
        />
        <TextInput label="ترتیب" type="number" value={sort} onChange={setSort} />
      </FormGrid>
      <div className="flex flex-col gap-2">
        <div aria-hidden className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_2rem] gap-2 px-1 text-xs text-muted sm:grid">
          <span>مقدار ({text.unit})</span>
          <span>قیمت (تومان)</span>
          <span>رنگ دکمه</span>
          <span />
        </div>
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
            <div className="order-1 flex items-center gap-2">
              <TextField aria-label="مقدار بسته" type="number" isRequired value={row.amount} onChange={(amount) => patch(row.key, { amount })} className="min-w-0 flex-1">
                <Input
                  dir="ltr"
                  className="text-start"
                  min={kind === "duration" ? 1 : 0.1}
                  max={kind === "duration" ? batch.max_days : batch.max_volume_gb}
                  step={kind === "duration" ? 1 : "any"}
                  inputMode="decimal"
                  placeholder="۱۰"
                />
              </TextField>
              <span className="shrink-0 text-xs text-muted">{text.unit}</span>
            </div>
            <div className="order-4 sm:order-2">
              <TextField aria-label="قیمت بسته (تومان)" isRequired value={row.price} onChange={(raw) => patch(row.key, { price: digitsOnly(raw) })} className="min-w-0">
                <Input dir="ltr" className="text-start" inputMode="numeric" placeholder="50000" />
              </TextField>
            </div>
            <div className="order-3 min-w-0">
              <PackStyleSelect label="رنگ دکمه بسته در ربات" value={row.style} options={data.pack_style_options} onChange={(style) => patch(row.key, { style })} />
            </div>
            <Button isIconOnly size="sm" variant="ghost" className="order-2 sm:order-4" aria-label="حذف ردیف بسته" isDisabled={!several} onPress={() => setRows((all) => all.filter((r) => r.key !== row.key))}>
              <Icon name="solar:trash-bin-trash-linear" size={18} />
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" className="w-fit" isDisabled={rows.length >= batch.max_rows} onPress={() => setRows((all) => [...all, blankRow()])}>
          <Icon name="solar:add-circle-linear" size={18} />
          افزودن ردیف
        </Button>
        <p className="text-xs text-muted">{text.amountHint}</p>
      </div>
      <TextInput label="توضیح (اختیاری)" value={description} onChange={setDescription} maxLength={255} placeholder="نمایش در بات" />
      <FormActions submitLabel={several ? "افزودن بسته‌ها" : "افزودن بسته"} pending={pending} onCancel={onCancel} />
    </form>
  );
}
