"use client";

import { useId, useState, type DragEvent } from "react";

import { Icon } from "@/icons/Icon";

type ReceiptDropProps = {
  file: File | null;
  onFile: (file: File | null) => void;
  title?: string;
  hint?: string;
};

/** Figma «بارگذاری رسید کارت به کارت»: a dashed drop zone that also opens the file picker. */
export function ReceiptDrop({ file, onFile, title = "بارگذاری رسید کارت به کارت", hint = "عکس نباید بیشتر از ۸ مگابایت باشد" }: ReceiptDropProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  };

  return (
    <section className="inset-tile flex flex-col gap-4 rounded-lg p-4" aria-label={title}>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium text-foreground">{title}</h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-7 text-center transition-colors focus-within:ring-2 focus-within:ring-focus ${
          dragging ? "border-accent bg-accent-soft" : "border-border-secondary"
        }`}
      >
        <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-[10px] bg-[var(--eclipse)] text-white dark:bg-white dark:text-[var(--eclipse)]">
          <Icon name="solar:gallery-bold" size={24} />
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
          id={inputId}
          type="file"
          name="receipt"
          accept="image/jpeg,image/png,image/*"
          className="sr-only"
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        />
      </label>
    </section>
  );
}
