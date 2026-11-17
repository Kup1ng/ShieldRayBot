"use client";

import { Button } from "@heroui/react";
import { useEffect, useState, type FormEvent } from "react";

import { Icon } from "@/icons/Icon";

import { run } from "../../core/actions";
import { useJson, useUrlFlash } from "../../core/data";
import { fa, formatDateTime } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { Ltr, StatusChip } from "../../ui/Data";
import { SelectInput, SubmitButton, TextAreaInput } from "../../ui/Fields";
import { GlassSection, PageHeader } from "../../ui/Page";
import { Loadable } from "../../ui/States";
import { RowActions, SelectableTable, type Column } from "../catalog/Tables";
import { MarketingStrip } from "./sections";
import type { BroadcastRow } from "./types";
import type { ShopBroadcastData } from "./shopBroadcastTypes";

const PAGE = "/shop-broadcast";
/** An active send moves on its own; the table follows it without a manual reload. */
const POLL_MS = 5000;
const REQUEST_KEY_BYTES = 16;

const COLUMNS: Column[] = [
  { id: "id", label: "#", rowHeader: true },
  { id: "time", label: "زمان" },
  { id: "audience", label: "مخاطب", className: "hidden sm:table-cell" },
  { id: "text", label: "متن" },
  { id: "result", label: "نتیجه" },
  { id: "by", label: "توسط", className: "hidden md:table-cell" },
  { id: "status", label: "وضعیت" },
  { id: "actions", label: <span className="sr-only">عملیات</span> },
];

/** A fresh idempotency key (32 hex characters, the shape the server accepts). */
function newRequestKey(): string {
  const bytes = new Uint8Array(REQUEST_KEY_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function SendForm({ data, onSent }: { data: ShopBroadcastData; onSent: () => void }) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  // A failed or unanswered post keeps the same key, so sending again can never queue the message twice.
  const [requestKey, setRequestKey] = useState(data.request_key);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || !text.trim()) return;
    setPending(true);
    try {
      const result = await run(PAGE, { text, request_key: requestKey }, { success: "پیام در صف ارسال قرار گرفت.", refresh: onSent });
      if (result?.ok) {
        setText("");
        setRequestKey(newRequestKey());
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <GlassSection title="ارسال پیام" description="پیام فقط برای مشتریان همین فروشگاه ارسال می‌شود.">
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <SelectInput
          label="مخاطبان"
          value="all"
          onChange={() => undefined}
          options={data.audiences.map((audience) => ({ id: audience.value, label: audience.label }))}
          disabled
          help="فقط مشتریان همین فروشگاه؛ نمایندگان و ادمین‌های پلتفرم مخاطب نیستند"
        />
        <TextAreaInput
          label="متن پیام"
          value={text}
          onChange={setText}
          rows={8}
          maxLength={data.max_text}
          required
          placeholder="متن پیام…"
          help="متن به‌صورت امن ارسال می‌شود. ارسال از صف محدود انجام می‌شود؛ از اسپم خودداری کنید. سقف گسترده: روزی یک‌بار."
        />
        <div>
          <SubmitButton pending={pending}>
            <Icon name="solar:plain-bold" size={20} />
            ارسال پیام
          </SubmitButton>
        </div>
      </form>
    </GlassSection>
  );
}

function RowStatus({ row }: { row: BroadcastRow }) {
  if (row.is_active) return <StatusChip color="warning">{row.status_label}</StatusChip>;
  if (row.status === "failed") return <StatusChip color="danger">{row.status_label}</StatusChip>;
  if (row.status === "cancelled") return <StatusChip color="default">{row.status_label}</StatusChip>;
  if (row.fail_count) return <StatusChip color="danger">{fa(row.fail_count)} ناموفق</StatusChip>;
  return <StatusChip color="success">موفق</StatusChip>;
}

function ResultCell({ row }: { row: BroadcastRow }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Ltr>
        {fa(row.ok_count)}/{fa(row.total)}
      </Ltr>
      <span className="text-xs text-muted">
        {row.fail_count ? `ناموفق ${fa(row.fail_count)}` : null}
        {row.fail_count && row.review_count ? " · " : null}
        {row.review_count ? `نامشخص ${fa(row.review_count)}` : null}
      </span>
    </div>
  );
}

/** A running send is stopped first; a finished one is deleted. Both ask what will happen. */
function rowAction(row: BroadcastRow, refresh: () => void) {
  if (row.is_active) {
    return {
      id: "cancel",
      label: "توقف",
      icon: "solar:stop-circle-bold",
      tone: "danger" as const,
      confirmText: { message: "توقف ارسال", description: "ارسال متوقف شود؟ پیام‌های فرستاده‌شده برنمی‌گردند.", confirmLabel: "توقف" },
      run: () => void run(`${PAGE}/history/${row.id}/cancel`, {}, { success: "ارسال متوقف شد.", refresh }),
    };
  }
  return {
    id: "delete",
    label: "حذف",
    icon: "solar:trash-bin-trash-bold",
    tone: "danger" as const,
    confirmText: { message: "تأیید حذف", description: "این رکورد حذف شود؟", confirmLabel: "حذف" },
    run: () => void run(`${PAGE}/history/${row.id}/delete`, {}, { success: "رکورد حذف شد.", refresh }),
  };
}

function History({ rows, reload }: { rows: BroadcastRow[]; reload: () => void }) {
  const anyActive = rows.some((row) => row.is_active);
  useEffect(() => {
    if (!anyActive) return;
    const timer = window.setInterval(reload, POLL_MS);
    return () => window.clearInterval(timer);
  }, [anyActive, reload]);

  const clearAll = () =>
    void run(`${PAGE}/history/clear`, {}, {
      ask: { title: "پاک کردن تاریخچه", text: "همه تاریخچه پیام‌های گروهی این فروشگاه پاک شود؟", confirmLabel: "پاک کردن", tone: "danger" },
      success: "تاریخچه پاک شد.",
      refresh: reload,
    });

  return (
    <GlassSection
      title="تاریخچه ارسال"
      description={rows.length ? `${fa(rows.length)} پیام` : undefined}
      actions={
        rows.length ? (
          <Button size="sm" variant="ghost" className="bg-danger/10 text-danger" onPress={clearAll}>
            <Icon name="solar:trash-bin-trash-linear" size={18} />
            حذف تاریخچه
          </Button>
        ) : null
      }
    >
      <SelectableTable
        ariaLabel="تاریخچه ارسال"
        columns={COLUMNS}
        rows={rows}
        rowId={(row) => row.id}
        empty="هنوز پیامی ارسال نشده"
        minWidth={720}
        cells={(row) => [
          <Ltr key="i">{fa(row.id)}</Ltr>,
          <Ltr key="t" className="text-muted">{formatDateTime(row.created_at)}</Ltr>,
          <span key="a">{row.audience_label}</span>,
          <span key="x" dir="auto" className="line-clamp-2 max-w-[260px] break-words">
            {row.text_snippet}
            {row.text_truncated ? "…" : ""}
          </span>,
          <ResultCell key="r" row={row} />,
          <span key="b" className="text-muted">{row.created_by || "—"}</span>,
          <RowStatus key="s" row={row} />,
          <RowActions key="o" label={`عملیات پیام ${fa(row.id)}`} actions={[rowAction(row, reload)]} />,
        ]}
      />
    </GlassSection>
  );
}

function ShopBroadcastBody() {
  const resource = useJson<ShopBroadcastData>("/api/panel/shop-broadcast");
  useUrlFlash();
  return (
    <Loadable state={resource} rows={4}>
      {(data) => (
        <>
          <MarketingStrip sections={data.sections} />
          <div className="flex flex-col gap-6">
            <SendForm data={data} onSent={resource.reload} />
            <History rows={data.history} reload={resource.reload} />
          </div>
        </>
      )}
    </Loadable>
  );
}

export function ShopBroadcastPage() {
  return (
    <PanelShell title="پیام گروهی">
      <PageHeader icon="solar:chat-round-dots-bold" title="پیام گروهی" description="ارسال پیام به مشتریان فروشگاه و پیگیری وضعیت ارسال‌ها" />
      <ShopBroadcastBody />
    </PanelShell>
  );
}
