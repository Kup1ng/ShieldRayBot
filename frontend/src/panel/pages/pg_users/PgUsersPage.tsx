"use client";

import { Button, ProgressBar, Table } from "@heroui/react";
import { useMemo, useState } from "react";

import { Icon } from "@/icons/Icon";

import { run } from "../../core/actions";
import { useJson, useQuery, useUrlFlash } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { BulkBar, Ltr, PagerBar, RowMenu, SearchBar, StatusChip, type MenuAction } from "../../ui/Data";
import { GlassSection, PageHeader } from "../../ui/Page";
import { EmptyBlock, Loadable, Notice } from "../../ui/States";
import { ReasonDialog, type ReasonRequest } from "../users/ReasonDialog";
import { availableOps, countText, eligibleIds } from "./bulk";
import { daysLeftText, USER_OP_ORDER, USER_OPS, userStatusColor } from "./format";
import { useRowSelection } from "./selection";
import type { PgUserOp, PgUserRow, PgUsersPayload } from "./types";
import { CreateUserDialog, EditUserDialog, LinkDialog } from "./UserDialogs";
import { PgTabs, selectCell, selectColumn } from "./ui";

const LIST_PATH = "/api/panel/pg/users";
const BULK_URL = "/pg/users/bulk-action";

// The server refuses every panel-user operation without a reason (at least three characters) and logs it.
const REASON_LABEL = "علت این عملیات";

function TrafficCell({ row }: { row: PgUserRow }) {
  return (
    <div className="flex min-w-28 flex-col gap-1">
      <span className="text-sm">{row.traffic_text}</span>
      {row.traffic_percent !== null ? (
        <ProgressBar aria-label={`${fa(row.traffic_percent)} درصد مصرف`} size="sm" color={row.traffic_percent >= 90 ? "danger" : "accent"} value={row.traffic_percent}>
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      ) : null}
    </div>
  );
}

type RowHandlers = { onLink: (row: PgUserRow) => void; onEdit: (row: PgUserRow) => void; onOp: (row: PgUserRow, op: PgUserOp) => void };

function rowActions(row: PgUserRow, canModify: boolean, handlers: RowHandlers): MenuAction[] {
  if (row.id === null) return [];
  const actions: MenuAction[] = [{ id: "link", label: "لینک اشتراک", icon: "solar:link-round-linear", onAction: () => handlers.onLink(row) }];
  if (canModify) actions.push({ id: "edit", label: "ویرایش", icon: "solar:pen-linear", onAction: () => handlers.onEdit(row) });
  for (const op of USER_OP_ORDER) {
    if (row.ops.includes(op)) actions.push({ id: op, label: USER_OPS[op].label, icon: USER_OPS[op].icon, danger: op === "delete", onAction: () => handlers.onOp(row, op) });
  }
  return actions;
}

function UsersTable({ data, handlers, selectable, selection }: { data: PgUsersPayload; handlers: RowHandlers; selectable: boolean; selection: ReturnType<typeof useRowSelection> }) {
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="کاربران پاسارگارد" className="min-w-[640px]" selectionMode={selectable ? "multiple" : "none"} selectedKeys={selection.keys} onSelectionChange={selection.setKeys}>
          <Table.Header>
            {selectable ? selectColumn("انتخاب همهٔ کاربران") : null}
            <Table.Column isRowHeader>نام کاربری</Table.Column>
            <Table.Column>وضعیت</Table.Column>
            <Table.Column>حجم</Table.Column>
            <Table.Column className="hidden md:table-cell">انقضا</Table.Column>
            {data.show_owner ? <Table.Column className="hidden md:table-cell">ادمین مالک</Table.Column> : null}
            <Table.Column className="w-12">
              <span className="sr-only">عملیات</span>
            </Table.Column>
          </Table.Header>
          <Table.Body>
            {data.rows.map((row, index) => (
              <Table.Row key={row.id ?? `row-${index}`} id={row.id ?? `row-${index}`}>
                {selectable ? selectCell(`انتخاب ${row.username}`) : null}
                <Table.Cell>
                  <Ltr className="font-medium">{row.username || "—"}</Ltr>
                  <p className="mt-0.5 text-xs text-muted md:hidden">
                    {row.days_left !== null ? daysLeftText(row.days_left) : row.expire_text || "—"}
                  </p>
                </Table.Cell>
                <Table.Cell>
                  <StatusChip color={userStatusColor(row)}>{row.disabled ? "غیرفعال" : row.status_label}</StatusChip>
                </Table.Cell>
                <Table.Cell>
                  <TrafficCell row={row} />
                </Table.Cell>
                <Table.Cell className="hidden md:table-cell">
                  <Ltr className="text-muted">{row.expire_text || "—"}</Ltr>
                </Table.Cell>
                {data.show_owner ? (
                  <Table.Cell className="hidden md:table-cell">
                    <Ltr className="text-muted">{row.owner || "—"}</Ltr>
                  </Table.Cell>
                ) : null}
                <Table.Cell>
                  <RowMenu label={`عملیات ${row.username}`} actions={rowActions(row, data.can.modify, handlers)} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function UsersBody({ data, reload, onSearch, onPage }: { data: PgUsersPayload; reload: () => void; onSearch: (q: string) => void; onPage: (page: number) => void }) {
  const selection = useRowSelection(data.rows);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PgUserRow | null>(null);
  const [link, setLink] = useState<{ id: number; username: string } | null>(null);
  const [reason, setReason] = useState<ReasonRequest | null>(null);

  const handlers: RowHandlers = useMemo(
    () => ({
      onLink: (row) => row.id !== null && setLink({ id: row.id, username: row.username }),
      onEdit: setEditing,
      onOp: (row, op) => {
        const meta = USER_OPS[op];
        setReason({
          title: meta.title,
          message: meta.text,
          confirmLabel: meta.confirm,
          reasonLabel: REASON_LABEL,
          tone: meta.tone,
          onConfirm: async (text) => {
            await run(`/pg/users/${row.id}/${op}`, { reason: text }, { refresh: reload });
          },
        });
      },
    }),
    [reload],
  );

  const buttons = availableOps(data.rows, selection.ids, USER_OP_ORDER).map((op) => {
    const ids = eligibleIds(data.rows, selection.ids, op);
    const meta = USER_OPS[op as PgUserOp];
    return {
      op,
      label: meta.label,
      danger: op === "delete",
      count: ids.length,
      onPress: () =>
        setReason({
          title: meta.bulkTitle,
          message: countText(meta.bulkText, ids.length),
          confirmLabel: meta.confirm,
          reasonLabel: REASON_LABEL,
          tone: meta.tone,
          onConfirm: async (text) => {
            const refresh = () => {
              selection.clear();
              reload();
            };
            await run(BULK_URL, { action: op, ids, return_to: `/pg/users${window.location.search}`, reason: text }, { refresh });
          },
        }),
    };
  });

  const canCreate = data.can.create;
  return (
    <>
      <PageHeader
        icon="solar:users-group-rounded-bold"
        tone="blue"
        title="کاربران پنل"
        description="کاربران مستقیم پاسارگارد: ساخت، ویرایش، لینک اشتراک و وضعیت مصرف"
        actions={
          canCreate ? (
            <Button className="button--ink !h-12 !rounded-lg" onPress={() => setCreateOpen(true)}>
              <Icon name="solar:user-plus-bold" size={20} />
              ساخت کاربر
            </Button>
          ) : null
        }
      />
      <PgTabs active="pg_users" />
      {data.error ? <Notice tone="warning" title="پاسارگارد">{data.error}</Notice> : null}
      <GlassSection>
        <SearchBar value={data.q} placeholder="نام کاربری یا بخشی از آن…" onSearch={onSearch} />
        {data.rows.length === 0 ? (
          <EmptyBlock icon="solar:users-group-rounded-linear" title="کاربری یافت نشد." description={data.q ? `برای «${data.q}» کاربری پیدا نشد.` : undefined} />
        ) : (
          <>
            <p className="num text-xs text-muted">{fa(data.rows.length)} کاربر در این صفحه</p>
            <UsersTable data={data} handlers={handlers} selectable={data.can.bulk} selection={selection} />
          </>
        )}
        <PagerBar pager={data.pager} noun="کاربر" onPage={onPage} />
      </GlassSection>
      <BulkBar selected={selection.ids.size} buttons={buttons} onClear={selection.clear} label="عملیات گروهی کاربران" />
      <CreateUserDialog open={createOpen} can={data.can} templates={data.templates} groups={data.groups} onClose={() => setCreateOpen(false)} refresh={reload} />
      <EditUserDialog row={editing} groups={data.groups} onClose={() => setEditing(null)} refresh={reload} />
      <LinkDialog target={link} onClose={() => setLink(null)} />
      <ReasonDialog request={reason} onClose={() => setReason(null)} />
    </>
  );
}

export function PgUsersContent() {
  useUrlFlash();
  const query = useQuery();
  const q = query.get("q");
  const page = query.get("page");
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page) params.set("page", page);
  const text = params.toString();
  const state = useJson<PgUsersPayload>(`${LIST_PATH}${text ? `?${text}` : ""}`, { keepPrevious: true });
  return (
    <Loadable state={state} rows={6}>
      {(data) => <UsersBody data={data} reload={state.reload} onSearch={(next) => query.set({ q: next || null, page: null })} onPage={(next) => query.set({ page: next > 1 ? String(next) : null })} />}
    </Loadable>
  );
}

export function PgUsersPage() {
  return (
    <PanelShell title="کاربران پنل">
      <PgUsersContent />
    </PanelShell>
  );
}
