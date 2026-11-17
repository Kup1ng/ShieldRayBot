"use client";

import { Checkbox, Table } from "@heroui/react";
import { useCallback } from "react";

import { run, type Ask } from "../../core/actions";
import { useJson, useQuery } from "../../core/data";
import { fa } from "../../core/format";
import { BulkBar, Ltr, PagerBar, RowMenu, SearchBar, StatusChip, type MenuAction } from "../../ui/Data";
import { EmptyBlock, Loadable } from "../../ui/States";
import { GlassSection } from "../../ui/Page";
import { availableOps, eligibleIds } from "./bulk";
import { countText, runBulk, type BulkSpec } from "./bulkRun";
import { faId, orderStatusColor, orderStatusLabel, payMethodLabel, stamp } from "./format";
import { useRowSelection } from "./selection";
import type { BulkOp, OrderAction, OrderRow, OrdersPayload } from "./types";
import { UserCell } from "./ui";

const BULK_ORDER: BulkOp[] = ["approve", "reject", "cancel"];
const BULK: Record<string, BulkSpec> = {
  approve: { label: "تأیید", ask: (n) => ({ title: "تأیید گروهی", text: countText("{n} سفارش تأیید شوند؟", n), confirmLabel: "تأیید" }) },
  reject: { label: "رد", danger: true, ask: (n) => ({ title: "رد گروهی", text: countText("{n} سفارش رد شوند؟", n), confirmLabel: "رد", tone: "danger" }) },
  cancel: { label: "لغو", ask: (n) => ({ title: "لغو گروهی", text: countText("{n} سفارش لغو شوند؟", n), confirmLabel: "لغو", tone: "warning" }) },
};

type OrderCall = { label: string; path: (id: number) => string; ask: Ask; danger?: boolean; icon: string };

const CALLS: Record<Exclude<OrderAction, "receipt">, OrderCall> = {
  approve: {
    label: "تأیید",
    icon: "solar:check-circle-linear",
    path: (id) => `/orders/${id}/approve`,
    ask: { title: "تأیید سفارش", text: "این سفارش تأیید و محصول ارسال شود؟", confirmLabel: "تأیید" },
  },
  approve_deliver: {
    label: "تأیید و تحویل",
    icon: "solar:check-circle-linear",
    path: (id) => `/orders/${id}/approve`,
    ask: { title: "تأیید و تحویل", text: "سفارش تأیید و تحویل شود؟", confirmLabel: "تأیید و تحویل" },
  },
  approve_no_receipt: {
    label: "تأیید",
    icon: "solar:check-circle-linear",
    path: (id) => `/orders/${id}/approve`,
    ask: { title: "تأیید سفارش", text: "بدون رسید تأیید و سرویس برای کاربر ارسال شود؟", confirmLabel: "تأیید" },
  },
  reject: {
    label: "رد",
    icon: "solar:close-circle-linear",
    danger: true,
    path: (id) => `/orders/${id}/reject`,
    ask: { title: "رد سفارش", text: "این سفارش رد شود؟", confirmLabel: "رد", tone: "danger" },
  },
  cancel: {
    label: "لغو",
    icon: "solar:forbidden-circle-linear",
    path: (id) => `/orders/${id}/cancel`,
    ask: { title: "لغو سفارش", text: "این سفارش لغو شود؟", confirmLabel: "لغو", tone: "warning" },
  },
  retry_delivery: {
    label: "ادامه تحویل",
    icon: "solar:restart-linear",
    path: (id) => `/orders/${id}/retry-delivery`,
    ask: { title: "ادامه تحویل", text: "تحویل این سفارش گیرکرده ادامه یابد؟ (تأیید دوباره نیست)", confirmLabel: "ادامه تحویل" },
  },
};

function RowActions({ row, onReceipt, refresh }: { row: OrderRow; onReceipt: (paymentId: number) => void; refresh: () => void }) {
  const actions: MenuAction[] = row.actions.map((action) => {
    if (action === "receipt") {
      return { id: action, label: "مشاهده رسید", icon: "solar:document-text-linear", onAction: () => row.receipt_payment_id && onReceipt(row.receipt_payment_id) };
    }
    const call = CALLS[action];
    return { id: action, label: call.label, icon: call.icon, danger: call.danger, onAction: () => void run(call.path(row.id), {}, { ask: call.ask, refresh }) };
  });
  return <RowMenu label={`عملیات سفارش ${faId(row.id)}`} actions={actions} />;
}

function OrdersTable({ data, onReceipt, refresh, noun }: { data: OrdersPayload; onReceipt: (paymentId: number) => void; refresh: () => void; noun: string }) {
  const { keys, setKeys, ids, clear } = useRowSelection(data.rows);
  const buttons = availableOps(data.rows, ids, BULK_ORDER).map((op) => {
    const eligible = eligibleIds(data.rows, ids, op);
    return {
      op,
      label: BULK[op].label,
      danger: BULK[op].danger,
      count: eligible.length,
      onPress: () =>
        void runBulk("/finance/orders/bulk-action", "/finance?tab=orders", op, eligible, BULK[op], () => {
          clear();
          refresh();
        }),
    };
  });
  if (!data.rows.length) return <EmptyBlock title="سفارشی نیست" description={data.q ? `برای «${data.q}» سفارشی پیدا نشد.` : undefined} />;
  return (
    <>
      <p className="text-xs text-muted">
        {fa(data.rows.length)} {noun} در این صفحه
      </p>
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="سفارش‌ها" className="min-w-[640px]" selectionMode="multiple" selectedKeys={keys} onSelectionChange={setKeys}>
            <Table.Header>
              <Table.Column className="w-10 pe-0">
                <Checkbox aria-label="انتخاب همهٔ سفارش‌ها" slot="selection">
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox.Content>
                </Checkbox>
              </Table.Column>
              <Table.Column isRowHeader>#</Table.Column>
              <Table.Column>کاربر</Table.Column>
              <Table.Column className="hidden md:table-cell">پلن</Table.Column>
              <Table.Column>مبلغ</Table.Column>
              <Table.Column>وضعیت</Table.Column>
              <Table.Column className="hidden md:table-cell">روش</Table.Column>
              <Table.Column className="hidden lg:table-cell">زمان</Table.Column>
              <Table.Column className="w-12">
                <span className="sr-only">عملیات</span>
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {data.rows.map((row) => (
                <Table.Row key={row.id} id={row.id}>
                  <Table.Cell className="pe-0">
                    <Checkbox aria-label={`انتخاب سفارش ${faId(row.id)}`} slot="selection" variant="secondary">
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox.Content>
                    </Checkbox>
                  </Table.Cell>
                  <Table.Cell>
                    <Ltr>{faId(row.id)}</Ltr>
                  </Table.Cell>
                  <Table.Cell>
                    <UserCell user={row.user} />
                    <p className="mt-0.5 text-xs text-muted md:hidden">
                      {row.plan_name} · {payMethodLabel(row.payment_method)} · <Ltr>{stamp(row.created_at)}</Ltr>
                    </p>
                  </Table.Cell>
                  <Table.Cell className="hidden md:table-cell">{row.plan_name}</Table.Cell>
                  <Table.Cell>
                    <Ltr>{fa(row.amount)}</Ltr>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusChip color={orderStatusColor(row.status)}>{orderStatusLabel(row.status)}</StatusChip>
                      {row.stuck ? (
                        <span title="پرداخت شده بدون سرویس">
                          <StatusChip color="warning">گیرکرده</StatusChip>
                        </span>
                      ) : null}
                    </div>
                  </Table.Cell>
                  <Table.Cell className="hidden md:table-cell">{payMethodLabel(row.payment_method)}</Table.Cell>
                  <Table.Cell className="hidden text-muted lg:table-cell">
                    <Ltr>{stamp(row.created_at)}</Ltr>
                  </Table.Cell>
                  <Table.Cell>
                    <RowActions row={row} onReceipt={onReceipt} refresh={refresh} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      <BulkBar selected={ids.size} buttons={buttons} onClear={clear} label="عملیات گروهی سفارش‌ها" />
    </>
  );
}

export function OrdersTab({ onReceipt }: { onReceipt: (paymentId: number) => void }) {
  const query = useQuery();
  const q = query.get("q");
  const page = query.get("page");
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page) params.set("page", page);
  const state = useJson<OrdersPayload>(`/api/panel/finance/orders?${params}`);
  const { reload } = state;
  const refresh = useCallback(() => reload(), [reload]);
  return (
    <GlassSection title="سفارش‌ها" description="تأیید، رد و لغو سفارش‌ها، و ادامهٔ تحویل سفارش‌های گیرکرده">
      <SearchBar value={q} placeholder="نام، تلگرام، پلن، وضعیت…" onSearch={(next) => query.set({ q: next, page: null })} />
      <Loadable state={state}>
        {(data) => (
          <>
            <OrdersTable data={data} onReceipt={onReceipt} refresh={refresh} noun="سفارش" />
            <PagerBar pager={data.pager} noun="سفارش" onPage={(next) => query.set({ page: next > 1 ? String(next) : null })} />
          </>
        )}
      </Loadable>
    </GlassSection>
  );
}
