"use client";

import type { ReactNode } from "react";

import { StatusChip } from "../../ui/Data";
import type { ChipColor } from "../../core/format";
import { SelectInput, SwitchInput, TextInput } from "../../ui/Fields";
import type { ScheduleField } from "./types";

/** A link that downloads a file from the server (a navigation, never a scripted click). */
export function DownloadLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      download
      className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-focus"
    >
      {children}
    </a>
  );
}

/** A «label: value» pair inside a meta strip. */
export function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="inset-tile flex min-w-0 flex-col gap-0.5 rounded-lg p-3">
      <span className="text-xs text-muted">{label}</span>
      <strong className="min-w-0 break-words text-sm text-foreground">{children}</strong>
    </div>
  );
}

export type FieldValue = string | boolean;

/** The initial draft of a group of settings fields: toggles are booleans, the rest strings. */
export function initialDraft(fields: ScheduleField[]): Record<string, FieldValue> {
  return Object.fromEntries(fields.map((field) => [field.key, field.kind === "toggle" ? ["1", "true", "yes", "on"].includes(field.value) : field.value]));
}

/** The form fields to post: `s_<key>`, toggles only when on, a blank secret left out (it keeps the saved one). */
export function draftFields(fields: ScheduleField[], draft: Record<string, FieldValue>): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const field of fields) {
    const value = draft[field.key];
    if (field.kind === "toggle") out[`s_${field.key}`] = value === true;
    else if (field.kind === "password") {
      if (typeof value === "string" && value.trim()) out[`s_${field.key}`] = value.trim();
    } else out[`s_${field.key}`] = typeof value === "string" ? value : "";
  }
  return out;
}

export function isDraftDirty(fields: ScheduleField[], draft: Record<string, FieldValue>): boolean {
  const base = initialDraft(fields);
  return fields.some((field) => (field.kind === "password" ? Boolean(String(draft[field.key] ?? "").trim()) : draft[field.key] !== base[field.key]));
}

/** One schedule or delivery field of the backup tab, drawn by its kind. */
export function ScheduleFieldView({ field, value, onChange }: { field: ScheduleField; value: FieldValue; onChange: (value: FieldValue) => void }) {
  if (field.kind === "toggle") return <SwitchInput label={field.label} help={field.help} checked={value === true} onChange={onChange} />;
  if (field.kind === "select") return <SelectInput label={field.label} help={field.help} options={field.options} value={String(value || field.options[0]?.id || "")} onChange={onChange} />;
  if (field.kind === "password") {
    return (
      <TextInput
        label={
          <span className="flex items-center gap-2">
            {field.label}
            {field.secret_set ? <StatusChip color="success">ذخیره شده</StatusChip> : null}
          </span>
        }
        type="password"
        ltr
        value={String(value)}
        onChange={onChange}
        placeholder={field.secret_set ? "•••••••• (ذخیره شده؛ برای تغییر مقدار جدید را بنویسید)" : "وارد کنید"}
        help={field.help}
      />
    );
  }
  return <TextInput label={field.label} help={field.help} type={field.kind === "number" ? "number" : "text"} ltr={field.kind === "number"} value={String(value)} onChange={onChange} />;
}

export const TELEGRAM_KIND: Record<string, { label: string; color: ChipColor }> = {
  ok: { label: "موفق", color: "success" },
  skipped: { label: "ارسال نشد", color: "warning" },
  error: { label: "خطا", color: "danger" },
};
