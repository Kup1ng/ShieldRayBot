"use client";

import { Checkbox, Table } from "@heroui/react";
import { useCallback, useState } from "react";

import { run } from "../../core/actions";
import { useJson, useQuery } from "../../core/data";
import { fa } from "../../core/format";
import { BulkBar, Ltr, PagerBar, RowMenu, SearchBar, StatusChip, type MenuAction } from "../../ui/Data";
import { EmptyBlock, Loadable } from "../../ui/States";
import { GlassSection } from "../../ui/Page";
import { availableOps, eligibleIds } from "./bulk";
import { countText, runBulk, type BulkSpec } from "./bulkRun";
import { VoidDialog, type VoidTarget } from "./Dialogs";
import { faId, paymentStatusColor, paymentStatusLabel } from "./format";
import { useRowSelection } from "./selection";
import type { BulkOp, PaymentRow, PaymentsPayload } from "./types";
import { UserCell } from "./ui";

const BULK_ORDER: BulkOp[] = ["approve", "reject"];
const BULK: Record<string, BulkSpec> = {
  approve: { label: "تأیید", ask: (n) => ({ title: "تأیید گروهی", text: countText("{n} پرداخت تأیید شوند؟", n), confirmLabel: "تأیید" }) },
  reject: { label: "رد", danger: true, ask: (n) => ({ title: "رد گروهی", text: countText("{n} پرداخت رد شوند؟", n), confirmLabel: "رد", tone: "danger" }) },
};

function rowActions(row: PaymentRow, h: { onReceipt: (id: number) => void; onVoid: (target: VoidTarget) => void; refresh: () => void }): MenuAction[] {
  const actions: MenuAction[] = [];
  if (row.has_receipt) {
    actions.push({ id: "receipt", label: "مشاهده رسید", icon: "solar:document-text-linear", onAction: () => h.onReceipt(row.id) });
  }
  if (row.status === "pending") {
    actions.push({
      id: "approve",
      label: "تأیید",
      icon: "solar:check-circle-linear",
      onAction: () =>
        void run(`/payments/${row.id}/approve`, {}, { ask: { title: "تأیید پرداخت", text: "این پرداخت تأیید شود؟ در صورت خرید، محصول هم ارسال می‌شود.", confirmLabel: "تأیید" }, refresh: h.refresh }),
    });
    actions.push({
      id: "reject",
      label: "رد",
      icon: "solar:close-circle-linear",
      danger: true,
      onAction: () => void run(`/payments/${row.id}/reject`, {}, { ask: { title: "رد پرداخت", text: "این پرداخت رد شود؟", confirmLabel: "رد", tone: "danger" }, refresh: h.refresh }),
    });
  }
  if (row.can_void) {
    actions.push({
      id: "void",
      label: "ابطال",
      icon: "solar:forbidden-circle-linear",
      danger: true,
      onAction: () => h.onVoid({ id: row.id, amount: row.amount, isTopup: row.is_wallet_topup }),
    });
  }
  if (row.can_retry_void) {
    actions.push({
      id: "retry_void",
      label: "ادامهٔ ابطال",
      icon: "solar:restart-linear",
      onAction: () =>
        void run(
          `/payments/${row.id}/void`,
          { reason: row.void_reason, refund_to_wallet: row.void_refund },
          { ask: { title: "ادامهٔ ابطال", text: "بررسی پنل و ادامهٔ ابطال انجام شود؟", confirmLabel: "ادامه" }, refresh: h.refresh },
        ),
    });
  }
  return actions;
}

function PaymentsTable({ data, onReceipt, onVoid, refresh }: { data: PaymentsPayload; onReceipt: (id: number) => void; onVoid: (target: VoidTarget) => void; refresh: () => void }) {
  const { keys, setKeys, ids, clear } = useRowSelection(data.rows);
  const buttons = availableOps(data.rows, ids, BULK_ORDER).map((op) => {
    const eligible = eligibleIds(data.rows, ids, op);
    return {
      op,
      label: BULK[op].label,
      danger: BULK[op].danger,
      count: eligible.length,
      onPress: () =>
        void runBulk("/finance/payments/bulk-action", "/finance?tab=payments", op, eligible, BULK[op], () => {
          clear();
          refresh();
        }),
    };
  });
  if (!data.rows.length) return <EmptyBlock title="پرداختی نیست" description={data.q ? `برای «${data.q}» پرداختی پیدا نشد.` : undefined} />;
  return (
    <>
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="پرداخت‌ها" className="min-w-[600px]" selectionMode="multiple" selectedKeys={keys} onSelectionChange={setKeys}>
            <Table.Header>
              <Table.Column className="w-10 pe-0">
                <Checkbox aria-label="انتخاب همهٔ پرداخت‌ها" slot="selection">
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox.Content>
                </Checkbox>
              </Table.Column>
              <Table.Column isRowHeader>#</Table.Column>
              <Table.Column>کاربر</Table.Column>
              <Table.Column>مبلغ</Table.Column>
              <Table.Column className="hidden md:table-cell">نوع</Table.Column>
              <Table.Column>وضعیت</Table.Column>
              <Table.Column className="hidden md:table-cell">سفارش</Table.Column>
              <Table.Column className="w-12">
                <span className="sr-only">عملیات</span>
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {data.rows.map((row) => (
                <Table.Row key={row.id} id={row.id}>
                  <Table.Cell className="pe-0">
                    <Checkbox aria-label={`انتخاب پرداخت ${faId(row.id)}`} slot="selection" variant="secondary">
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
                      {row.is_wallet_topup ? "شارژ کیف" : "خرید"}
                      {row.order_id ? (
                        <>
                          {" "}
                          · سفارش <Ltr>#{faId(row.order_id)}</Ltr>
                        </>
                      ) : null}
                    </p>
                    {row.status === "pending" && row.matches.length ? (
                      <p className="mt-0.5 text-xs text-muted">
                        هم‌مبلغ:{" "}
                        {row.matches.map((id, index) => (
                          <span key={id}>
                            {index ? "، " : ""}
                            <Ltr>#{faId(id)}</Ltr>
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </Table.Cell>
                  <Table.Cell>
                    <Ltr>{fa(row.amount)}</Ltr>
                  </Table.Cell>
                  <Table.Cell className="hidden md:table-cell">{row.is_wallet_topup ? "شارژ کیف" : "خرید"}</Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusChip color={paymentStatusColor(row.status)}>{paymentStatusLabel(row.status)}</StatusChip>
                      {row.void_review ? (
                        <span title="پنل تأیید نکرد؛ دوباره تلاش کنید">
                          <StatusChip color="warning">ابطال ناتمام</StatusChip>
                        </span>
                      ) : null}
                    </div>
                  </Table.Cell>
                  <Table.Cell className="hidden md:table-cell">{row.order_id ? <Ltr>{faId(row.order_id)}</Ltr> : "—"}</Table.Cell>
                  <Table.Cell>
                    <RowMenu label={`عملیات پرداخت ${faId(row.id)}`} actions={rowActions(row, { onReceipt, onVoid, refresh })} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      <BulkBar selected={ids.size} buttons={buttons} onClear={clear} label="عملیات گروهی پرداخت‌ها" />
    </>
  );
}

export function PaymentsTab({ onReceipt }: { onReceipt: (id: number) => void }) {
  const query = useQuery();
  const q = query.get("q");
  const page = query.get("page");
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page) params.set("page", page);
  const state = useJson<PaymentsPayload>(`/api/panel/finance/payments?${params}`);
  const { reload } = state;
  const refresh = useCallback(() => reload(), [reload]);
  const [voiding, setVoiding] = useState<VoidTarget | null>(null);
  return (
    <GlassSection title="پرداخت‌ها" description="بررسی رسیدها، تأیید یا رد پرداخت، و ابطال پرداخت تأییدشده">
      <SearchBar value={q} placeholder="نام، تلگرام، مبلغ، وضعیت…" onSearch={(next) => query.set({ q: next, page: null })} />
      <Loadable state={state}>
        {(data) => (
          <>
            <PaymentsTable data={data} onReceipt={onReceipt} onVoid={setVoiding} refresh={refresh} />
            <PagerBar pager={data.pager} noun="پرداخت" onPage={(next) => query.set({ page: next > 1 ? String(next) : null })} />
          </>
        )}
      </Loadable>
      <VoidDialog target={voiding} onClose={() => setVoiding(null)} onDone={refresh} />
    </GlassSection>
  );
}
