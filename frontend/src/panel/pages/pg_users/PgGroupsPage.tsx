"use client";

import { Button, Table } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { run } from "../../core/actions";
import { useJson, useQuery, useUrlFlash } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { BulkBar, Ltr, RowMenu, StatusChip, type MenuAction } from "../../ui/Data";
import { CheckGroup, FormModal, SwitchInput, TextInput } from "../../ui/Fields";
import { GlassSection, PageHeader } from "../../ui/Page";
import { EmptyBlock, Loadable, Notice } from "../../ui/States";
import { countText, eligibleIds, runBulk } from "./bulk";
import { groupBodyFields, groupError, groupForm, type GroupForm } from "./forms";
import { useRowSelection } from "./selection";
import { useDialogPost } from "./submit";
import type { PgGroupRow, PgGroupsPayload } from "./types";
import { FormError, FormFooter, PgTabs, selectCell, selectColumn } from "./ui";

const BULK_URL = "/pg/groups/bulk-action";

function GroupFormBody({ row, inboundTags, onClose, refresh }: { row: PgGroupRow | null; inboundTags: string[]; onClose: () => void; refresh: () => void }) {
  const [form, setForm] = useState<GroupForm>(() => groupForm(row));
  const { pending, error, setError, post } = useDialogPost({ onClose, refresh });
  const patch = (next: Partial<GroupForm>) => setForm((current) => ({ ...current, ...next }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = groupError(form);
    if (problem) setError(problem);
    else void post(row ? `/pg/groups/${row.id}/edit` : "/pg/groups", groupBodyFields(form, { editing: row !== null }));
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <TextInput label="نام گروه" value={form.name} onChange={(name) => patch({ name })} required placeholder="مثلاً default" />
      <CheckGroup label="اینباندها" options={inboundTags.map((tag) => ({ id: tag, label: tag }))} selected={form.tags} onChange={(tags) => patch({ tags })} empty="اینباندی یافت نشد." columns />
      {row ? <SwitchInput label="غیرفعال" checked={form.disabled} onChange={(disabled) => patch({ disabled })} /> : null}
      <FormFooter submitLabel={row ? "ذخیره تغییرات" : "ساخت در پاسارگارد"} pending={pending} onCancel={onClose} />
    </form>
  );
}

type DialogTarget = { open: boolean; row: PgGroupRow | null };

function GroupDialog({ target, inboundTags, onClose, refresh }: { target: DialogTarget; inboundTags: string[]; onClose: () => void; refresh: () => void }) {
  const { open, row } = target;
  return (
    <FormModal isOpen={open} onOpenChange={(next) => !next && onClose()} title={row ? `ویرایش گروه #${fa(row.id)}` : "ساخت گروه"} description={row ? "نام و تگ‌های گروه" : "گروه پاسارگارد جدید"}>
      {open ? <GroupFormBody key={row?.id ?? "new"} row={row} inboundTags={inboundTags} onClose={onClose} refresh={refresh} /> : null}
    </FormModal>
  );
}

function GroupsTable({ data, selection, onEdit, onDelete }: { data: PgGroupsPayload; selection: ReturnType<typeof useRowSelection>; onEdit: (row: PgGroupRow) => void; onDelete: (row: PgGroupRow) => void }) {
  const selectable = data.can.delete;
  const actionsFor = (row: PgGroupRow): MenuAction[] => {
    if (row.id === null) return [];
    const actions: MenuAction[] = [];
    if (data.can.update) actions.push({ id: "edit", label: "ویرایش", icon: "solar:pen-linear", onAction: () => onEdit(row) });
    if (data.can.delete) actions.push({ id: "delete", label: "حذف", icon: "solar:trash-bin-trash-linear", danger: true, onAction: () => onDelete(row) });
    return actions;
  };
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="گروه‌های پاسارگارد" className="min-w-[560px]" selectionMode={selectable ? "multiple" : "none"} selectedKeys={selection.keys} onSelectionChange={selection.setKeys}>
          <Table.Header>
            {selectable ? selectColumn("انتخاب همهٔ گروه‌ها") : null}
            <Table.Column>شناسه</Table.Column>
            <Table.Column isRowHeader>نام</Table.Column>
            <Table.Column className="hidden md:table-cell">اینباندها</Table.Column>
            <Table.Column className="hidden md:table-cell">کاربران</Table.Column>
            <Table.Column>وضعیت</Table.Column>
            <Table.Column className="w-12">
              <span className="sr-only">عملیات</span>
            </Table.Column>
          </Table.Header>
          <Table.Body>
            {data.rows.map((row, index) => (
              <Table.Row key={row.id ?? `row-${index}`} id={row.id ?? `row-${index}`}>
                {selectable ? selectCell(`انتخاب ${row.name}`) : null}
                <Table.Cell>
                  <Ltr>{fa(row.id)}</Ltr>
                </Table.Cell>
                <Table.Cell>
                  <span dir="auto" className="font-medium">
                    {row.name || "—"}
                  </span>
                  <p className="mt-0.5 text-xs text-muted md:hidden">
                    <Ltr>{row.inbound_tags.join(" · ") || "—"}</Ltr> · {fa(row.total_users)} کاربر
                  </p>
                </Table.Cell>
                <Table.Cell className="hidden md:table-cell">
                  <Ltr className="text-muted">{row.inbound_tags.join(" · ") || "—"}</Ltr>
                </Table.Cell>
                <Table.Cell className="hidden md:table-cell">{fa(row.total_users)}</Table.Cell>
                <Table.Cell>
                  <StatusChip color={row.is_disabled ? "warning" : "success"}>{row.is_disabled ? "خاموش" : "فعال"}</StatusChip>
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

function GroupsBody({ data, reload, editId, clearEdit }: { data: PgGroupsPayload; reload: () => void; editId: number | null; clearEdit: () => void }) {
  const selection = useRowSelection(data.rows);
  // `?edit=<id>` opens that group's form once, like the old page.
  const fromAddress = editId !== null && data.can.update ? (data.rows.find((row) => row.id === editId) ?? data.edit_group) : null;
  const [dialog, setDialog] = useState<DialogTarget | null>(null);
  const target: DialogTarget = dialog ?? (fromAddress ? { open: true, row: fromAddress } : { open: false, row: null });
  const close = () => {
    setDialog({ open: false, row: null });
    if (editId !== null) clearEdit();
  };
  const deleteRow = (row: PgGroupRow) =>
    void run(`/pg/groups/${row.id}/delete`, {}, { ask: { title: "تأیید حذف", text: "این گروه حذف شود؟", confirmLabel: "حذف", tone: "danger" }, refresh: reload });
  const ids = eligibleIds(
    data.rows.map((row) => ({ id: row.id, ops: data.can.delete ? ["delete"] : [] })),
    selection.ids,
    "delete",
  );
  const buttons = ids.length
    ? [
        {
          op: "delete",
          label: "حذف",
          danger: true,
          count: ids.length,
          onPress: () =>
            void runBulk(BULK_URL, "/pg/groups", "delete", ids, { label: "حذف", danger: true, ask: (n) => ({ title: "حذف گروهی", text: countText("{n} گروه حذف شوند؟", n), confirmLabel: "حذف", tone: "danger" }) }, () => {
              selection.clear();
              reload();
            }),
        },
      ]
    : [];
  return (
    <>
      <PageHeader
        icon="solar:folder-with-files-bold"
        tone="orange"
        title="گروه‌ها"
        description="گروه‌های پاسارگارد و اینباندهای هر گروه"
        actions={
          data.can.create ? (
            <Button className="button--ink !h-12 !rounded-lg" onPress={() => setDialog({ open: true, row: null })}>
              <Icon name="solar:add-circle-bold" size={20} />
              ساخت گروه
            </Button>
          ) : null
        }
      />
      <PgTabs active="pg_groups" />
      {data.error ? <Notice tone="warning" title="پاسارگارد">{data.error}</Notice> : null}
      <GlassSection title="گروه‌های موجود">
        {data.rows.length === 0 ? (
          <EmptyBlock icon="solar:folder-with-files-linear" title="گروهی نیست" />
        ) : (
          <>
            <p className="num text-xs text-muted">{fa(data.rows.length)} گروه</p>
            <GroupsTable data={data} selection={selection} onEdit={(row) => setDialog({ open: true, row })} onDelete={deleteRow} />
          </>
        )}
      </GlassSection>
      <BulkBar selected={selection.ids.size} buttons={buttons} onClear={selection.clear} label="عملیات گروهی گروه‌ها" />
      <GroupDialog target={target} inboundTags={data.inbound_tags} onClose={close} refresh={reload} />
    </>
  );
}

export function PgGroupsContent() {
  useUrlFlash();
  const query = useQuery();
  const edit = query.get("edit");
  const editId = /^\d+$/.test(edit) ? Number(edit) : null;
  const state = useJson<PgGroupsPayload>(`/api/panel/pg/groups${editId !== null ? `?edit=${editId}` : ""}`);
  return (
    <Loadable state={state} rows={5}>
      {(data) => <GroupsBody key={editId ?? "none"} data={data} reload={state.reload} editId={editId} clearEdit={() => query.set({ edit: null }, { replace: true })} />}
    </Loadable>
  );
}

export function PgGroupsPage() {
  return (
    <PanelShell title="گروه‌های پاسارگارد">
      <PgGroupsContent />
    </PanelShell>
  );
}
