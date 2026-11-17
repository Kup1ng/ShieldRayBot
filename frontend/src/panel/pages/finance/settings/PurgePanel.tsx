"use client";

import { Button, Input, Label, Switch, TextField } from "@heroui/react";
import { useState } from "react";

import { run } from "../../../core/actions";
import { fa, type ChipColor } from "../../../core/format";
import { Ltr, StatusChip } from "../../../ui/Data";
import { StatTile } from "../../../ui/Page";
import type { PurgePayload } from "../types";

const TAG_COLORS: Record<string, ChipColor> = {
  delivered: "success",
  approved: "success",
  pending: "warning",
  awaiting_receipt: "warning",
  awaiting_approval: "warning",
  rejected: "danger",
  cancelled: "danger",
  voided: "danger",
};

type RulesState = { tags: Record<string, boolean>; auto: boolean; days: string };

function initialRules(purge: PurgePayload): RulesState {
  const tags: Record<string, boolean> = {};
  for (const section of purge.sections) for (const row of section.rows) tags[row.token] = row.on;
  return { tags, auto: purge.auto_on, days: String(purge.days) };
}

function ManualRun({ purge, refresh }: { purge: PurgePayload; refresh: () => void }) {
  const [pending, setPending] = useState(false);
  const { ready, last_run: last } = purge;
  const submit = async () => {
    if (!ready.total || pending) return;
    setPending(true);
    await run(
      purge.run_action,
      {},
      {
        ask: { title: "حذف کامل", text: `${fa(ready.orders)} سفارش و ${fa(ready.payments)} پرداخت برای همیشه پاک شوند؟`, confirmLabel: "حذف کامل", tone: "danger" },
        refresh,
      },
    );
    setPending(false);
  };
  return (
    <section className="inset-tile flex flex-col gap-3 rounded-lg p-4" aria-label="حذف دستی">
      <div className="flex flex-col gap-0.5">
        <h4 className="text-sm font-semibold text-foreground">حذف دستی</h4>
        <p className="text-xs text-muted">بر اساس تنظیمات ذخیره‌شدهٔ پایین.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile icon="solar:trash-bin-trash-bold" tone="red" label="آمادهٔ حذف" value={fa(ready.total)} hint={`${fa(ready.orders)} سفارش · ${fa(ready.payments)} پرداخت`} />
        <StatTile
          icon="solar:history-bold"
          tone="gray"
          label="آخرین حذف"
          value={last ? <Ltr>{last.at}</Ltr> : "—"}
          hint={last ? `${last.kind} · ${fa(last.orders)} سفارش · ${fa(last.payments)} پرداخت` : undefined}
        />
      </div>
      <div>
        <Button variant="danger" isDisabled={!ready.total} isPending={pending} onPress={() => void submit()}>
          حذف کامل الان
        </Button>
      </div>
    </section>
  );
}

function Rules({ purge, refresh }: { purge: PurgePayload; refresh: () => void }) {
  const [state, setState] = useState<RulesState>(() => initialRules(purge));
  const [pending, setPending] = useState(false);
  const days = Number(state.days);
  const validDays = /^\d+$/.test(state.days) && days >= purge.min_days && days <= purge.max_days;

  const submit = async () => {
    if (!validDays || pending) return;
    setPending(true);
    const fields: Record<string, string> = { days: state.days };
    for (const [token, on] of Object.entries(state.tags)) if (on) fields[`t_${token}`] = "1";
    if (state.auto) fields.auto = "1";
    await run(purge.rules_action, fields, { success: "قواعد حذف ذخیره شد", refresh });
    setPending(false);
  };

  return (
    <form
      className="inset-tile flex flex-col gap-4 rounded-lg p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-0.5">
        <h4 className="text-sm font-semibold text-foreground">حذف کامل از پایگاه داده</h4>
        <p className="text-xs leading-5 text-muted">وضعیت‌های روشن، با همهٔ ردیف‌های وابسته برای همیشه پاک می‌شوند. سرویس مشتری و پرداخت‌های در جریان دست نمی‌خورند.</p>
      </div>
      {purge.sections.map((section) => (
        <div key={section.title} className="flex flex-col gap-2">
          <h5 className="text-xs font-semibold text-muted">{section.title}</h5>
          <div className="grid gap-2 sm:grid-cols-2">
            {section.rows.map((row) => (
              <Switch
                key={row.token}
                isSelected={state.tags[row.token] === true}
                onChange={(on) => setState((prev) => ({ ...prev, tags: { ...prev.tags, [row.token]: on } }))}
                aria-label={`حذف ${section.title} ${row.label}`}
                className="w-full justify-between"
              >
                <Switch.Content>
                  <StatusChip color={TAG_COLORS[row.status] ?? "default"}>{row.label}</StatusChip>
                </Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch>
            ))}
          </div>
        </div>
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        <Switch isSelected={state.auto} onChange={(auto) => setState((prev) => ({ ...prev, auto }))} aria-label="حذف خودکار" className="w-full justify-between">
          <Switch.Content className="flex flex-col text-sm font-medium text-foreground">
            حذف خودکار
            <small className="text-xs font-normal text-muted">هر ساعت</small>
          </Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
        <TextField isRequired value={state.days} onChange={(next) => setState((prev) => ({ ...prev, days: next }))} inputMode="numeric" isInvalid={!validDays}>
          <Label>قدیمی‌تر از (روز)</Label>
          <Input dir="ltr" className="text-start" />
        </TextField>
      </div>
      <div>
        <Button type="submit" className="button--ink" isPending={pending} isDisabled={!validDays}>
          ذخیره تنظیمات
        </Button>
      </div>
    </form>
  );
}

export function PurgePanel({ purge, refresh }: { purge: PurgePayload; refresh: () => void }) {
  // A fresh answer from the server (after saving or running) restarts the forms from it.
  const signature = JSON.stringify([purge.sections, purge.days, purge.auto_on, purge.ready, purge.last_run]);
  return (
    <div className="flex flex-col gap-4">
      <ManualRun key={`run:${signature}`} purge={purge} refresh={refresh} />
      <Rules key={`rules:${signature}`} purge={purge} refresh={refresh} />
    </div>
  );
}
