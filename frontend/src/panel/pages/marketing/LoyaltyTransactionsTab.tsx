"use client";

import { Button, Table } from "@heroui/react";
import { useState } from "react";

import { run, usePending } from "../../core/actions";
import { useJson } from "../../core/data";
import { fa, formatDateTime } from "../../core/format";
import { Ltr } from "../../ui/Data";
import { FormGrid, TextInput, TextAreaInput } from "../../ui/Fields";
import { EmptyBlock, Loadable } from "../../ui/States";
import { GlassSection } from "../../ui/Page";
import { UserNameLink } from "../../ui/UserNameLink";
import { EditorForm } from "./editor";
import type { LoyaltyOverview, PointsTransaction } from "./types";

type Adjust = LoyaltyOverview["adjust"];

/** Owner-only manual change of any customer's points; the reason is required and kept in the ledger. */
function PlatformAdjust({ nonce, refresh }: { nonce: string; refresh: () => void }) {
  const [userId, setUserId] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const { pending, track } = usePending();
  const submit = () =>
    track(async () => {
      const result = await run("/loyalty/adjust", { user_id: userId, delta, reason, nonce }, { success: "تعدیل ثبت شد.", refresh });
      if (result?.ok) {
        setUserId("");
        setDelta("");
        setReason("");
      }
    });
  return (
    <GlassSection title="تعدیل دستی امتیاز" description="فقط ادمین — دلیل الزامی است و در دفترکل ثبت می‌شود.">
      <EditorForm onSubmit={() => void submit()} pending={pending} submitLabel="ثبت تعدیل">
        <FormGrid>
          <TextInput type="number" label="شناسه کاربر" value={userId} onChange={setUserId} min={1} required />
          <TextInput type="number" label="تغییر امتیاز (+/-)" value={delta} onChange={setDelta} required />
        </FormGrid>
        <TextAreaInput label="دلیل" value={reason} onChange={setReason} rows={2} maxLength={255} required />
      </EditorForm>
    </GlassSection>
  );
}

/** A shop's own staff change a customer's points in that shop, within the per-change and daily caps. */
function ShopAdjust({ shop, refresh }: { shop: Adjust["shop"]; refresh: () => void }) {
  const [userId, setUserId] = useState("");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const { pending, track } = usePending();
  const submit = (mode: "debit" | "credit") =>
    track(async () => {
      const result = await run(
        "/loyalty/shop-adjust",
        { user_id: userId, points, reason, mode, nonce: shop.nonce },
        {
          ask: {
            title: "تأیید تغییر امتیاز",
            text: "امتیاز این مشتری در فروشگاه شما تغییر کند؟ این کار در گزارش کارکنان ثبت می‌شود.",
            confirmLabel: "اعمال",
            tone: "warning",
          },
          success: "امتیاز تغییر کرد.",
          refresh,
        },
      );
      if (result?.ok) {
        setUserId("");
        setPoints("");
        setReason("");
      }
    });
  const ready = Boolean(userId && points && reason.trim().length >= 3);
  return (
    <GlassSection
      title="تغییر دستی امتیاز مشتری"
      description={`فقط امتیاز همین فروشگاه تغییر می‌کند. هر بار حداکثر ${fa(shop.max_points)} امتیاز و روزانه برای کل فروشگاه ${fa(shop.daily_points)} امتیاز. علت در گزارش کارکنان ثبت می‌شود.`}
    >
      <form className="flex flex-col gap-4" onSubmit={(event) => event.preventDefault()}>
        <FormGrid>
          <TextInput type="number" label="شناسه کاربر" value={userId} onChange={setUserId} min={1} required />
          <TextInput type="number" label="امتیاز" value={points} onChange={setPoints} min={1} max={shop.max_points} required />
        </FormGrid>
        <TextInput label="علت" value={reason} onChange={setReason} maxLength={200} required help="حداقل ۳ نویسه" />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" isDisabled={!ready || pending} className="!h-12 !rounded-lg px-6 text-sm" onPress={() => void submit("debit")}>
            کسر امتیاز
          </Button>
          <Button isDisabled={!ready || pending} className="button--ink !h-12 !rounded-lg px-6 text-sm" onPress={() => void submit("credit")}>
            افزودن امتیاز
          </Button>
        </div>
      </form>
    </GlassSection>
  );
}

function LedgerTable({ rows }: { rows: PointsTransaction[] }) {
  if (!rows.length) return <EmptyBlock icon="solar:bill-list-linear" title="تراکنشی نیست" />;
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="آخرین تراکنش‌های امتیاز" className="min-w-[640px]">
          <Table.Header>
            <Table.Column isRowHeader>#</Table.Column>
            <Table.Column>کاربر</Table.Column>
            <Table.Column>مقدار</Table.Column>
            <Table.Column>مانده</Table.Column>
            <Table.Column>شرح</Table.Column>
            <Table.Column>زمان</Table.Column>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.id} id={row.id}>
                <Table.Cell>
                  <Ltr>{fa(row.id)}</Ltr>
                </Table.Cell>
                <Table.Cell>
                  <UserNameLink userId={row.user_id} name={row.user_label} page="loyalty" />
                </Table.Cell>
                <Table.Cell>
                  <span className={row.amount > 0 ? "text-success" : "text-danger"}>
                    <Ltr>
                      {row.amount > 0 ? "+" : ""}
                      {fa(row.amount)}
                    </Ltr>
                  </span>
                </Table.Cell>
                <Table.Cell>{fa(row.balance_after)}</Table.Cell>
                <Table.Cell>
                  <span dir="auto">{row.description}</span>
                </Table.Cell>
                <Table.Cell className="text-muted">
                  <Ltr>{formatDateTime(row.created_at)}</Ltr>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

export function LoyaltyTransactionsTab({ adjust, refreshOverview }: { adjust: Adjust; refreshOverview: () => void }) {
  const ledger = useJson<{ transactions: PointsTransaction[] }>("/api/panel/marketing/loyalty/transactions");
  // A used request key is spent: the overview is read again for a fresh one together with the ledger.
  const refresh = () => {
    ledger.reload();
    refreshOverview();
  };
  return (
    <div className="flex flex-col gap-6">
      {adjust.platform.allowed ? <PlatformAdjust key={adjust.platform.nonce} nonce={adjust.platform.nonce} refresh={refresh} /> : null}
      {adjust.shop.allowed ? <ShopAdjust key={adjust.shop.nonce} shop={adjust.shop} refresh={refresh} /> : null}
      <GlassSection title="آخرین تراکنش‌های امتیاز">
        <Loadable state={ledger} rows={4}>
          {(data) => <LedgerTable rows={data.transactions} />}
        </Loadable>
      </GlassSection>
    </div>
  );
}
