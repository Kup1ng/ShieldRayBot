"use client";

import { Button, Chip, Input, Label, ListBox, Select, Switch, TextArea, TextField } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import type { SettingField } from "../types";
import { FIELD_KIND_TO_DEST, PSP_METHODS, PSP_PROVIDERS, STYLE_OPTIONS, blankRow, parseRows, serializeRows, type ButtonStyle, type DestKind, type DestRow } from "./payDest";

/** Help under a field: a short hint inline, a long one folded behind «راهنما». */
export function Help({ text }: { text: string }) {
  if (!text) return null;
  if (text.length > 70) {
    return (
      <details className="text-xs text-muted">
        <summary className="cursor-pointer select-none text-accent">راهنما</summary>
        <p className="mt-1 leading-5">{text}</p>
      </details>
    );
  }
  return <small className="text-xs text-muted">{text}</small>;
}

const EMPTY_ID = "__empty";

export type Choice = { value: string; label: string };

/** A HeroUI select over text choices (an empty value is a legal choice). */
export function ChoiceSelect({ label, value, choices, onChange, className }: { label: string; value: string; choices: Choice[]; onChange: (value: string) => void; className?: string }) {
  const toId = (v: string) => (v === "" ? EMPTY_ID : v);
  return (
    <Select className={className} value={toId(value)} onChange={(next) => onChange(next === EMPTY_ID ? "" : String(next ?? ""))} aria-label={label}>
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {choices.map((choice) => (
            <ListBox.Item key={toId(choice.value)} id={toId(choice.value)} textValue={choice.label}>
              {choice.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function ToggleField({ field, value, onChange }: { field: SettingField; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <Switch isSelected={value} onChange={onChange} aria-label={field.label} className="w-full justify-between">
        <Switch.Content className="text-sm font-medium text-foreground">{field.label}</Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch>
      <Help text={field.help} />
    </div>
  );
}

function PlainField({ field, value, onChange }: { field: SettingField; value: string; onChange: (value: string) => void }) {
  if (field.kind === "select") {
    return (
      <div className="flex flex-col gap-1">
        <ChoiceSelect label={field.label} value={value} choices={field.options} onChange={onChange} />
        <Help text={field.help} />
      </div>
    );
  }
  if (field.kind === "textarea") {
    return (
      <div className="flex flex-col gap-1">
        <TextField value={value} onChange={onChange}>
          <Label>{field.label}</Label>
          <TextArea rows={5} />
        </TextField>
        <Help text={field.help} />
      </div>
    );
  }
  const secret = field.kind === "password";
  return (
    <div className="flex flex-col gap-1">
      <TextField value={value} onChange={onChange} type={secret ? "password" : field.kind === "number" ? "number" : "text"} autoComplete={secret ? "new-password" : undefined}>
        <Label className="flex items-center gap-2">
          {field.label}
          {secret && field.has_value ? (
            <Chip size="sm" color="success" variant="soft">
              <Chip.Label>ذخیره شده</Chip.Label>
            </Chip>
          ) : null}
        </Label>
        <Input dir={secret || field.kind === "number" ? "ltr" : undefined} className={secret || field.kind === "number" ? "text-start" : undefined} placeholder={secret ? (field.has_value ? "•••••••• (ذخیره شده؛ برای تغییر مقدار جدید را بنویسید)" : "وارد کنید") : undefined} />
      </TextField>
      <Help text={field.help} />
    </div>
  );
}

function RowShell({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="inset-tile flex items-start gap-2 rounded-lg p-3">
      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">{children}</div>
      <Button isIconOnly size="sm" variant="ghost" aria-label="حذف ردیف" onPress={onRemove}>
        <Icon name="solar:trash-bin-minimalistic-linear" size={18} />
      </Button>
    </div>
  );
}

function Text({ label, value, onChange, ltr, type, placeholder, maxLength }: { label: string; value: string; onChange: (value: string) => void; ltr?: boolean; type?: string; placeholder?: string; maxLength?: number }) {
  return (
    <TextField value={value} onChange={onChange} type={type} autoComplete={type === "password" ? "new-password" : "off"}>
      <Label>{label}</Label>
      <Input dir={ltr ? "ltr" : undefined} className={ltr ? "text-start" : undefined} placeholder={placeholder} maxLength={maxLength} />
    </TextField>
  );
}

function StyleSelect({ row, inherit, onChange }: { row: DestRow; inherit: string; onChange: (style: ButtonStyle) => void }) {
  return (
    <ChoiceSelect
      label="رنگ دکمه در ربات"
      value={row.style}
      choices={STYLE_OPTIONS.map((o) => ({ value: o.value, label: o.label(inherit) }))}
      onChange={(next) => onChange(next as ButtonStyle)}
    />
  );
}

function RowFields({ kind, row, inherit, patch }: { kind: DestKind; row: DestRow; inherit: string; patch: (change: Partial<DestRow>) => void }) {
  if (kind === "cards") {
    return (
      <>
        <Text label="شماره کارت" value={row.number} onChange={(number) => patch({ number })} ltr />
        <Text label="صاحب کارت" value={row.holder} onChange={(holder) => patch({ holder })} />
        <StyleSelect row={row} inherit={inherit} onChange={(style) => patch({ style })} />
      </>
    );
  }
  if (kind === "gateways") {
    return (
      <>
        <Text label="نام درگاه" value={row.name} onChange={(name) => patch({ name })} />
        <Text label="لینک" value={row.link} onChange={(link) => patch({ link })} ltr />
        <StyleSelect row={row} inherit={inherit} onChange={(style) => patch({ style })} />
      </>
    );
  }
  if (kind === "crypto") {
    return (
      <>
        <Text label="رمزارز" value={row.asset} onChange={(asset) => patch({ asset })} />
        <Text label="شبکه" value={row.network} onChange={(network) => patch({ network })} />
        <Text label="آدرس" value={row.address} onChange={(address) => patch({ address })} ltr />
        <StyleSelect row={row} inherit={inherit} onChange={(style) => patch({ style })} />
      </>
    );
  }
  return (
    <>
      <Text label="نام درگاه" value={row.name} onChange={(name) => patch({ name })} maxLength={64} />
      <ChoiceSelect label="ارائه‌دهنده" value={row.provider} choices={PSP_PROVIDERS} onChange={(provider) => patch({ provider })} />
      <Text
        label="مرچنت / کلید API"
        value={row.key}
        onChange={(key) => patch({ key })}
        type="password"
        ltr
        placeholder={row.hasSecret ? "•••••••• ذخیره شده؛ برای تغییر بنویسید" : "وارد کنید"}
      />
      <Text label="آدرس پایه (فقط سان‌پی)" value={row.payUrl} onChange={(payUrl) => patch({ payUrl })} ltr placeholder="https://pay.example.com" />
      <ChoiceSelect label="روش درخواست سان‌پی" value={row.requestMethod} choices={PSP_METHODS} onChange={(requestMethod) => patch({ requestMethod })} />
      <div className="flex flex-col justify-end gap-2">
        <Switch isSelected={row.sandbox} onChange={(sandbox) => patch({ sandbox })} aria-label="سندباکس زرین‌پال" className="w-full justify-between">
          <Switch.Content className="text-sm text-foreground">سندباکس زرین‌پال</Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
        <Switch isSelected={row.enabled} onChange={(enabled) => patch({ enabled })} aria-label="فعال" className="w-full justify-between">
          <Switch.Content className="text-sm text-foreground">فعال</Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </div>
    </>
  );
}

const INHERIT_LABELS: Record<string, string> = { cards: "ارث از کارت به کارت", gateways: "ارث از درگاه پرداخت", crypto: "ارث از رمزارز", psp: "ارث از پیش‌فرض" };

/**
 * Add / remove rows of one payment list. The list lives in the form as the same JSON text the
 * old editor kept in a hidden field; an online gateway's saved key is never shown, only «ذخیره شده».
 */
export function PayDestEditor({ field, kind, onChange }: { field: SettingField; kind: DestKind; onChange: (json: string) => void }) {
  const [rows, setRows] = useState<DestRow[]>(() => parseRows(kind, String(field.value)));
  const commit = (next: DestRow[]) => {
    const finalRows = next.length ? next : [blankRow(kind)];
    setRows(finalRows);
    onChange(serializeRows(kind, finalRows));
  };
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={field.label}>
      <div className="flex flex-col gap-0.5">
        <strong className="text-sm font-medium text-foreground">{field.label}</strong>
        <Help text={field.help} />
      </div>
      {rows.map((row) => (
        <RowShell key={row.id} onRemove={() => commit(rows.filter((r) => r.id !== row.id))}>
          <RowFields kind={kind} row={row} inherit={INHERIT_LABELS[kind]} patch={(change) => commit(rows.map((r) => (r.id === row.id ? { ...r, ...change } : r)))} />
        </RowShell>
      ))}
      <div>
        <Button size="sm" variant="outline" onPress={() => commit([...rows, blankRow(kind)])}>
          <Icon name="solar:add-circle-linear" size={18} />
          افزودن
        </Button>
      </div>
    </div>
  );
}

/** One field of a settings form, by kind. `state` is the form's value for this field. */
export function SettingFieldView({ field, value, onChange }: { field: SettingField; value: string | boolean; onChange: (value: string | boolean) => void }) {
  if (field.kind === "toggle") return <ToggleField field={field} value={value === true} onChange={onChange} />;
  const dest = FIELD_KIND_TO_DEST[field.kind];
  if (dest) return <PayDestEditor field={field} kind={dest} onChange={onChange} />;
  return <PlainField field={field} value={String(value)} onChange={onChange} />;
}

/** Fields that need the whole row width in the two-column grid. */
export function isWideField(field: SettingField): boolean {
  return field.kind === "textarea" || field.kind === "toggle" || field.kind in FIELD_KIND_TO_DEST;
}
