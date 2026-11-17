"use client";

import { useEffect, useState } from "react";

import { api } from "../../core/api";
import { faDigits, formatDateTime, money, num } from "../../core/format";
import { confirmAction } from "../../core/telegram";
import { invalidateResource } from "../../state/resources";
import { failureText, useMini, useSheetClose } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { LoadingRows } from "../../ui/ScreenState";
import { InfoRow } from "@/components/ui/InfoRow";
import { REVIEW_ACTIONS, REVIEW_UNKNOWN, reviewKindText, type ReviewItem, type ReviewKind } from "./reviewKit";

type Photo = { status: "loading" } | { status: "ready"; url: string } | { status: "error"; error: string };

/** Fetches the receipt as a blob and keeps its object URL only while the sheet is open. */
function useReceiptPhoto(id: number): Photo {
  const [photo, setPhoto] = useState<Photo>({ status: "loading" });
  useEffect(() => {
    let url = "";
    let cancelled = false;
    api<Blob>(`/api/mini/review/${id}/receipt`, { blob: true })
      .then((blob) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        // Only a blob: address made by the browser is ever used as the photo source.
        if (!/^blob:/i.test(objectUrl)) {
          setPhoto({ status: "error", error: "تصویر رسید نمایش داده نشد" });
          return;
        }
        url = objectUrl;
        setPhoto({ status: "ready", url });
      })
      .catch((err: unknown) => {
        if (!cancelled) setPhoto({ status: "error", error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return photo;
}

/** Sheet body for one receipt: the photo, the facts and the approve / reject pair. */
export function ReceiptSheet({ item }: { item: ReviewItem }) {
  const { run, busy, notify } = useMini();
  const closeSheet = useSheetClose();
  const id = Number(item.id) || 0;
  const photo = useReceiptPhoto(id);
  const key = `review:${id}`;

  /** One request per tap and no automatic retry: the queue is read again either way. */
  const act = async (kind: ReviewKind) => {
    const spec = REVIEW_ACTIONS[kind];
    if (!(await confirmAction(spec.confirm))) return;
    await run(key, async () => {
      try {
        const res = await api<{ message?: string }>(`/api/mini/review/${id}/${kind}`, { method: "POST", body: {} });
        notify(res.message || spec.done);
      } catch (err) {
        notify(failureText(err, REVIEW_UNKNOWN), "err");
      }
      closeSheet();
      invalidateResource("review");
      invalidateResource("ops");
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {photo.status === "loading" ? <LoadingRows rows={1} /> : null}
      {photo.status === "error" ? (
        <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-foreground">
          {photo.error}
        </p>
      ) : null}
      {photo.status === "ready" ? (
        <img src={photo.url} alt={`تصویر رسید پرداخت #${num(id)}`} className="max-h-[50dvh] w-full rounded-lg bg-surface object-contain" />
      ) : null}
      <div className="flex flex-col gap-2">
        <InfoRow icon="solar:wallet-money-bold" tone="green" label="مبلغ" value={<span className="num">{money(item.amount)}</span>} />
        <InfoRow icon="solar:bill-list-bold" tone="purple" label="نوع" value={reviewKindText(item)} />
        <InfoRow icon="solar:user-bold" tone="blue" label="پرداخت‌کننده" value={<bdi className="ltr">{item.payer || "—"}</bdi>} />
        <InfoRow icon="solar:clock-circle-bold" tone="gray" label="زمان" value={faDigits(formatDateTime(item.created_at))} />
      </div>
      <div className="flex gap-4">
        <ActionButton tone="success" icon="solar:check-circle-bold" className="flex-1" isPending={busy(key)} onPress={() => void act("approve")}>
          تأیید پرداخت
        </ActionButton>
        <ActionButton tone="danger" icon="solar:close-circle-bold" className="flex-1" isDisabled={busy(key)} onPress={() => void act("reject")}>
          رد پرداخت
        </ActionButton>
      </div>
    </div>
  );
}
