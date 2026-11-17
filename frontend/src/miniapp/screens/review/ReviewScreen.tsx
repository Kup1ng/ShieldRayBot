"use client";

import { Chip } from "@heroui/react";

import { SectionBadge } from "@/components/ui/SectionBadge";

import { faDigits, formatDateTime, money, num } from "../../core/format";
import { invalidateResource, useResource } from "../../state/resources";
import { useMini } from "../../state/store";
import { EmptyState, Settled } from "../../ui/ScreenState";
import { RowButton } from "../ops/parts";
import { ReceiptSheet } from "./ReceiptSheet";
import { reviewKindText, type ReviewData, type ReviewItem } from "./reviewKit";

/** Pending receipts, oldest first. The server decides who may review; a refusal shows as the error. */
export function ReviewScreen() {
  const { openSheet } = useMini();
  const queue = useResource<ReviewData>("review");

  const open = (item: ReviewItem) =>
    openSheet({ title: `رسید #${num(item.id)}`, render: () => <ReceiptSheet item={item} /> });

  return (
    <>
      <SectionBadge icon="solar:bill-check-bold" tone="yellow" title="رسیدهای در انتظار تأیید" />
      <Settled resource={queue} rows={3} onRetry={() => invalidateResource("review")}>
        {(data) => {
          const items = data.items ?? [];
          if (!items.length) return <EmptyState icon="solar:bill-check-linear" title="رسیدی در انتظار بررسی نیست." />;
          const total = Number(data.total) || items.length;
          return (
            <>
              {total > items.length ? (
                <p role="status" className="rounded-lg bg-warning/12 p-3 text-xs text-foreground">
                  {num(items.length)} رسید قدیمی‌تر از {num(total)} رسید نمایش داده شده است.
                </p>
              ) : null}
              <div className="flex flex-col gap-3">
                {items.map((item) => (
                  <RowButton
                    key={item.id}
                    icon={item.kind === "topup" ? "solar:wallet-money-bold" : "solar:bill-list-bold"}
                    tone={item.kind === "topup" ? "orange" : "purple"}
                    title={<span className="num">{money(item.amount)}</span>}
                    subtitle={
                      <>
                        {reviewKindText(item)}، <bdi className="ltr">{item.payer || "—"}</bdi>، {faDigits(formatDateTime(item.created_at))}
                      </>
                    }
                    trailing={
                      <Chip size="sm" variant="soft" color="warning">
                        <Chip.Label>بررسی</Chip.Label>
                      </Chip>
                    }
                    aria-label={`رسید ${num(item.id)}، ${money(item.amount)}`}
                    onPress={() => open(item)}
                  />
                ))}
              </div>
            </>
          );
        }}
      </Settled>
    </>
  );
}
