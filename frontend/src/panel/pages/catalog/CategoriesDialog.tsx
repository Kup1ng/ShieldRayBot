"use client";

import { Tooltip } from "@heroui/react";
import { useState, type FormEvent } from "react";

import { run } from "../../core/actions";
import { fa } from "../../core/format";
import { FormGrid, FormModal, SelectInput, TextInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { ButtonStyleField, FormActions } from "./PlanParts";
import { ActiveChip, RowActions, SelectableTable, type Column, type RowAction } from "./Tables";
import type { CategoryRow, StyleOption } from "./types";
import { useFormSubmit } from "./useFormSubmit";

const STYLE_LABELS: Record<string, string> = { inherit: "ارث", "": "سفید", primary: "آبی", success: "سبز", danger: "قرمز" };

const COLUMNS: Column[] = [
  { id: "name", label: "نام", rowHeader: true },
  { id: "audience", label: "مخاطب" },
  { id: "color", label: "رنگ دکمه" },
  { id: "plans", label: "پلن‌ها" },
  { id: "sort", label: "ترتیب" },
  { id: "status", label: "وضعیت" },
  { id: "actions", label: <span className="sr-only">عملیات</span> },
];

type Draft = { id: number | null; name: string; audience: "users" | "resellers"; sort: string; description: string; style: string };
const EMPTY: Draft = { id: null, name: "", audience: "users", sort: "0", description: "", style: "inherit" };

function CategoryForm({ draft, isAdmin, styleOptions, onSaved, onCancelEdit }: { draft: Draft; isAdmin: boolean; styleOptions: StyleOption[]; onSaved: () => void; onCancelEdit: () => void }) {
  const [state, setState] = useState<Draft>(draft);
  const { pending, send } = useFormSubmit(onSaved);
  const editing = state.id !== null;
  const set = (change: Partial<Draft>) => setState((d) => ({ ...d, ...change }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(
      editing ? `/plans/categories/${state.id}/edit` : "/plans/categories",
      { name: state.name, audience: state.audience, sort_order: state.sort, description: state.description, button_style: state.style },
      "برچسب دسته ذخیره شد",
    );
  };
  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <FormGrid>
        <TextInput label="نام برچسب" value={state.name} onChange={(name) => set({ name })} required maxLength={128} placeholder="مثلاً ویژه / اقتصادی" />
        <SelectInput
          label="مخاطب"
          value={state.audience}
          onChange={(v) => set({ audience: v === "resellers" ? "resellers" : "users" })}
          options={[{ id: "users", label: "کاربران" }, ...(isAdmin ? [{ id: "resellers", label: "نمایندگان" }] : [])]}
          help="در «افزودن پلن» فقط برای همین مخاطب دیده می‌شود"
        />
        <TextInput label="ترتیب" type="number" value={state.sort} onChange={(sort) => set({ sort })} />
        <TextInput label="توضیح (اختیاری)" value={state.description} onChange={(description) => set({ description })} maxLength={255} placeholder="نمایش داخلی" />
      </FormGrid>
      <ButtonStyleField
        value={state.style}
        onChange={(style) => set({ style })}
        options={styleOptions}
        hint="رنگ دکمه دسته در منوی خرید ربات — «ارث» یعنی همان رنگ «ثابت» در تنظیمات رنگبندی"
      />
      <FormActions submitLabel={editing ? "ذخیره تغییرات" : "افزودن برچسب"} pending={pending} onCancel={editing ? onCancelEdit : undefined} cancelLabel="انصراف از ویرایش" />
    </form>
  );
}

/** The plan-category labels: create/edit form above the list, as the old modal had them. */
export function CategoriesDialog({ isOpen, onOpenChange, categories, isAdmin, styleOptions, reload }: { isOpen: boolean; onOpenChange: (open: boolean) => void; categories: CategoryRow[]; isAdmin: boolean; styleOptions: StyleOption[]; reload: () => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [formKey, setFormKey] = useState(0);
  const edit = (next: Draft) => {
    setDraft(next);
    setFormKey((k) => k + 1);
  };
  const actions = (c: CategoryRow): RowAction[] => [
    { id: "edit", label: "ویرایش", icon: "solar:pen-linear", run: () => edit({ id: c.id, name: c.name, audience: c.audience, sort: String(c.sort_order), description: c.description, style: c.button_style }) },
    {
      id: "toggle",
      label: c.is_active ? "خاموش‌کردن" : "روشن‌کردن",
      icon: "solar:power-linear",
      run: async () => {
        await run(`/plans/categories/${c.id}/toggle`);
        reload();
      },
    },
    {
      id: "delete",
      label: "حذف",
      icon: "solar:trash-bin-trash-linear",
      tone: "danger",
      disabled: c.linked_packs.length > 0,
      confirmText: { message: "این برچسب حذف شود؟ پلن‌هایش بدون برچسب می‌مانند.", description: "حذف برچسب دسته", confirmLabel: "حذف" },
      run: async () => {
        await run(`/plans/categories/${c.id}/delete`, {}, { success: "برچسب دسته حذف شد" });
        reload();
      },
    },
  ];
  const saved = () => {
    edit(EMPTY);
    reload();
  };

  return (
    <FormModal isOpen={isOpen} onOpenChange={onOpenChange} title="برچسب دسته" description="در ربات فروشگاه، به‌جای «ثابت» دکمه‌های دسته نشان داده می‌شوند — رنگ دکمه را اینجا تنظیم کنید" size="lg">
      <CategoryForm key={formKey} draft={draft} isAdmin={isAdmin} styleOptions={styleOptions} onSaved={saved} onCancelEdit={() => edit(EMPTY)} />
      <GlassSection title="برچسب‌های فعلی" description={`${fa(categories.length)} برچسب`}>
        <SelectableTable
          ariaLabel="برچسب‌های دسته"
          columns={COLUMNS}
          rows={categories}
          rowId={(c) => c.id}
          empty="هنوز برچسبی نیست — از فرم بالا بسازید."
          cells={(c) => [
            <span key="n" className="flex flex-col">
              <bdi className="font-medium text-foreground">{c.name}</bdi>
              {c.description ? <bdi className="text-xs text-muted">{c.description}</bdi> : null}
            </span>,
            c.audience === "resellers" ? "نمایندگان" : "کاربران",
            STYLE_LABELS[c.button_style] ?? c.button_style,
            <span key="p" className="flex flex-col text-xs text-muted">
              {c.linked_plans.length ? <bdi>{c.linked_plans.join("، ")}</bdi> : null}
              {c.linked_packs.length ? (
                <Tooltip delay={300}>
                  <span tabIndex={0}>بسته‌ها: {c.linked_packs.join("، ")}</span>
                  <Tooltip.Content>
                    <p>ابتدا بسته‌های این برچسب را به «عمومی» منتقل یا حذف کنید</p>
                  </Tooltip.Content>
                </Tooltip>
              ) : null}
              {!c.linked_plans.length && !c.linked_packs.length ? "—" : null}
            </span>,
            <bdi key="o" className="num">{fa(c.sort_order)}</bdi>,
            <ActiveChip key="s" active={c.is_active} />,
            <RowActions key="a" label={`عملیات برچسب ${c.name}`} actions={actions(c)} />,
          ]}
          minWidth={640}
        />
      </GlassSection>
    </FormModal>
  );
}
