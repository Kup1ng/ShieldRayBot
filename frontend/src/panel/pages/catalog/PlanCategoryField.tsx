"use client";

import { Button } from "@heroui/react";
import { useId, useState, type KeyboardEvent } from "react";

import { Icon } from "@/icons/Icon";

import { TextInput } from "../../ui/Fields";
import { ButtonStyleField } from "./PlanParts";
import { CATEGORY_NAME_MAX, TONE_DOT, cleanCategoryName, createQuickCategory, type QuickCategory } from "./quickCategory";
import type { PlanFormCategory, StyleOption } from "./types";

const NAME_REQUIRED = `نام دسته را بنویسید (حداکثر ${CATEGORY_NAME_MAX.toLocaleString("fa-IR")} حرف).`;
const CHIP = "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus";

/** The categories on offer: the given ones, then any this form added that the page has not reloaded yet. */
export function mergeCategories(given: PlanFormCategory[], added: PlanFormCategory[]): PlanFormCategory[] {
  const known = new Set(given.map((c) => c.id));
  return [...given, ...added.filter((c) => !known.has(c.id))];
}

function Chip({ selected, onPress, children }: { selected: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPress}
      className={`${CHIP} ${selected ? "border-foreground bg-foreground/10 font-medium text-foreground" : "border-border text-foreground/80 hover:bg-surface-secondary"}`}
    >
      {children}
    </button>
  );
}

type NewCategoryProps = { styleOptions: StyleOption[]; onAdded: (category: QuickCategory) => void };

/** The name and bot colour of a category added from the plan form, saved on its own before the plan is. */
function NewCategory({ styleOptions, onAdded }: NewCategoryProps) {
  const [name, setName] = useState("");
  const [style, setStyle] = useState("inherit");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const add = async () => {
    const clean = cleanCategoryName(name);
    if (!clean) {
      setError(NAME_REQUIRED);
      return;
    }
    if (pending) return;
    setPending(true);
    setError("");
    const result = await createQuickCategory(clean, style);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName("");
    setStyle("inherit");
    onAdded(result.category);
  };
  // Enter adds the category; it must not submit the whole plan form.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    void add();
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3" onKeyDown={onKeyDown}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="نام دستهٔ جدید" value={name} onChange={setName} maxLength={CATEGORY_NAME_MAX} placeholder="مثلاً ویژه" />
        {styleOptions.length ? <ButtonStyleField label="رنگ دکمهٔ دسته در ربات" value={style} onChange={setStyle} options={styleOptions} hint="«ارث» یعنی همان رنگ «ثابت» در تنظیمات رنگبندی" /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" isPending={pending} onPress={() => void add()}>
          <Icon name="solar:add-circle-linear" size={18} />
          افزودن دسته
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  categories: PlanFormCategory[];
  styleOptions: StyleOption[];
  /** Called once a category was added, so the page can reload the list it belongs to. */
  onCategoryAdded?: () => void;
};

/**
 * The category of a user plan, chosen with chips right under its name. «+ جدید» adds a category in place and picks
 * it; the dot of each chip wears the colour of its button in the bot.
 */
export function PlanCategoryField({ value, onChange, categories, styleOptions, onCategoryAdded }: Props) {
  const labelId = useId();
  const [added, setAdded] = useState<PlanFormCategory[]>([]);
  const [adding, setAdding] = useState(false);
  const options = mergeCategories(categories, added);

  const onAdded = (category: QuickCategory) => {
    setAdded((prev) => [...prev, { id: category.id, name: category.name, is_active: true, tone: category.tone }]);
    onChange(String(category.id));
    setAdding(false);
    onCategoryAdded?.();
  };

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium text-foreground">
        برچسب دسته
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {options.map((category) => (
          <Chip key={category.id} selected={value === String(category.id)} onPress={() => onChange(String(category.id))}>
            <span aria-hidden className={`size-2.5 rounded-full ${TONE_DOT[category.tone]}`} />
            <bdi>{category.name}</bdi>
            {category.is_active ? null : <span className="text-xs text-muted">خاموش</span>}
          </Chip>
        ))}
        <Chip selected={value === ""} onPress={() => onChange("")}>
          بدون دسته
        </Chip>
        <button type="button" aria-expanded={adding} onClick={() => setAdding((open) => !open)} className={`${CHIP} border-dashed border-border text-foreground/80 hover:bg-surface-secondary`}>
          + جدید
        </button>
      </div>
      {adding ? <NewCategory styleOptions={styleOptions} onAdded={onAdded} /> : null}
      <p className="text-xs text-muted">در ربات، مشتری اول دسته را انتخاب می‌کند و بعد پلن را. بسته‌های حجم و زمانِ یک دسته فقط روی سرویس‌های همان دسته دیده می‌شوند.</p>
    </div>
  );
}
