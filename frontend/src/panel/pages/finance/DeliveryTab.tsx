"use client";

import { Checkbox, Table } from "@heroui/react";
import { useCallback } from "react";

import { run } from "../../core/actions";
import { useJson } from "../../core/data";
import { fa, type ChipColor } from "../../core/format";
import { BulkBar, Ltr, RowMenu, StatusChip, type MenuAction } from "../../ui/Data";
import { EmptyBlock, Loadable } from "../../ui/States";
import { GlassSection } from "../../ui/Page";
import { availableOps, eligibleIds } from "./bulk";
import { countText, runBulk, type BulkSpec } from "./bulkRun";
import { faId, orderStatusLabel, paymentStatusLabel } from "./format";
import { useRowSelection } from "./selection";
import type { BulkOp, DeliveryPayload, DeliveryRow } from "./types";

const BULK_ORDER: BulkOp[] = ["retry", "dismiss"];
const BULK: Record<string, BulkSpec> = {
  retry: {
    label: "اجرای اکشن تشخیص",
    ask: (n) => ({ title: "اجرای گروهی", text: countText("برای {n} سفارش، اکشن تشخیص‌شده (ادامه تحویل / ارسال مجدد) اجرا شود؟", n), confirmLabel: "اجرا" }),
  },
  dismiss: {
    label: "حذف از لیست",
    ask: (n) => ({
      title: "حذف از لیست",
      text: countText("{n} سفارش از لیست تحویل ناموفق حذف شود؟ چیزی ارسال نمی‌شود و خود سفارش تغییری نمی‌کند.", n),
      confirmLabel: "حذف از لیست",
    }),
  },
};

function kindColor(kind: string): ChipColor {
  if (kind === "approved_resend") return "warning";
  if (kind === "approved_fulfill") return "warning";
  return "default";
}

function rowActions(row: DeliveryRow, refresh: () => void): MenuAction[] {
  const isFailure = row.attempts !== null;
  const resend = row.action === "resend";
  const retryText = resend
    ? "فقط پیام تحویل دوباره ارسال شود؟ (سرویس دوباره ساخته نمی‌شود)"
    : isFailure
      ? "تحویل این سفارش ادامه یابد؟"
      : "تحویل این سفارش گیرکرده ادامه یابد؟";
  const actions: MenuAction[] = [
    {
      id: "retry",
      label: row.action_label,
      icon: "solar:restart-linear",
      onAction: () => void run(`/orders/${row.order_id}/retry-delivery`, {}, { ask: { title: row.action_label, text: retryText, confirmLabel: row.action_label }, refresh }),
    },
  ];
  if (isFailure) {
    actions.push({
      id: "dismiss",
      label: "حذف از لیست",
      icon: "solar:trash-bin-minimalistic-linear",
      onAction: () =>
        void run(
          `/orders/${row.order_id}/dismiss-delivery-failure`,
          {},
          { ask: { title: "حذف از لیست", text: "این سفارش از لیست تحویل ناموفق حذف شود؟ چیزی ارسال نمی‌شود و خود سفارش تغییری نمی‌کند.", confirmLabel: "حذف از لیست" }, refresh },
        ),
    });
  }
  if (row.stuck) {
    actions.push({
      id: "manual",
      label: "تحویل دستی انجام شد",
      icon: "solar:hand-shake-linear",
      onAction: () =>
        void run(
          `/orders/${row.order_id}/mark-delivered-manually`,
          {},
          {
            ask: {
              title: "تحویل دستی انجام شد",
              text: "تحویل این سفارش را خودتان انجام داده‌اید (مثلاً سرویس را در پنل ساخته یا تمدید کرده‌اید)؟ سفارش بدون جابه‌جایی پول بسته می‌شود.",
              confirmLabel: "ثبت تحویل دستی",
            },
            refresh,
          },
        ),
    });
    if (!row.stuck_reason || row.stuck_reason.can_refund) {
      actions.push({
        id: "refund",
        label: "لغو و بازگشت وجه",
        icon: "solar:wallet-money-linear",
        danger: true,
        onAction: () =>
          void run(
            `/orders/${row.order_id}/refund-stuck-order`,
            {},
            {
              ask: {
                title: "لغو و بازگشت وجه",
                text: "سفارش لغو و مبلغ پرداخت‌شده به کیف پول مشتری برگردانده شود؟ قبلش مطمئن شوید در پاسارگارد چیزی برای این سفارش ساخته یا تمدید نشده است. این کار یک بار انجام می‌شود.",
                confirmLabel: "لغو و بازگشت وجه",
                tone: "danger",
              },
              refresh,
            },
          ),
      });
    }
    actions.push({
      id: "close",
      label: "بستن بدون بازگشت وجه",
      icon: "solar:close-circle-linear",
      danger: true,
      onAction: () =>
        void run(
          `/orders/${row.order_id}/close-stuck-order`,
          {},
          {
            ask: {
              title: "بستن بدون بازگشت وجه",
              text: "سفارش بسته و از لیست حذف شود، بدون بازگشت وجه و بدون ارسال چیزی؟ فقط وقتی که حساب این سفارش جای دیگری تسویه شده است.",
              confirmLabel: "بستن و حذف از لیست",
              tone: "danger",
            },
            refresh,
          },
        ),
    });
  }
  return actions;
}

function DiagnosisCell({ row }: { row: DeliveryRow }) {
  const { diag, stuck_reason: why } = row;
  const stuckOnly = row.attempts === null;
  const label = stuckOnly ? (why?.kind ?? diag?.label ?? "تحویل ناقص") : (diag?.label ?? "تحویل ناموفق");
  const color: ChipColor = stuckOnly ? "warning" : diag ? kindColor(diag.kind) : "warning";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <span title={diag?.detail ?? ""}>
          <StatusChip color={color}>{label}</StatusChip>
        </span>
        {row.stuck && !stuckOnly ? (
          <span title="پرداخت شده بدون سرویس">
            <StatusChip color="warning">گیرکرده</StatusChip>
          </span>
        ) : null}
      </div>
      {diag?.payment_status ? (
        <small className="text-xs text-muted">
          پرداخت: {paymentStatusLabel(diag.payment_status)}
          {diag.order_status ? ` · سفارش: ${orderStatusLabel(diag.order_status)}` : ""}
        </small>
      ) : null}
    </div>
  );
}

function DeliveryTable({ data, refresh }: { data: DeliveryPayload; refresh: () => void }) {
  const rows = data.rows.map((row) => ({ ...row, id: row.order_id }));
  const { keys, setKeys, ids, clear } = useRowSelection(rows);
  const buttons = availableOps(rows, ids, BULK_ORDER).map((op) => {
    const eligible = eligibleIds(rows, ids, op);
    return {
      op,
      label: BULK[op].label,
      count: eligible.length,
      onPress: () =>
        void runBulk("/finance/delivery/bulk-action", "/finance?tab=delivery", op, eligible, BULK[op], () => {
          clear();
          refresh();
        }),
    };
  });
  if (!rows.length) return <EmptyBlock title="صف تحویل ناموفق خالی است." />;
  return (
    <>
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="تحویل ناموفق" className="min-w-[620px]" selectionMode="multiple" selectedKeys={keys} onSelectionChange={setKeys}>
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
              <Table.Column isRowHeader>سفارش</Table.Column>
              <Table.Column>کاربر</Table.Column>
              <Table.Column>تشخیص</Table.Column>
              <Table.Column className="hidden md:table-cell">خطا</Table.Column>
              <Table.Column>تلاش</Table.Column>
              <Table.Column className="w-12">
                <span className="sr-only">عملیات</span>
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.order_id} id={row.order_id}>
                  <Table.Cell className="pe-0">
                    <Checkbox aria-label={`انتخاب سفارش ${faId(row.order_id)}`} slot="selection" variant="secondary">
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox.Content>
                    </Checkbox>
                  </Table.Cell>
                  <Table.Cell>
                    <Ltr>#{faId(row.order_id)}</Ltr>
                  </Table.Cell>
                  <Table.Cell>
                    <span dir="auto" className="font-medium text-foreground">
                      {row.user_name}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <DiagnosisCell row={row} />
                    <p className="mt-1 text-xs text-muted md:hidden">{row.attempts === null ? (row.stuck_reason?.reason ?? "پرداخت شده ولی سرویسی ساخته نشد") : row.error || "—"}</p>
                  </Table.Cell>
                  <Table.Cell className="hidden text-muted md:table-cell">
                    {row.attempts === null ? (row.stuck_reason?.reason ?? "پرداخت شده ولی سرویسی ساخته نشد") : row.error || "—"}
                  </Table.Cell>
                  <Table.Cell>{row.attempts === null ? "—" : <Ltr>{fa(row.attempts)}</Ltr>}</Table.Cell>
                  <Table.Cell>
                    <RowMenu label={`عملیات سفارش ${faId(row.order_id)}`} actions={rowActions(row, refresh)} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      <BulkBar selected={ids.size} buttons={buttons} onClear={clear} label="عملیات گروهی تحویل ناموفق" />
    </>
  );
}

export function DeliveryTab() {
  const state = useJson<DeliveryPayload>("/api/panel/finance/delivery");
  const { reload } = state;
  const refresh = useCallback(() => reload(), [reload]);
  return (
    <GlassSection title="تحویل ناموفق" description="سفارش‌هایی که تحویل آن‌ها کامل نشده یا پیام تحویل نرسیده است">
      <p className="text-sm leading-6 text-muted">
        اکشن هر ردیف مطابق تشخیص است: <strong className="text-foreground">ادامه تحویل</strong> (سرویس ناقص) یا <strong className="text-foreground">ارسال مجدد پیام</strong> (سرویس آماده، تلگرام ناموفق). تأیید دوباره انجام نمی‌شود. اگر
        تحویل دیگر لازم یا ممکن نیست (مثلاً سرویس حذف شده)، <strong className="text-foreground">حذف از لیست</strong> فقط ردیف خطا را برمی‌دارد و چیزی ارسال نمی‌کند. سفارش پرداخت‌شده بدون سرویس («گیرکرده») فقط با{" "}
        <strong className="text-foreground">لغو و بازگشت وجه</strong> یا <strong className="text-foreground">تحویل دستی انجام شد</strong> بسته می‌شود.
      </p>
      <Loadable state={state}>{(data) => <DeliveryTable data={data} refresh={refresh} />}</Loadable>
    </GlassSection>
  );
}
