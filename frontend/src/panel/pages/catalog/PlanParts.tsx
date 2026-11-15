"use client";

import { Button } from "@heroui/react";
import type { ReactNode } from "react";

import { GlassSection, StatTile } from "../../ui/Page";
import { CheckGroup, CheckInput, FormGrid, FormSection, SelectInput, TextInput } from "../../ui/Fields";
import { namingSample } from "./format";
import type { Limits, Naming, NamingDefaults, PgOption, StyleOption } from "./types";

export type SourceMode = "custom" | "template";

/** Template id and group ids as the form fields (`group_<id>` carries the id). */
export function groupFields(selected: string[]): Record<string, string> {
  return Object.fromEntries(selected.map((id) => [`group_${id}`, id]));
}

export const asOptions = (rows: PgOption[]) => rows.map((r) => ({ id: String(r.id), label: r.name || String(r.id) }));
export const templateOptions = (rows: PgOption[]) => [{ id: "", label: "— انتخاب کنید —" }, ...rows.map((r) => ({ id: String(r.id), label: `#${r.id} — ${r.name || "بدون نام"}` }))];

export function FormActions({ submitLabel, pending, onCancel, cancelLabel = "انصراف" }: { submitLabel: string; pending: boolean; onCancel?: () => void; cancelLabel?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <Button type="submit" isPending={pending} className="button--ink !h-12 !rounded-lg px-6">
        {submitLabel}
      </Button>
      {onCancel ? (
        <Button type="button" variant="outline" className="!h-12 !rounded-lg px-6" onPress={onCancel}>
          {cancelLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** Live PasarGuard limits as small stat tiles; nothing is drawn for an unrestricted account. */
export function LimitBoard({ limits, heading = "سقف حساب پاسارگارد", caption }: { limits: Limits; heading?: string; caption?: string }) {
  if (!limits.cards.length) return null;
  return (
    <GlassSection title={heading} description={caption} className="mb-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {limits.cards.map((card) => (
          <StatTile key={card.key} icon="solar:shield-check-bold" tone="teal" label={card.label} value={<bdi>{card.value}</bdi>} hint={card.caption || undefined} />
        ))}
      </div>
    </GlassSection>
  );
}

export function durationHelp(limits: Limits, blankIsUnlimited = true): ReactNode {
  return (
    <>
      {blankIsUnlimited ? "برای مدت نامحدود فیلد را خالی بگذارید (یا ۰)" : null}
      {limits.per_user_expire_max_days ? ` — سقف زنده: ${limits.per_user_expire_max_days.toLocaleString("fa-IR")} روز` : null}
    </>
  );
}

export function volumeHelp(limits: Limits): ReactNode {
  return (
    <>
      برای حجم نامحدود فیلد را خالی بگذارید — عدد صفر نامحدود نیست
      {limits.per_user_data_max_text ? ` — سقف زنده: ${limits.per_user_data_max_text}` : null}
    </>
  );
}

/** Custom group + volume + duration, or an existing PasarGuard template. */
export function PgSourceFields({
  mode,
  onMode,
  groups,
  templates,
  selectedGroups,
  onGroups,
  templateId,
  onTemplate,
  modeLabels = ["سفارشی (گروه + حجم + مدت)", "از تمپلیت آماده پاسارگارد"],
  groupLabel = "گروه‌های پاسارگارد",
  extra,
}: {
  mode: SourceMode;
  onMode: (mode: SourceMode) => void;
  groups: PgOption[];
  templates: PgOption[];
  selectedGroups: string[];
  onGroups: (ids: string[]) => void;
  templateId: string;
  onTemplate: (id: string) => void;
  modeLabels?: [string, string];
  groupLabel?: string;
  extra?: ReactNode;
}) {
  return (
    <FormSection title="اتصال به پاسارگارد">
      <SelectInput
        label="حالت ساخت در پاسارگارد"
        value={mode}
        onChange={(v) => onMode(v === "template" ? "template" : "custom")}
        options={[
          { id: "custom", label: modeLabels[0] },
          { id: "template", label: modeLabels[1] },
        ]}
      />
      {mode === "template" ? (
        <SelectInput label="تمپلیت پاسارگارد" value={templateId} onChange={onTemplate} options={templateOptions(templates)} />
      ) : (
        <>
          <CheckGroup label={groupLabel} options={asOptions(groups)} selected={selectedGroups} onChange={onGroups} empty="گروهی نیست — از منوی پاسارگارد → گروه‌ها بسازید." />
          {extra}
        </>
      )}
    </FormSection>
  );
}

/** Optional per-plan service naming with a live sample, falling back to the global naming. */
export function NamingFields({ naming, onChange, defaults, volumeGb }: { naming: Naming; onChange: (next: Naming) => void; defaults: NamingDefaults; volumeGb: string }) {
  return (
    <FormSection
      title="نام‌گذاری سرویس در پاسارگارد"
      description={
        <>
          اختیاری — اگر خالی بگذارید از تنظیمات سراسری «نام‌گذاری سرویس» استفاده می‌شود. متغیرها:{" "}
          {["{prefix}", "{random}", "{suffix}", "{id}", "{plan_volume}", "{plan_unit}", "{username}"].map((token) => (
            <code key={token} dir="ltr" className="mx-0.5 rounded bg-surface-secondary px-1">
              {token}
            </code>
          ))}{" "}
          حجم و واحد جدا هستند؛ یوزرنیم تلگرام بدون @ است. برای کاربر بدون یوزرنیم، آیدی عددی جایگزین می‌شود.
        </>
      }
    >
      <FormGrid>
        <TextInput label="پیشوند" value={naming.prefix} onChange={(prefix) => onChange({ ...naming, prefix })} ltr maxLength={64} placeholder="مثلاً vip — خالی = پیش‌فرض سراسری" />
        <TextInput label="پسوند" value={naming.suffix} onChange={(suffix) => onChange({ ...naming, suffix })} ltr maxLength={64} placeholder="اختیاری — خالی = پیش‌فرض سراسری" />
      </FormGrid>
      <TextInput label="الگوی نام" value={naming.pattern} onChange={(pattern) => onChange({ ...naming, pattern })} ltr maxLength={255} placeholder="{prefix}_{random}{suffix}" />
      <p className="text-sm text-muted">
        نمونه نام: <strong dir="ltr" className="num text-foreground">{namingSample(naming, defaults, volumeGb)}</strong>
      </p>
    </FormSection>
  );
}

/** The Telegram button colour of a plan or category. */
export function ButtonStyleField({ value, onChange, options, hint, label = "رنگ دکمه در ربات" }: { value: string; onChange: (value: string) => void; options: StyleOption[]; hint?: ReactNode; label?: string }) {
  return (
    <SelectInput
      label={label}
      value={value}
      onChange={onChange}
      options={options.map((o) => ({ id: o.value, label: o.label }))}
      help={hint ?? "«ارث از دسته» یعنی رنگ دکمه دسته (و اگر دسته نداشت، رنگ نوع پلن در تنظیمات رنگبندی)؛ هر پلن می‌تواند رنگ جدا داشته باشد."}
    />
  );
}

export function CategorySelect({ value, onChange, categories, emptyLabel = "— بدون برچسب —", help }: { value: string; onChange: (v: string) => void; categories: Array<{ id: number; name: string; is_active?: boolean }>; emptyLabel?: string; help?: ReactNode }) {
  return (
    <SelectInput
      label="برچسب دسته (اختیاری)"
      value={value}
      onChange={onChange}
      options={[{ id: "", label: emptyLabel }, ...categories.map((c) => ({ id: String(c.id), label: c.is_active === false ? `${c.name} (خاموش)` : c.name }))]}
      help={help}
    />
  );
}

export { CheckInput };
