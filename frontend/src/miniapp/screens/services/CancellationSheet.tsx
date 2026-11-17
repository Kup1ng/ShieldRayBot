"use client";

import { Chip, TextArea } from "@heroui/react";
import { useId, useState } from "react";

import { api } from "../../core/api";
import { money } from "../../core/format";
import { confirmAction } from "../../core/telegram";
import { failureText, useMini } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { SheetLoad } from "./SheetStates";
import type { CancellationRow } from "./types";
import { useLoad } from "./useLoad";

const REASON_MAX = 1000;
const REOPENABLE = new Set(["rejected", "withdrawn"]);

function StatusCard({ row }: { row: CancellationRow }) {
  return (
    <section className="inset-tile flex flex-col gap-2 rounded-lg p-4" aria-label="وضعیت درخواست لغو">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">وضعیت درخواست</h3>
        <Chip size="sm" variant="soft" color={row.status === "approved" ? "success" : REOPENABLE.has(row.status) ? "danger" : "warning"}>
          <Chip.Label>{row.label}</Chip.Label>
        </Chip>
      </div>
      {row.refund_amount === null || row.refund_amount === undefined ? null : (
        <p className="text-sm text-foreground/80">
          اعتبار برگشتی: <bdi className="num font-semibold">{money(row.refund_amount)}</bdi>
        </p>
      )}
      {row.operator_note ? <p className="text-sm whitespace-pre-line text-foreground/80">{row.operator_note}</p> : null}
    </section>
  );
}

function RequestForm({ serviceId, onSubmitted }: { serviceId: number; onSubmitted: () => void }) {
  const { run, busy, notify } = useMini();
  const [reason, setReason] = useState("");
  const fieldId = useId();
  const key = `cancel:${serviceId}`;
  const text = reason.trim();

  const submit = () => {
    if (!text) return;
    void run(key, async () => {
      const ok = await confirmAction("درخواست لغو این سرویس ثبت شود؟ سرویس تا تأیید اپراتور فعال می‌ماند.");
      if (!ok) return;
      try {
        await api(`/api/mini/service/${serviceId}/cancellation`, { method: "POST", body: { reason: text } });
        notify("درخواست ثبت شد");
        setReason("");
        onSubmitted();
      } catch (err) {
        notify(failureText(err, "نتیجهٔ ثبت درخواست مشخص نشد؛ وضعیت لغو را دوباره بررسی کنید."), "err");
      }
    });
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
        دلیل لغو
      </label>
      <TextArea id={fieldId} value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={REASON_MAX} required fullWidth />
      <ActionButton type="submit" tone="danger" fullWidth isPending={busy(key)} isDisabled={!text} icon="solar:close-circle-bold">
        ثبت درخواست لغو
      </ActionButton>
    </form>
  );
}

/** The cancellation request of one service: what is on file, and a form while a new one may be made. */
export function CancellationSheet({ serviceId, onChanged }: { serviceId: number; onChanged: () => void }) {
  const { state, reload } = useLoad(async () => (await api<{ request: CancellationRow | null }>(`/api/mini/service/${serviceId}/cancellation`)).request);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-6 text-muted">
        مبلغ برگشتی را اپراتور تعیین می‌کند و پس از تأیید غیرفعال‌شدن سرویس به کیف پول برمی‌گردد. ثبت درخواست، سرویس را غیرفعال نمی‌کند.
      </p>
      <SheetLoad state={state} rows={2} onRetry={() => reload()}>
        {(row) => (
          <>
            {row ? <StatusCard row={row} /> : null}
            {!row || REOPENABLE.has(row.status) ? (
              <RequestForm
                serviceId={serviceId}
                onSubmitted={() => {
                  reload();
                  onChanged();
                }}
              />
            ) : null}
          </>
        )}
      </SheetLoad>
    </div>
  );
}
