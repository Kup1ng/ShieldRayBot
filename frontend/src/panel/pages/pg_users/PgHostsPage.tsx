"use client";

import { Button, Table } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { run } from "../../core/actions";
import { useJson, useUrlFlash } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { BulkBar, Ltr, RowMenu, StatusChip, type MenuAction } from "../../ui/Data";
import { FormGrid, FormModal, SelectInput, TextInput } from "../../ui/Fields";
import { GlassSection, PageHeader } from "../../ui/Page";
import { EmptyBlock, Loadable, Notice } from "../../ui/States";
import { AddressListInput } from "./AddressListInput";
import { availableOps, countText, eligibleIds, runBulk, type BulkSpec } from "./bulk";
import { hostError, hostFields, hostForm, type HostForm } from "./forms";
import { useRowSelection } from "./selection";
import { useDialogPost } from "./submit";
import type { PgHostRow, PgHostsPayload } from "./types";
import { FormError, FormFooter, PgTabs, selectCell, selectColumn } from "./ui";

const BULK_URL = "/pg/hosts/bulk-action";

const BULK: Record<string, BulkSpec> = {
  toggle: { label: "روشن/خاموش", ask: (n) => ({ title: "تغییر وضعیت گروهی", text: countText("وضعیت {n} هاست تغییر کند؟", n), confirmLabel: "اعمال", tone: "warning" }) },
  delete: { label: "حذف", danger: true, ask: (n) => ({ title: "حذف گروهی", text: countText("{n} هاست حذف شوند؟", n), confirmLabel: "حذف", tone: "danger" }) },
};
const BULK_ORDER = ["toggle", "delete"];

function HostFormBody({ row, inboundTags, onClose, refresh }: { row: PgHostRow | null; inboundTags: string[]; onClose: () => void; refresh: () => void }) {
  const [form, setForm] = useState<HostForm>(() => hostForm(row));
  const { pending, error, setError, post } = useDialogPost({ onClose, refresh });
  const patch = (next: Partial<HostForm>) => setForm((current) => ({ ...current, ...next }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = hostError(form);
    if (problem) setError(problem);
    else void post(row ? `/pg/hosts/${row.id}/edit` : "/pg/hosts", hostFields(form));
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <FormGrid>
        <TextInput label="عنوان (remark)" value={form.remark} onChange={(remark) => patch({ remark })} required placeholder="IR-1" />
        <SelectInput label="اینباند" value={form.inboundTag} onChange={(inboundTag) => patch({ inboundTag })} options={inboundTags.map((tag) => ({ id: tag, label: tag }))} placeholder="— انتخاب —" />
      </FormGrid>
      <AddressListInput label="آدرس‌ها" value={form.addresses} onChange={(addresses) => patch({ addresses })} placeholder="1.2.3.4 یا domain.com" help="هر آدرس را جداگانه اضافه کنید." />
      <FormGrid>
        <TextInput label="پورت (اختیاری)" type="number" value={form.port} onChange={(port) => patch({ port })} placeholder="443" />
        <TextInput label="اولویت" type="number" value={form.priority} onChange={(priority) => patch({ priority })} />
      </FormGrid>
      <FormFooter submitLabel={row ? "ذخیره تغییرات" : "ساخت در پاسارگارد"} pending={pending} onCancel={onClose} />
    </form>
  );
}

type DialogTarget = { open: boolean; row: PgHostRow | null };

function HostDialog({ target, inboundTags, onClose, refresh }: { target: DialogTarget; inboundTags: string[]; onClose: () => void; refresh: () => void }) {
  const { open, row } = target;
  return (
    <FormModal isOpen={open} onOpenChange={(next) => !next && onClose()} title={row ? `ویرایش هاست #${fa(row.id)}` : "ساخت هاست"} description={row ? "تنظیمات هاست" : "هاست جدید پاسارگارد"}>
      {open ? <HostFormBody key={row?.id ?? "new"} row={row} inboundTags={inboundTags} onClose={onClose} refresh={refresh} /> : null}
    </FormModal>
  );
}

type RowHandlers = { onEdit: (row: PgHostRow) => void; onToggle: (row: PgHostRow) => void; onDelete: (row: PgHostRow) => void };

function HostsTable({ data, selection, handlers }: { data: PgHostsPayload; selection: ReturnType<typeof useRowSelection>; handlers: RowHandlers }) {
  const selectable = data.can.update || data.can.delete;
  const actionsFor = (row: PgHostRow): MenuAction[] => {
    if (row.id === null) return [];
    const actions: MenuAction[] = [];
    if (data.can.update) {
      actions.push({ id: "edit", label: "ویرایش", icon: "solar:pen-linear", onAction: () => handlers.onEdit(row) });
      actions.push({ id: "toggle", label: row.is_disabled ? "فعال" : "خاموش", icon: "solar:power-linear", onAction: () => handlers.onToggle(row) });
    }
    if (data.can.delete) actions.push({ id: "delete", label: "حذف", icon: "solar:trash-bin-trash-linear", danger: true, onAction: () => handlers.onDelete(row) });
    return actions;
  };
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="هاست‌های پاسارگارد" className="min-w-[640px]" selectionMode={selectable ? "multiple" : "none"} selectedKeys={selection.keys} onSelectionChange={selection.setKeys}>
          <Table.Header>
            {selectable ? selectColumn("انتخاب همهٔ هاست‌ها") : null}
            <Table.Column>شناسه</Table.Column>
            <Table.Column isRowHeader>عنوان</Table.Column>
            <Table.Column className="hidden md:table-cell">آدرس</Table.Column>
            <Table.Column className="hidden md:table-cell">پورت</Table.Column>
            <Table.Column className="hidden md:table-cell">اینباند</Table.Column>
            <Table.Column>وضعیت</Table.Column>
            <Table.Column className="w-12">
              <span className="sr-only">عملیات</span>
            </Table.Column>
          </Table.Header>
          <Table.Body>
            {data.rows.map((row, index) => (
              <Table.Row key={row.id ?? `row-${index}`} id={row.id ?? `row-${index}`}>
                {selectable ? selectCell(`انتخاب ${row.remark}`) : null}
                <Table.Cell>
                  <Ltr>{fa(row.id)}</Ltr>
                </Table.Cell>
                <Table.Cell>
                  <span dir="auto" className="font-medium">
                    {row.remark || "—"}
                  </span>
                  <p className="mt-0.5 text-xs text-muted md:hidden">
                    <Ltr>
                      {row.address.join(", ") || "—"}
                      {row.port ? `:${row.port}` : ""}
                    </Ltr>{" "}
                    · <Ltr>{row.inbound_tag || "—"}</Ltr>
                  </p>
                </Table.Cell>
                <Table.Cell className="hidden md:table-cell">
                  <Ltr className="text-muted">{row.address.join(", ") || "—"}</Ltr>
                </Table.Cell>
                <Table.Cell className="hidden md:table-cell">
                  <Ltr>{row.port ?? "—"}</Ltr>
                </Table.Cell>
                <Table.Cell className="hidden md:table-cell">
                  <Ltr className="text-muted">{row.inbound_tag || "—"}</Ltr>
                </Table.Cell>
                <Table.Cell>
                  <StatusChip color={row.is_disabled ? "warning" : "success"}>{row.is_disabled ? "خاموش" : "فعال"}</StatusChip>
                </Table.Cell>
                <Table.Cell>
                  <RowMenu label={`عملیات ${row.remark}`} actions={actionsFor(row)} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function HostsBody({ data, reload }: { data: PgHostsPayload; reload: () => void }) {
  const selection = useRowSelection(data.rows);
  const [dialog, setDialog] = useState<DialogTarget>({ open: false, row: null });
  const handlers: RowHandlers = {
    onEdit: (row) => setDialog({ open: true, row }),
    // The old page toggled without asking.
    onToggle: (row) => void run(`/pg/hosts/${row.id}/toggle`, {}, { refresh: reload }),
    onDelete: (row) => void run(`/pg/hosts/${row.id}/delete`, {}, { ask: { title: "تأیید حذف", text: "این هاست حذف شود؟", confirmLabel: "حذف", tone: "danger" }, refresh: reload }),
  };
  const bulkRows = data.rows.map((row) => ({ id: row.id, ops: [...(data.can.update ? ["toggle"] : []), ...(data.can.delete ? ["delete"] : [])] }));
  const buttons = availableOps(bulkRows, selection.ids, BULK_ORDER).map((op) => {
    const ids = eligibleIds(bulkRows, selection.ids, op);
    return {
      op,
      label: BULK[op].label,
      danger: BULK[op].danger,
      count: ids.length,
      onPress: () =>
        void runBulk(BULK_URL, "/pg/hosts", op, ids, BULK[op], () => {
          selection.clear();
          reload();
        }),
    };
  });
  return (
    <>
      <PageHeader
        icon="solar:global-bold"
        tone="green"
        title="هاست‌ها"
        description="آدرس‌ها و پورت‌هایی که در لینک اشتراک کاربران می‌آید"
        actions={
          data.can.create ? (
            <Button className="button--ink !h-12 !rounded-lg" onPress={() => setDialog({ open: true, row: null })}>
              <Icon name="solar:add-circle-bold" size={20} />
              ساخت هاست
            </Button>
          ) : null
        }
      />
      <PgTabs active="pg_hosts" />
      {data.error ? <Notice tone="warning" title="پاسارگارد">{data.error}</Notice> : null}
      <GlassSection title="لیست هاست‌ها">
        {data.rows.length === 0 ? (
          <EmptyBlock icon="solar:global-linear" title="هاستی نیست" />
        ) : (
          <>
            <p className="num text-xs text-muted">{fa(data.rows.length)} هاست</p>
            <HostsTable data={data} selection={selection} handlers={handlers} />
          </>
        )}
      </GlassSection>
      <BulkBar selected={selection.ids.size} buttons={buttons} onClear={selection.clear} label="عملیات گروهی هاست‌ها" />
      <HostDialog target={dialog} inboundTags={data.inbound_tags} onClose={() => setDialog({ open: false, row: null })} refresh={reload} />
    </>
  );
}

export function PgHostsContent() {
  useUrlFlash();
  const state = useJson<PgHostsPayload>("/api/panel/pg/hosts");
  return (
    <Loadable state={state} rows={5}>
      {(data) => <HostsBody data={data} reload={state.reload} />}
    </Loadable>
  );
}

export function PgHostsPage() {
  return (
    <PanelShell title="هاست‌های پاسارگارد">
      <PgHostsContent />
    </PanelShell>
  );
}
