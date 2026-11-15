"use client";

import { Button, Table } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { run } from "../../core/actions";
import { useJson, useUrlFlash } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { BulkBar, Ltr, RowMenu, type MenuAction } from "../../ui/Data";
import { CheckGroup, FormGrid, FormModal, TextInput } from "../../ui/Fields";
import { GlassSection, PageHeader } from "../../ui/Page";
import { EmptyBlock, Loadable, Notice } from "../../ui/States";
import { countText, eligibleIds, runBulk } from "./bulk";
import { groupLabels, optionList, templateDurationText } from "./format";
import { templateError, templateFields, templateForm, type TemplateForm } from "./forms";
import { useRowSelection } from "./selection";
import { useDialogPost } from "./submit";
import type { PgOption, PgTemplateRow, PgTemplatesPayload } from "./types";
import { FormError, FormFooter, PgTabs, selectCell, selectColumn } from "./ui";

const LIST_PATH = "/api/panel/pg/templates";
const BULK_URL = "/pg/templates/bulk-action";

function TemplateFormBody({ row, groups, onClose, refresh }: { row: PgTemplateRow | null; groups: PgOption[]; onClose: () => void; refresh: () => void }) {
  const [form, setForm] = useState<TemplateForm>(() => templateForm(row));
  const { pending, error, setError, post } = useDialogPost({ onClose, refresh });
  const patch = (next: Partial<TemplateForm>) => setForm((current) => ({ ...current, ...next }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = templateError(form);
    if (problem) setError(problem);
    else void post(row ? `/pg/templates/${row.id}/edit` : "/pg/templates", templateFields(form));
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <FormGrid cols={3}>
        <TextInput label="نام تمپلیت" value={form.name} onChange={(name) => patch({ name })} required placeholder="مثلاً ماهانه ۳۰ گیگ" />
        <TextInput label="حجم (گیگابایت)" type="number" min={0} step={0.1} value={form.gb} onChange={(gb) => patch({ gb })} placeholder="30" help="خالی = نامحدود" />
        <TextInput label="مدت (روز)" type="number" min={1} value={form.days} onChange={(days) => patch({ days })} required />
      </FormGrid>
      <CheckGroup label="گروه‌های پاسارگارد" options={optionList(groups)} selected={form.groupIds} onChange={(groupIds) => patch({ groupIds })} empty="گروهی یافت نشد — ابتدا در بخش گروه‌ها بسازید." columns />
      <FormFooter submitLabel={row ? "ذخیره تغییرات" : "ساخت در پاسارگارد"} pending={pending} onCancel={onClose} />
    </form>
  );
}

/** Create (`row` null) or edit one template; `open` false keeps the dialog closed and its state fresh. */
function TemplateDialog({ open, row, groups, onClose, refresh }: { open: boolean; row: PgTemplateRow | null; groups: PgOption[]; onClose: () => void; refresh: () => void }) {
  return (
    <FormModal isOpen={open} onOpenChange={(next) => !next && onClose()} title={row ? `ویرایش تمپلیت #${fa(row.id)}` : "ساخت تمپلیت جدید"} description={row ? "تنظیمات تمپلیت" : "تمپلیت آماده پاسارگارد"}>
      {open ? <TemplateFormBody key={row?.id ?? "new"} row={row} groups={groups} onClose={onClose} refresh={refresh} /> : null}
    </FormModal>
  );
}

function TemplatesTable({ data, selection, onEdit, onDelete }: { data: PgTemplatesPayload; selection: ReturnType<typeof useRowSelection>; onEdit: (row: PgTemplateRow) => void; onDelete: (row: PgTemplateRow) => void }) {
  const selectable = data.can.delete;
  const actionsFor = (row: PgTemplateRow): MenuAction[] => {
    if (row.id === null) return [];
    const actions: MenuAction[] = [];
    if (data.can.update) actions.push({ id: "edit", label: "ویرایش", icon: "solar:pen-linear", onAction: () => onEdit(row) });
    if (data.can.delete) actions.push({ id: "delete", label: "حذف", icon: "solar:trash-bin-trash-linear", danger: true, onAction: () => onDelete(row) });
    return actions;
  };
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="تمپلیت‌های پاسارگارد" className="min-w-[560px]" selectionMode={selectable ? "multiple" : "none"} selectedKeys={selection.keys} onSelectionChange={selection.setKeys}>
          <Table.Header>
            {selectable ? selectColumn("انتخاب همهٔ تمپلیت‌ها") : null}
            <Table.Column className="hidden md:table-cell">شناسه</Table.Column>
            <Table.Column isRowHeader>نام</Table.Column>
            <Table.Column>حجم</Table.Column>
            <Table.Column className="hidden md:table-cell">مدت</Table.Column>
            <Table.Column className="hidden md:table-cell">گروه‌ها</Table.Column>
            <Table.Column className="w-12">
              <span className="sr-only">عملیات</span>
            </Table.Column>
          </Table.Header>
          <Table.Body>
            {data.rows.map((row, index) => (
              <Table.Row key={row.id ?? `row-${index}`} id={row.id ?? `row-${index}`}>
                {selectable ? selectCell(`انتخاب ${row.name}`) : null}
                <Table.Cell className="hidden md:table-cell">
                  <Ltr>{fa(row.id)}</Ltr>
                </Table.Cell>
                <Table.Cell>
                  <span dir="auto" className="font-medium">
                    {row.name || "—"}
                  </span>
                  <p className="mt-0.5 text-xs text-muted md:hidden">
                    {templateDurationText(row.expire_days)} · گروه <Ltr>{row.group_ids.join("، ") || "—"}</Ltr>
                  </p>
                </Table.Cell>
                <Table.Cell>{row.limit_text}</Table.Cell>
                <Table.Cell className="hidden md:table-cell">{templateDurationText(row.expire_days)}</Table.Cell>
                <Table.Cell className="hidden md:table-cell">
                  {row.group_ids.length ? (
                    <span dir="auto" className="text-sm">
                      {groupLabels(row.group_ids, data.groups).join("، ")}
                    </span>
                  ) : (
                    "—"
                  )}
                </Table.Cell>
                <Table.Cell>
                  <RowMenu label={`عملیات ${row.name}`} actions={actionsFor(row)} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

type DialogTarget = { open: boolean; row: PgTemplateRow | null };

function TemplatesBody({ data, reload }: { data: PgTemplatesPayload; reload: () => void }) {
  const selection = useRowSelection(data.rows);
  const [dialog, setDialog] = useState<DialogTarget>({ open: false, row: null });
  const close = () => setDialog({ open: false, row: null });
  const deleteRow = (row: PgTemplateRow) =>
    void run(`/pg/templates/${row.id}/delete`, {}, { ask: { title: "تأیید حذف", text: "این تمپلیت حذف شود؟", confirmLabel: "حذف", tone: "danger" }, refresh: reload });
  const bulkRows = data.rows.map((row) => ({ id: row.id, ops: data.can.delete ? ["delete"] : [] }));
  const ids = eligibleIds(bulkRows, selection.ids, "delete");
  const buttons = ids.length
    ? [
        {
          op: "delete",
          label: "حذف",
          danger: true,
          count: ids.length,
          onPress: () =>
            void runBulk(BULK_URL, "/pg/templates", "delete", ids, { label: "حذف", danger: true, ask: (n) => ({ title: "حذف گروهی", text: countText("{n} تمپلیت حذف شوند؟", n), confirmLabel: "حذف", tone: "danger" }) }, () => {
              selection.clear();
              reload();
            }),
        },
      ]
    : [];
  return (
    <>
      <PageHeader
        icon="solar:document-text-bold"
        tone="teal"
        title="تمپلیت‌های کاربر"
        description="قالب‌های آماده برای ساخت سریع کاربر با حجم، مدت و گروه ثابت"
        actions={
          data.can.create ? (
            <Button className="button--ink !h-12 !rounded-lg" onPress={() => setDialog({ open: true, row: null })}>
              <Icon name="solar:add-circle-bold" size={20} />
              ساخت تمپلیت
            </Button>
          ) : null
        }
      />
      <PgTabs active="pg_templates" />
      {data.error ? <Notice tone="warning" title="پاسارگارد">{data.error}</Notice> : null}
      <GlassSection title="تمپلیت‌های موجود">
        {data.rows.length === 0 ? (
          <EmptyBlock icon="solar:document-text-linear" title="تمپلیتی نیست" />
        ) : (
          <>
            <p className="num text-xs text-muted">{fa(data.rows.length)} تمپلیت</p>
            <TemplatesTable data={data} selection={selection} onEdit={(row) => setDialog({ open: true, row })} onDelete={deleteRow} />
          </>
        )}
      </GlassSection>
      <BulkBar selected={selection.ids.size} buttons={buttons} onClear={selection.clear} label="عملیات گروهی تمپلیت‌ها" />
      <TemplateDialog open={dialog.open} row={dialog.row} groups={data.groups} onClose={close} refresh={reload} />
    </>
  );
}

export function PgTemplatesContent() {
  useUrlFlash();
  const state = useJson<PgTemplatesPayload>(LIST_PATH);
  return (
    <Loadable state={state} rows={5}>
      {(data) => <TemplatesBody data={data} reload={state.reload} />}
    </Loadable>
  );
}

export function PgTemplatesPage() {
  return (
    <PanelShell title="تمپلیت‌های پاسارگارد">
      <PgTemplatesContent />
    </PanelShell>
  );
}
