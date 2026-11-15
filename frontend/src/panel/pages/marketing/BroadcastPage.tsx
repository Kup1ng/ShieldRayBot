"use client";

import { Button, Checkbox, Table, type Selection } from "@heroui/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Icon } from "@/icons/Icon";

import { run } from "../../core/actions";
import { useJson } from "../../core/data";
import { fa, formatDateTime } from "../../core/format";
import { BulkBar, Ltr, StatusChip } from "../../ui/Data";
import { SelectInput, TextAreaInput, SubmitButton } from "../../ui/Fields";
import { EmptyBlock, Loadable } from "../../ui/States";
import { PanelShell } from "../../layout/PanelShell";
import { GlassSection, PageHeader } from "../../ui/Page";
import { asOptions } from "./format";
import { MarketingStrip } from "./sections";
import type { BroadcastData, BroadcastRow, Option } from "./types";

const AUDIENCES: Option[] = [
  { value: "all", label: "همه کاربران فعال" },
  { value: "users", label: "فقط کاربران عادی" },
  { value: "resellers", label: "فقط نمایندگان" },
  { value: "admins", label: "فقط ادمین‌ها" },
];
const MAX_TEXT = 4000;
/** An active send moves on its own; the table follows it without a manual reload. */
const POLL_MS = 5000;

function SendForm({ onSent }: { onSent: () => void }) {
  const [audience, setAudience] = useState("all");
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || !text.trim()) return;
    setPending(true);
    const result = await run("/broadcast", { audience, text }, { success: "پیام در صف ارسال قرار گرفت.", refresh: onSent });
    if (result?.ok) setText("");
    setPending(false);
  };

  return (
    <GlassSection title="ارسال پیام" description="پیام برای کاربران ربات اصلی ارسال می‌شود.">
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <SelectInput label="مخاطبان" value={audience} options={asOptions(AUDIENCES)} onChange={setAudience} help="گروه دریافت‌کننده پیام را انتخاب کنید" />
        <TextAreaInput
          label="متن پیام (HTML ساده تلگرام مجاز است)"
          value={text}
          onChange={setText}
          rows={8}
          maxLength={MAX_TEXT}
          required
          placeholder="متن پیام…"
          help="ارسال ممکن است چند دقیقه طول بکشد. از اسپم خودداری کنید."
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

function RowStatus({ row }: { row: BroadcastRow }) {
  if (row.is_active) return <StatusChip color="warning">{row.status_label}</StatusChip>;
  if (row.status === "cancelled") return <StatusChip color="default">{row.status_label}</StatusChip>;
  if (row.fail_count) return <StatusChip color="danger">{fa(row.fail_count)} ناموفق</StatusChip>;
  return <StatusChip color="success">موفق</StatusChip>;
}

function RowAction({ row, refresh }: { row: BroadcastRow; refresh: () => void }) {
  if (row.is_active) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="bg-danger/10 text-danger"
        onPress={() =>
          void run(`/broadcast/history/${row.id}/cancel`, {}, {
            ask: { title: "توقف ارسال", text: "ارسال متوقف شود؟ پیام‌های فرستاده‌شده برنمی‌گردند.", confirmLabel: "توقف", tone: "danger" },
            refresh,
          })
        }
      >
        توقف
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      className="bg-danger/10 text-danger"
      onPress={() =>
        void run(`/broadcast/history/${row.id}/delete`, {}, {
          ask: { title: "تأیید حذف", text: "این رکورد حذف شود؟", confirmLabel: "حذف", tone: "danger" },
          refresh,
        })
      }
    >
      حذف
    </Button>
  );
}

function HistoryTable({ rows, refresh }: { rows: BroadcastRow[]; refresh: () => void }) {
  const [keys, setKeys] = useState<Selection>(new Set());
  // A running or queued send is stopped first; the server refuses to delete it.
  const deletable = useMemo(() => rows.filter((row) => !row.is_active).map((row) => row.id), [rows]);
  const disabled = useMemo(() => rows.filter((row) => row.is_active).map((row) => row.id), [rows]);
  const selected = useMemo(() => {
    if (keys === "all") return deletable;
    const chosen = new Set([...keys].map(Number));
    return deletable.filter((id) => chosen.has(id));
  }, [keys, deletable]);

  const bulkDelete = () =>
    void run("/broadcast/history/bulk-action", { action: "delete", ids: selected.map(String), return_to: "/broadcast" }, {
      ask: { title: "حذف گروهی", text: `${fa(selected.length)} رکورد تاریخچه حذف شوند؟`, confirmLabel: "حذف", tone: "danger" },
      refresh: () => {
        setKeys(new Set());
        refresh();
      },
    });

  return (
    <>
      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="تاریخچه ارسال"
            className="min-w-[720px]"
            selectionMode="multiple"
            selectedKeys={keys}
            onSelectionChange={setKeys}
            disabledKeys={disabled}
          >
            <Table.Header>
              <Table.Column className="w-10 pe-0">
                <Checkbox aria-label="انتخاب همهٔ رکوردها" slot="selection">
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox.Content>
                </Checkbox>
              </Table.Column>
              <Table.Column isRowHeader>#</Table.Column>
              <Table.Column>زمان</Table.Column>
              <Table.Column>مخاطب</Table.Column>
              <Table.Column>متن</Table.Column>
              <Table.Column>نتیجه</Table.Column>
              <Table.Column className="hidden md:table-cell">توسط</Table.Column>
              <Table.Column>وضعیت</Table.Column>
              <Table.Column className="w-24">
                <span className="sr-only">عملیات</span>
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.id} id={row.id}>
                  <Table.Cell className="pe-0">
                    <Checkbox aria-label={`انتخاب رکورد ${fa(row.id)}`} slot="selection" variant="secondary">
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox.Content>
                    </Checkbox>
                  </Table.Cell>
                  <Table.Cell>
                    <Ltr>{fa(row.id)}</Ltr>
                  </Table.Cell>
                  <Table.Cell className="text-muted">
                    <Ltr>{formatDateTime(row.created_at)}</Ltr>
                  </Table.Cell>
                  <Table.Cell>{row.audience_label}</Table.Cell>
                  <Table.Cell className="max-w-[260px]">
                    <span dir="auto" className="line-clamp-2 break-words">
                      {row.text_snippet}
                      {row.text_truncated ? "…" : ""}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <ResultCell row={row} />
                  </Table.Cell>
                  <Table.Cell className="hidden text-muted md:table-cell">{row.created_by || "—"}</Table.Cell>
                  <Table.Cell>
                    <RowStatus row={row} />
                  </Table.Cell>
                  <Table.Cell>
                    <RowAction row={row} refresh={refresh} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      <BulkBar
        selected={selected.length}
        label="عملیات گروهی تاریخچه"
        onClear={() => setKeys(new Set())}
        buttons={[{ op: "delete", label: "حذف", count: selected.length, danger: true, onPress: bulkDelete }]}
      />
    </>
  );
}

function History({ rows, reload }: { rows: BroadcastRow[]; reload: () => void }) {
  const anyActive = rows.some((row) => row.is_active);
  useEffect(() => {
    if (!anyActive) return;
    const timer = window.setInterval(reload, POLL_MS);
    return () => window.clearInterval(timer);
  }, [anyActive, reload]);

  const clearAll = () =>
    void run("/broadcast/history/clear", {}, {
      ask: { title: "پاک کردن تاریخچه", text: "همه تاریخچه پیام‌های گروهی پاک شود؟", confirmLabel: "پاک کردن", tone: "danger" },
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
      {rows.length ? <HistoryTable rows={rows} refresh={reload} /> : <EmptyBlock icon="solar:letter-linear" title="هنوز پیامی ارسال نشده" />}
    </GlassSection>
  );
}

function BroadcastBody() {
  const resource = useJson<BroadcastData>("/api/panel/marketing/broadcast");
  return (
    <Loadable state={resource} rows={4}>
      {(data) => (
        <>
          <MarketingStrip sections={data.sections} />
          <div className="flex flex-col gap-6">
            <SendForm onSent={resource.reload} />
            <History rows={data.history} reload={resource.reload} />
          </div>
        </>
      )}
    </Loadable>
  );
}

export function BroadcastPage() {
  return (
    <PanelShell title="پیام گروهی">
      <PageHeader icon="solar:chat-round-dots-bold" title="پیام گروهی" description="ارسال پیام به کاربران ربات و پیگیری وضعیت ارسال‌ها" />
      <BroadcastBody />
    </PanelShell>
  );
}
