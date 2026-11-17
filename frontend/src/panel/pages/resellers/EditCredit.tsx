"use client";

import { useState, type FormEvent } from "react";

import { run, usePending } from "../../core/actions";
import type { ActionResult } from "../../core/api";
import { fa, toman, type ChipColor } from "../../core/format";
import { Ltr, StatusChip } from "../../ui/Data";
import { FormGrid, MoneyInput, SubmitButton, SwitchInput, TextInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { RowActions, SelectableTable, type Column } from "../catalog/Tables";
import type { CreditBlock, CreditEvent, CreditStatement } from "./types";

const NOTE_MAX = 255;
const MAX_TEMP_DAYS = 365;

const CREDIT_STATUS: Record<string, { label: string; color: ChipColor }> = {
  frozen: { label: "منجمد", color: "accent" },
  overdue: { label: "سررسید گذشته", color: "warning" },
  blocked: { label: "مسدود", color: "danger" },
};
const STATEMENT_STATUS: Record<string, { label: string; color: ChipColor }> = {
  issued: { label: "پرداخت‌نشده", color: "warning" },
  paid: { label: "پرداخت‌شده", color: "success" },
  written_off: { label: "بخشیده‌شده", color: "default" },
};
const EVENT_KINDS: Record<string, string> = { limit: "سقف", temp_limit: "سقف موقت", status: "وضعیت" };

const STATEMENT_COLUMNS: Column[] = [
  { id: "period", label: "دوره", rowHeader: true },
  { id: "amount", label: "مبلغ" },
  { id: "due", label: "سررسید" },
  { id: "status", label: "وضعیت" },
  { id: "actions", label: <span className="sr-only">اقدام</span> },
];

/** What a limit change posts: the field names of the old form; a blank temporary limit is not sent. */
export function creditFields(form: { limit: string; temp: string; days: string; note: string; frozen: boolean }): Record<string, string | boolean> {
  const fields: Record<string, string | boolean> = { credit_limit: form.limit, note: form.note.trim(), frozen_shown: true, frozen: form.frozen };
  if (form.temp) {
    fields.temp_limit = form.temp;
    fields.temp_limit_days = form.days;
  }
  return fields;
}

/** A temporary limit needs a duration of 1 to 365 days; without a temporary limit there is nothing to check. */
export function isTempValid(temp: string, days: string): boolean {
  if (!temp) return true;
  const count = Number(days);
  return Number.isInteger(count) && count >= 1 && count <= MAX_TEMP_DAYS;
}

function saveQuestion(limit: string, temp: string, days: string, frozen: boolean): string {
  const tempPart = temp ? ` و سقف موقت ${toman(Number(temp))} برای ${fa(Number(days))} روز` : "";
  const freezePart = frozen ? " اعتبار منجمد می‌شود و تا باز شدن چیزی قرض نمی‌دهد." : "";
  return `سقف اعتبار ${toman(Number(limit) || 0)}${tempPart} ثبت شود؟ نماینده می‌تواند کیف پولش را تا این سقف منفی کند.${freezePart}`;
}

function CreditForm({ shopId, credit, onSettled }: { shopId: number; credit: CreditBlock; onSettled: (result: ActionResult | null) => void }) {
  const [limit, setLimit] = useState(String(credit.credit_limit));
  const [temp, setTemp] = useState(credit.temp_limit === null ? "" : String(credit.temp_limit));
  const [days, setDays] = useState("");
  const [note, setNote] = useState("");
  const [frozen, setFrozen] = useState(credit.frozen);
  const { pending, track } = usePending();
  const valid = isTempValid(temp, days);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    void track(async () =>
      onSettled(
        await run(`/resellers/${shopId}/credit`, creditFields({ limit, temp, days, note, frozen }), {
          ask: { title: "ذخیرهٔ اعتبار", text: saveQuestion(limit, temp, days, frozen), confirmLabel: "ذخیرهٔ اعتبار", tone: frozen ? "warning" : "accent" },
        }),
      ),
    );
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <FormGrid cols={3}>
        <MoneyInput label="سقف اعتبار (تومان)" value={limit} onChange={setLimit} />
        <MoneyInput label="سقف موقت اختیاری (تومان)" value={temp} onChange={setTemp} />
        <TextInput
          label="مدت سقف موقت (روز)"
          type="number"
          min={1}
          max={MAX_TEMP_DAYS}
          value={days}
          onChange={setDays}
          ltr
          help={temp && !valid ? "برای سقف موقت، مدت را بین ۱ تا ۳۶۵ روز وارد کنید." : undefined}
        />
      </FormGrid>
      <TextInput label="یادداشت تغییر" value={note} onChange={setNote} maxLength={NOTE_MAX} placeholder="مثلاً: افزایش برای فروش آخر ماه" />
      <SwitchInput
        label="منجمد کردن اعتبار"
        checked={frozen}
        onChange={setFrozen}
        help="روشن: تا باز شدن، نماینده فقط با موجودی خودش می‌فروشد. وضعیت سررسید گذشته و مسدود را پلکان بدهی تعیین می‌کند."
      />
      <div>
        <SubmitButton pending={pending} isDisabled={!valid}>
          ذخیرهٔ اعتبار
        </SubmitButton>
      </div>
    </form>
  );
}

function StatementsTable({ shopId, statements, onSettled }: { shopId: number; statements: CreditStatement[]; onSettled: (result: ActionResult | null) => void }) {
  const writeOff = (row: CreditStatement) => ({
    id: "writeoff",
    label: "بخشودگی",
    icon: "solar:hand-money-bold",
    tone: "danger" as const,
    confirmText: {
      message: "بخشودگی بدهی",
      description: `بدهی صورت‌حساب ${row.period} بخشیده شود؟ همین مبلغ (تا سقف ${toman(row.amount_due)}) به کیف پول نماینده برمی‌گردد و قابل برگشت نیست.`,
      confirmLabel: "بخشودگی",
    },
    run: async () => onSettled(await run(`/resellers/${shopId}/credit/statements/${row.id}/writeoff`, {})),
  });
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold text-foreground">صورت‌حساب‌ها</h4>
      <SelectableTable
        ariaLabel="صورت‌حساب‌های اعتبار"
        columns={STATEMENT_COLUMNS}
        rows={statements}
        rowId={(row) => row.id}
        empty="صورت‌حسابی نیست"
        cells={(row) => {
          const status = STATEMENT_STATUS[row.status] ?? { label: row.status, color: "default" as const };
          return [
            <Ltr key="p">{row.period}</Ltr>,
            <Ltr key="a">{toman(row.amount_due)}</Ltr>,
            <Ltr key="d">{row.due_at}</Ltr>,
            <StatusChip key="s" color={status.color}>{status.label}</StatusChip>,
            row.status === "issued" ? <RowActions key="x" label={`عملیات صورت‌حساب ${row.period}`} actions={[writeOff(row)]} /> : <span key="x" />,
          ];
        }}
        minWidth={560}
      />
    </div>
  );
}

function EventList({ events }: { events: CreditEvent[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold text-foreground">تغییرهای اخیر اعتبار</h4>
      <ul className="flex flex-col gap-2">
        {events.map((event) => (
          <li key={event.id} className="inset-tile flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm">
            <span className="flex min-w-0 flex-col">
              <Ltr>{`${event.old_value || "—"} → ${event.new_value || "—"}`}</Ltr>
              <span className="truncate text-xs text-muted">
                {EVENT_KINDS[event.kind] ?? event.kind}
                {event.note ? ` · ${event.note}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end text-xs text-muted">
              <Ltr>{event.created_at}</Ltr>
              {event.actor ? <span>{event.actor}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A PAYG shop's credit line: use of the limit, the form that sets it, statements (with write-off) and recent changes. */
export function CreditSection({ shopId, credit, onSettled }: { shopId: number; credit: CreditBlock; onSettled: (result: ActionResult | null) => void }) {
  const status = CREDIT_STATUS[credit.status] ?? { label: "فعال", color: "success" as const };
  return (
    <GlassSection
      title="اعتبار"
      description="کیف پول این نماینده برای هزینه‌های PAYG تا این سقف می‌تواند منفی شود."
      actions={<StatusChip color={status.color}>{status.label}</StatusChip>}
    >
      <ul className="grid gap-2 sm:grid-cols-3">
        <li className="inset-tile flex flex-col rounded-lg px-3 py-2 text-sm">
          <span className="text-xs text-muted">سقف اعتبار</span>
          <span className="font-medium">{toman(credit.limit)}</span>
        </li>
        <li className="inset-tile flex flex-col rounded-lg px-3 py-2 text-sm">
          <span className="text-xs text-muted">استفاده‌شده</span>
          <span className="font-medium">
            {toman(credit.used)} · {fa(credit.percent)}٪
          </span>
        </li>
        <li className="inset-tile flex flex-col rounded-lg px-3 py-2 text-sm">
          <span className="text-xs text-muted">قابل استفاده</span>
          <span className="font-medium">{toman(credit.available)}</span>
        </li>
      </ul>
      {credit.temp_limit !== null && credit.temp_limit_until ? (
        <p className="text-xs text-muted">
          سقف موقت {toman(credit.temp_limit)} تا <Ltr>{credit.temp_limit_until}</Ltr> ثبت شده است.
        </p>
      ) : null}
      <CreditForm key={`${credit.credit_limit}:${credit.temp_limit}:${credit.frozen}:${credit.events.length}`} shopId={shopId} credit={credit} onSettled={onSettled} />
      {credit.statements.length ? <StatementsTable shopId={shopId} statements={credit.statements} onSettled={onSettled} /> : null}
      {credit.events.length ? <EventList events={credit.events} /> : null}
    </GlassSection>
  );
}
