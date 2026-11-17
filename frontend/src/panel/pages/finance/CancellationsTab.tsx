"use client";

import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { useCallback, useState } from "react";

import { run } from "../../core/actions";
import { useJson, useQuery } from "../../core/data";
import { fa } from "../../core/format";
import { Ltr, StatusChip } from "../../ui/Data";
import { EmptyBlock, Loadable } from "../../ui/States";
import { GlassSection } from "../../ui/Page";
import { cancelNoticeLabel, faId } from "./format";
import type { CancellationRow, CancellationsPayload } from "./types";

const MAX_REFUND = 2147483647;
const NOTE_LIMIT = 1000;
const OPEN_FOR_APPROVAL = new Set(["pending", "review", "processing"]);

function ApproveForm({ row, refresh }: { row: CancellationRow; refresh: () => void }) {
  const locked = row.refund_amount !== null;
  const [amount, setAmount] = useState(locked ? String(row.refund_amount) : "");
  const [note, setNote] = useState(row.operator_note);
  const [pending, setPending] = useState(false);
  const valid = /^\d{1,13}$/.test(amount) && Number(amount) <= MAX_REFUND;

  const submit = async () => {
    if (!valid || pending) return;
    setPending(true);
    await run(
      `/service-cancellations/${row.id}/approve`,
      { amount, note },
      { ask: { title: "سرویس غیرفعال شود و مبلغ تعیین‌شده به کیف پول همین فروشگاه برگردد؟", confirmLabel: "تأیید لغو", tone: "warning" }, refresh },
    );
    setPending(false);
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <TextField isRequired isReadOnly={locked} value={amount} onChange={setAmount} inputMode="numeric">
        <Label>اعتبار برگشتی (تومان)</Label>
        <Input dir="ltr" className="text-start" />
      </TextField>
      <TextField value={note} onChange={setNote}>
        <Label>توضیح برای مشتری</Label>
        <TextArea rows={3} maxLength={NOTE_LIMIT} />
      </TextField>
      <div>
        <Button type="submit" className="button--ink" isPending={pending} isDisabled={!valid}>
          {row.status === "pending" ? "تأیید لغو و اعتبار" : "بررسی پنل و ادامهٔ تأیید"}
        </Button>
      </div>
    </form>
  );
}

function RejectForm({ row, refresh }: { row: CancellationRow; refresh: () => void }) {
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!note.trim() || pending) return;
    setPending(true);
    const result = await run(`/service-cancellations/${row.id}/reject`, { note }, { refresh });
    if (!result?.ok) setPending(false);
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <TextField isRequired value={note} onChange={setNote}>
        <Label>دلیل رد</Label>
        <TextArea rows={2} maxLength={NOTE_LIMIT} />
      </TextField>
      <div>
        <Button type="submit" variant="danger" isPending={pending} isDisabled={!note.trim()}>
          رد درخواست
        </Button>
      </div>
    </form>
  );
}

function RequestCard({ row, canApprove, refresh }: { row: CancellationRow; canApprove: boolean; refresh: () => void }) {
  return (
    <article className="inset-tile flex flex-col gap-3 rounded-lg p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">
          درخواست <Ltr>#{faId(row.id)}</Ltr> — <Ltr>{row.username}</Ltr>
        </h4>
        <StatusChip color={row.notification_status === "review" ? "warning" : "default"}>اعلان ربات: {cancelNoticeLabel(row.notification_status)}</StatusChip>
      </header>
      {row.notification_status === "review" ? (
        <p className="text-sm text-muted">نتیجهٔ ارسال اعلان قطعی نیست؛ پیام خودکار دوباره ارسال نمی‌شود. درخواست را از همین صفحه بررسی کنید.</p>
      ) : null}
      <p className="text-sm font-medium text-foreground">{row.status_label}</p>
      <p className="whitespace-pre-wrap text-sm text-foreground/80">دلیل: {row.reason}</p>
      {row.operator_note ? <p className="whitespace-pre-wrap text-sm text-foreground/80">توضیح اپراتور: {row.operator_note}</p> : null}
      {row.status === "approved" && row.refund_amount !== null ? (
        <p className="text-sm text-foreground/80">
          اعتبار برگشتی: <Ltr>{fa(row.refund_amount)}</Ltr> تومان
        </p>
      ) : null}
      {canApprove && OPEN_FOR_APPROVAL.has(row.status) ? <ApproveForm row={row} refresh={refresh} /> : null}
      {row.status === "pending" ? <RejectForm row={row} refresh={refresh} /> : null}
    </article>
  );
}

export function CancellationsTab() {
  const query = useQuery();
  const before = query.get("before");
  const state = useJson<CancellationsPayload>(`/api/panel/finance/cancellations${before ? `?before=${encodeURIComponent(before)}` : ""}`);
  const { reload } = state;
  const refresh = useCallback(() => reload(), [reload]);
  return (
    <GlassSection title="درخواست‌های لغو" description="درخواست مشتری برای لغو سرویس و بازگشت اعتبار">
      <p className="text-sm leading-6 text-muted">
        مبلغ را اپراتور به تومان تعیین می‌کند. اعتبار پس از تأیید غیرفعال‌شدن سرویس، به کیف پول مشتری در همین فروشگاه واریز می‌شود. نتیجهٔ نامشخص تا تلاش مجدد محفوظ می‌ماند.
      </p>
      <Loadable state={state}>
        {(data) =>
          data.rows.length ? (
            <div className="flex flex-col gap-3">
              {data.rows.map((row) => (
                <RequestCard key={`${row.id}:${row.status}`} row={row} canApprove={data.can_approve} refresh={refresh} />
              ))}
              {data.next_before ? (
                <div>
                  <Button variant="outline" onPress={() => query.set({ before: String(data.next_before) })}>
                    درخواست‌های قدیمی‌تر
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyBlock title="درخواستی موجود نیست." />
          )
        }
      </Loadable>
    </GlassSection>
  );
}
