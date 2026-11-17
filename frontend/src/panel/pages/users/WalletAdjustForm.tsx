"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { confirm } from "../../core/confirm";
import { run } from "../../core/actions";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Latin digits from Persian/Arabic ones, with grouping marks dropped. */
export function normalizeAmount(raw: string): string {
  return raw
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[,٬\s]/g, "");
}

/** The amount typed, or an error text; the server validates it again. */
export function checkAmount(raw: string, min: number, label: string): { value: string } | { error: string } {
  const text = normalizeAmount(raw);
  if (!/^\d{1,12}$/.test(text)) return { error: `${label} باید عدد صحیح مثبت باشد` };
  if (Number(text) < min) return { error: `${label} حداقل ${min.toLocaleString("fa-IR")} است` };
  return { value: text };
}

type WalletAdjustFormProps = {
  /** The existing handler this form posts. */
  action: string;
  /** Idempotency key of this screen load: a repeated submit moves money once. */
  nonce: string;
  confirmMessage: string;
  confirmDescription?: string;
  amountLabel?: string;
  /** Form field names of the handler (wallet: amount/note; loyalty points: points/reason). */
  amountField?: string;
  noteField?: string;
  noteLabel?: string;
  noteRequired?: boolean;
  noteMax?: number;
  minAmount?: number;
  hint?: string;
  /** Accessible name of the «کاهش» / «افزایش» pair. */
  modeLabel?: string;
  /** Hidden fields the handler also needs (e.g. the customer id). */
  extraFields?: Record<string, string>;
  successText?: string;
  onDone: () => void;
};

/**
 * One money form for users and shop wallets (and, with other field names, loyalty points):
 * amount, a note, and «کاهش» / «افزایش» buttons that each ask before posting.
 */
export function WalletAdjustForm({
  action,
  nonce,
  confirmMessage,
  confirmDescription,
  amountLabel = "مبلغ (تومان)",
  amountField = "amount",
  noteField = "note",
  noteLabel = "یادداشت",
  noteRequired = false,
  noteMax = 120,
  minAmount = 1000,
  hint,
  modeLabel = "نوع تنظیم کیف پول",
  extraFields,
  successText = "کیف پول به‌روز شد",
  onDone,
}: WalletAdjustFormProps) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"credit" | "debit" | null>(null);

  const submit = async (mode: "credit" | "debit") => {
    const checked = checkAmount(amount, minAmount, amountLabel.replace(/\s*\(.*\)/, ""));
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    if (noteRequired && note.trim().length < 3) {
      setError(`${noteLabel} الزامی است (حداقل ۳ کاراکتر)`);
      return;
    }
    setError("");
    const ok = await confirm(confirmMessage, { description: confirmDescription, confirmLabel: "اعمال", tone: mode === "debit" ? "warning" : "accent" });
    if (!ok) return;
    setPending(mode);
    const result = await run(action, { [amountField]: checked.value, mode, [noteField]: note.trim(), nonce, ...extraFields }, { success: successText });
    setPending(null);
    if (result?.ok) {
      setAmount("");
      setNote("");
    }
    onDone();
  };

  return (
    <div className="flex flex-col gap-4">
      <TextField value={amount} onChange={setAmount} fullWidth>
        <Label>{amountLabel}</Label>
        <Input dir="ltr" className="text-start" inputMode="numeric" autoComplete="off" placeholder="مثلاً ۵۰,۰۰۰" />
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </TextField>
      <TextField value={note} onChange={setNote} fullWidth>
        <Label>{noteLabel}</Label>
        <Input maxLength={noteMax} autoComplete="off" placeholder={noteRequired ? "الزامی" : "اختیاری"} />
      </TextField>
      {error ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          <Icon name="solar:danger-circle-bold" size={18} />
          {error}
        </p>
      ) : null}
      <div role="group" aria-label={modeLabel} className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="!h-12 !rounded-lg" isPending={pending === "debit"} isDisabled={pending !== null} onPress={() => void submit("debit")}>
          <span aria-hidden className="size-2.5 rounded-full bg-[var(--tile-red)]" />
          کاهش
        </Button>
        <Button variant="outline" className="!h-12 !rounded-lg" isPending={pending === "credit"} isDisabled={pending !== null} onPress={() => void submit("credit")}>
          <span aria-hidden className="size-2.5 rounded-full bg-[var(--tile-green)]" />
          افزایش
        </Button>
      </div>
    </div>
  );
}
