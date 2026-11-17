"use client";

/** The per-plan quick-buy pack editor: one line per pack (amount, computed price, button colour). */

import { Button, Input, ListBox, Select, TextField } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { fa, toman } from "../../core/format";
import type { PackLineData, StyleOption } from "./types";

export type PackLine = { key: number; amount: string; style: string };

/** What one tab of the editor posts and shows. `rate` is the plan's unit price in toman. */
export type PackKindSpec = {
  id: string;
  tab: string;
  unit: string;
  rate: number;
  max: number;
  defaults: number[];
  amountName: string;
  styleName: string;
  amountLabel: string;
  styleLabel: string;
  removeLabel: string;
  addLabel: string;
};

export type PackLines = Record<string, PackLine[]>;

const DEFAULT_STYLE = "inherit";
const DEFAULT_STYLE_LABEL = "پیش‌فرض";
/** React Aria keys cannot be an empty string reliably; the white colour («») travels as this key. */
const WHITE_KEY = "__white__";
const TONE_DOT: Record<string, string> = { default: "bg-default", primary: "bg-accent", success: "bg-success", danger: "bg-danger" };

let lineCounter = 0;
const newLine = (amount: number | string, style: string = DEFAULT_STYLE): PackLine => ({ key: ++lineCounter, amount: String(amount), style });

function initialLines(specs: PackKindSpec[], current: Record<string, PackLineData[]> | undefined, seedEmpty: boolean): PackLines {
  return Object.fromEntries(
    specs.map((spec) => {
      const rows = (current?.[spec.id] ?? []).map((row) => newLine(row.amount, row.button_style));
      return [spec.id, rows.length || !seedEmpty ? rows : spec.defaults.map((amount) => newLine(amount))];
    }),
  );
}

/** The repeated amount and colour fields the handlers pair by position. */
export function packFields(specs: PackKindSpec[], lines: PackLines): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const spec of specs) {
    const rows = lines[spec.id] ?? [];
    fields[spec.amountName] = rows.map((row) => row.amount);
    fields[spec.styleName] = rows.map((row) => row.style);
  }
  return fields;
}

/**
 * The lines of every tab. A kind that is empty when the editor is switched on starts from the
 * default stairs, like the old page; removing the last line afterwards leaves it empty.
 */
export function usePackLines(specs: PackKindSpec[], current: Record<string, PackLineData[]> | undefined, seedNow: boolean) {
  const [lines, setLines] = useState<PackLines>(() => initialLines(specs, current, seedNow));
  const seedEmpty = () =>
    setLines((all) => Object.fromEntries(specs.map((spec) => [spec.id, all[spec.id]?.length ? all[spec.id] : spec.defaults.map((amount) => newLine(amount))])));
  return { lines, setLines, seedEmpty };
}

function priceOf(rate: number, amount: string): string {
  const count = Number(amount);
  if (!(rate > 0) || !(count > 0)) return "—";
  return toman(Math.round(rate * count));
}

/** The button colour of one pack line; «inherit» is the default and white travels as an empty value. */
export function PackStyleSelect({ label, value, options, onChange }: { label: string; value: string; options: StyleOption[]; onChange: (value: string) => void }) {
  return (
    <Select aria-label={label} className="min-w-0" value={value === "" ? WHITE_KEY : value} onChange={(key) => onChange(key === WHITE_KEY || key === null ? "" : String(key))}>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => {
            const text = option.value === DEFAULT_STYLE ? DEFAULT_STYLE_LABEL : option.label;
            return (
              <ListBox.Item key={option.value || WHITE_KEY} id={option.value || WHITE_KEY} textValue={text}>
                <span className="flex items-center gap-2">
                  <span aria-hidden className={`size-2.5 rounded-full border border-border ${TONE_DOT[option.tone] ?? TONE_DOT.default}`} />
                  {text}
                </span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            );
          })}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

type RowProps = {
  spec: PackKindSpec;
  line: PackLine;
  styleOptions: StyleOption[];
  onChange: (change: Partial<PackLine>) => void;
  onRemove: () => void;
};

function PackRow({ spec, line, styleOptions, onChange, onRemove }: RowProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
      <div className="order-1 flex items-center gap-2">
        <TextField aria-label={spec.amountLabel} type="number" value={line.amount} onChange={(amount) => onChange({ amount })} className="min-w-0 flex-1">
          <Input dir="ltr" className="text-start" min={1} max={spec.max} step={1} inputMode="numeric" placeholder="مقدار" />
        </TextField>
        <span className="shrink-0 text-xs text-muted">{spec.unit}</span>
      </div>
      <span className="order-4 text-end text-sm text-muted sm:order-2 sm:text-start">
        <bdi className="num">{priceOf(spec.rate, line.amount)}</bdi>
      </span>
      <div className="order-3 min-w-0">
        <PackStyleSelect label={spec.styleLabel} value={line.style} options={styleOptions} onChange={(style) => onChange({ style })} />
      </div>
      <Button isIconOnly size="sm" variant="ghost" className="order-2 sm:order-4" aria-label={spec.removeLabel} onPress={onRemove}>
        <Icon name="solar:trash-bin-trash-linear" size={18} />
      </Button>
    </div>
  );
}

type Props = {
  specs: PackKindSpec[];
  lines: PackLines;
  onChange: (next: PackLines) => void;
  styleOptions: StyleOption[];
  maxPerKind: number;
};

/** Tabs per pack kind, each a list of lines whose price is the plan's unit price × the amount. */
export function PackEditor({ specs, lines, onChange, styleOptions, maxPerKind }: Props) {
  const [activeId, setActiveId] = useState(specs[0]?.id ?? "");
  const spec = specs.find((s) => s.id === activeId) ?? specs[0];
  if (!spec) return null;
  const rows = lines[spec.id] ?? [];
  const setRows = (next: PackLine[]) => onChange({ ...lines, [spec.id]: next });
  const patch = (key: number, change: Partial<PackLine>) => setRows(rows.map((row) => (row.key === key ? { ...row, ...change } : row)));

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="نوع بسته" className="flex gap-1 rounded-xl border border-border bg-surface/70 p-1">
        {specs.map((tab) => {
          const current = tab.id === spec.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={current}
              onClick={() => setActiveId(tab.id)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-focus ${current ? "bg-accent text-accent-foreground" : "text-foreground/75 hover:bg-surface-secondary"}`}
            >
              {tab.tab} <span className="num">{fa((lines[tab.id] ?? []).length)}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="flex flex-col gap-2">
        <div aria-hidden className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_2rem] gap-2 px-1 text-xs text-muted sm:grid">
          <span>مقدار ({spec.unit})</span>
          <span>قیمت (تومان)</span>
          <span>رنگ دکمه</span>
          <span />
        </div>
        {rows.length ? (
          rows.map((row) => <PackRow key={row.key} spec={spec} line={row} styleOptions={styleOptions} onChange={(change) => patch(row.key, change)} onRemove={() => setRows(rows.filter((r) => r.key !== row.key))} />)
        ) : (
          <p className="text-sm text-muted">بسته‌ای نیست؛ با «{spec.addLabel}» اضافه کنید.</p>
        )}
        <Button type="button" variant="secondary" className="w-fit" isDisabled={rows.length >= maxPerKind} onPress={() => setRows([...rows, newLine(1)])}>
          <Icon name="solar:add-circle-linear" size={18} />
          {spec.addLabel}
        </Button>
        {rows.length >= maxPerKind ? <p className="text-xs text-muted">حداکثر {fa(maxPerKind)} بسته برای هر نوع مجاز است.</p> : null}
      </div>
    </div>
  );
}
