"use client";

import { useId, useRef, useState, type DragEvent } from "react";

import { Icon } from "@/icons/Icon";

import { api, isUnknownOutcome } from "../../core/api";
import { invalidateResource } from "../../state/resources";
import { failureText, useMini, type MiniContextValue } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";

const RECEIPT_MAX_SIDE = 1600;
const RECEIPT_QUALITY = 0.85;
export const RECEIPT_UNKNOWN_OUTCOME = "نتیجهٔ ارسال رسید مشخص نشد؛ «شارژهای اخیر» را بررسی کنید. هر پرداخت فقط یک رسید می‌پذیرد.";

/** Re-encode as a bounded JPEG: smaller upload, and the photo's location data is dropped. */
export async function prepareReceipt(file: File | null | undefined): Promise<Blob> {
  if (!file || !/^image\//.test(String(file.type || ""))) throw new Error("تصویر رسید را انتخاب کنید");
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, RECEIPT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", RECEIPT_QUALITY));
      if (blob) return blob;
    } else {
      bitmap.close?.();
    }
  } catch {
    // Fall back to the original file; the server checks type and size again.
  }
  if (file.type === "image/jpeg" || file.type === "image/png") return file;
  throw new Error("این نوع تصویر پشتیبانی نمی‌شود؛ عکس JPG یا PNG انتخاب کنید");
}

/** Figma "Payment" upload block: dashed drop area, file picker, «ارسال رسید». */
export function ReceiptForm({ paymentId, onDone }: { paymentId: number; onDone: () => void }) {
  const { run, busy, notify, refreshAfterChange } = useMini();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const key = `receipt:${paymentId}`;

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  };

  const upload = () => {
    if (!paymentId || !file) {
      notify("تصویر رسید را انتخاب کنید", "err");
      return;
    }
    void run(key, async () => {
      let image: Blob;
      try {
        image = await prepareReceipt(file);
      } catch (err) {
        notify(err instanceof Error ? err.message : String(err), "err");
        return;
      }
      try {
        const res = await api<{ status?: string; message?: string }>(`/api/mini/topup/${paymentId}/receipt`, { method: "POST", raw: image });
        notify(res.message || "رسید ثبت شد");
        onDone();
      } catch (err) {
        notify(failureText(err, RECEIPT_UNKNOWN_OUTCOME), "err");
        if (!isUnknownOutcome(err)) return;
      }
      invalidateResource("topup");
      await refreshAfterChange();
    });
  };

  return (
    <form
      className="inset-tile flex flex-col gap-3 rounded-lg p-4"
      onSubmit={(event) => {
        event.preventDefault();
        upload();
      }}
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">بارگذاری رسید واریز</h3>
        <p className="text-xs text-muted">عکس JPG یا PNG، حداکثر ۸ مگابایت</p>
      </div>
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors focus-within:ring-2 focus-within:ring-focus ${dragging ? "border-accent bg-accent-soft" : "border-border"}`}
      >
        <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-[10px] bg-[var(--tile-gray)] text-white">
          <Icon name="solar:gallery-add-bold" size={24} />
        </span>
        {file ? (
          <span className="text-sm font-medium break-all text-foreground">
            تصویر انتخاب‌شده: <bdi>{file.name}</bdi>
          </span>
        ) : (
          <span className="text-sm text-foreground">
            عکس را اینجا رها کنید یا <span className="font-semibold text-accent">انتخاب کنید</span>
          </span>
        )}
        <span className="ltr text-xs text-muted">PNG, JPEG, JPG</span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          name="receipt"
          accept="image/jpeg,image/png,image/*"
          className="sr-only"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <ActionButton type="submit" tone="ink" icon="solar:upload-linear" fullWidth isPending={busy(key)}>
        ارسال رسید
      </ActionButton>
      <p className="text-xs leading-5 text-muted">تصویر رسید برای شما در ربات هم فرستاده می‌شود. می‌توانید رسید را مستقیم در ربات هم بفرستید.</p>
    </form>
  );
}

/** «ارسال رسید» for a top-up still waiting for its receipt (from «شارژهای اخیر»). */
export function openReceipt(mini: MiniContextValue, paymentId: number): void {
  if (!paymentId) return;
  mini.openSheet({ title: "ارسال رسید", render: (close) => <ReceiptForm paymentId={paymentId} onDone={close} /> });
}
