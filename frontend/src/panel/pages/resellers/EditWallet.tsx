"use client";

import { Button } from "@heroui/react";
import { useState } from "react";

import { run } from "../../core/actions";
import type { ActionResult } from "../../core/api";
import { fa, toman } from "../../core/format";
import { Ltr, StatusChip } from "../../ui/Data";
import { MoneyInput, TextInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { Notice } from "../../ui/States";
import { LEDGER_KIND_LABELS } from "./labels";
import type { LedgerRow, PaygBlock } from "./types";

const MIN_AMOUNT = 1000;
const NOTE_MAX = 200;
const FIXED_CONFIRM = "موجودی کیف پول این نماینده مطابق مبلغ و نوع انتخاب‌شده تغییر کند؟";
const PAYG_CONFIRM = "موجودی کیف پول این نماینده تغییر کند؟ اگر با کاهش موجودی صفر شود، ادمین پاسارگارد نماینده و همهٔ کاربرانش همان لحظه قطع می‌شوند.";

type Mode = "credit" | "debit";

/** Amount, note and «کاهش» / «افزایش»; the page's nonce makes a repeated submit move money once. */
function WalletForm({ shopId, nonce, confirmText, initialAmount, hint, onSettled }: { shopId: number; nonce: string; confirmText: string; initialAmount: string; hint?: string; onSettled: (result: ActionResult | null) => void }) {
  const [amount, setAmount] = useState(initialAmount);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<Mode | null>(null);
  const valid = Number(amount) >= MIN_AMOUNT;

  const submit = async (mode: Mode) => {
    if (!valid) return;
    setPending(mode);
    try {
      const result = await run(
        `/resellers/${shopId}/billing-topup`,
        { amount, mode, note: note.trim(), nonce },
        { ask: { title: "تأیید تنظیم کیف پول", text: confirmText, confirmLabel: "اعمال", tone: mode === "debit" ? "warning" : "accent" } },
      );
      if (result?.ok) {
        setAmount("");
        setNote("");
      }
      onSettled(result);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <MoneyInput label="مبلغ (تومان)" value={amount} onChange={setAmount} placeholder="مثلاً ۵۰٬۰۰۰" help={hint ?? `حداقل ${toman(MIN_AMOUNT)}`} />
      <TextInput label="یادداشت" value={note} onChange={setNote} maxLength={NOTE_MAX} placeholder="اختیاری" />
      <div role="group" aria-label="نوع تنظیم کیف پول" className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="!h-12 !rounded-lg" isPending={pending === "debit"} isDisabled={pending !== null || !valid} onPress={() => void submit("debit")}>
          <span aria-hidden className="size-2.5 rounded-full bg-[var(--tile-red)]" />
          کاهش
        </Button>
        <Button variant="outline" className="!h-12 !rounded-lg" isPending={pending === "credit"} isDisabled={pending !== null || !valid} onPress={() => void submit("credit")}>
          <span aria-hidden className="size-2.5 rounded-full bg-[var(--tile-green)]" />
          افزایش
        </Button>
      </div>
    </div>
  );
}

function Ledger({ title, caption, rows, label }: { title: string; caption?: string; rows: LedgerRow[]; label: (row: LedgerRow) => string }) {
  if (!rows.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {caption ? <p className="text-xs text-muted">{caption}</p> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id} className="inset-tile flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm">
            <span className="flex min-w-0 flex-col">
              <Ltr className={row.amount < 0 ? "text-danger" : "text-success"}>{fa(row.amount)}</Ltr>
              <span className="truncate text-xs text-muted">{label(row)}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end text-xs text-muted">
              <Ltr>#{fa(row.id)}</Ltr>
              <span>{toman(row.balance_after)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A fixed-package shop's wallet: the balance and one adjust form. */
export function FixedWalletSection({ shopId, balance, nonce, onSettled }: { shopId: number; balance: number; nonce: string; onSettled: (result: ActionResult | null) => void }) {
  return (
    <GlassSection title="کیف پول" description={`موجودی فعلی: ${toman(balance)} — مبلغ را وارد کنید، سپس افزایش یا کاهش را بزنید. موجودی منفی مجاز نیست.`}>
      <WalletForm shopId={shopId} nonce={nonce} confirmText={FIXED_CONFIRM} initialAmount="" onSettled={onSettled} />
    </GlassSection>
  );
}

/** A PAYG shop: suspension state, rate, the same adjust form and both ledgers. */
export function PaygSection({ shopId, payg, suspended, watermark, nonce, onSettled }: { shopId: number; payg: PaygBlock; suspended: boolean; watermark: string; nonce: string; onSettled: (result: ActionResult | null) => void }) {
  const minimum = payg.min_unsuspend;
  return (
    <GlassSection
      title="مدیریت PAYG"
      description={suspended ? "وضعیت: مسدود — موجودی کیف پول صفر (با تگ «فعال» نماینده فرق دارد)" : "وضعیت: فعال"}
      actions={<StatusChip color={suspended ? "danger" : "success"}>{suspended ? "مسدود" : "فعال"}</StatusChip>}
    >
      {suspended ? <Notice tone="danger">حساب به‌خاطر موجودی صفر مسدود است — حداقل شارژ برای رفع مسدودی: {toman(minimum)}</Notice> : null}
      <ul className="grid gap-2 sm:grid-cols-3">
        <li className="inset-tile flex flex-col rounded-lg px-3 py-2 text-sm">
          <span className="text-xs text-muted">موجودی کیف پول</span>
          <span className="font-medium">{toman(payg.balance)}</span>
        </li>
        <li className="inset-tile flex flex-col rounded-lg px-3 py-2 text-sm">
          <span className="text-xs text-muted">نرخ پلن</span>
          <span className="font-medium">{toman(payg.rate_per_gb)} / گیگ</span>
        </li>
        <li className="inset-tile flex flex-col rounded-lg px-3 py-2 text-sm">
          <span className="text-xs text-muted">آخرین مصرف صورتحساب‌شده</span>
          <Ltr className="font-medium">{watermark}</Ltr>
        </li>
      </ul>
      <p className="text-xs leading-5 text-muted">مصرف ترافیک از کیف پول فروشگاه نماینده کم می‌شود و افزایش یا کاهش دستی هم روی همان کیف پول اعمال می‌شود؛ موجودی منفی مجاز نیست. ستون «مانده» موجودی بعد از هر تراکنش است.</p>
      <WalletForm
        shopId={shopId}
        nonce={nonce}
        confirmText={PAYG_CONFIRM}
        initialAmount={minimum ? String(minimum) : ""}
        hint={minimum ? `حداقل شارژ برای رفع مسدودی: ${toman(minimum)} (۲× آستانه هشدار)` : undefined}
        onSettled={onSettled}
      />
      <Ledger title="تراکنش‌های کیف پول" rows={payg.wallet_txs} label={(row) => row.label || "—"} />
      <Ledger
        title="تراکنش‌های مصرف PAYG"
        caption="مانده = کیف پول فروشگاهی پس از کسر/شارژ"
        rows={payg.billing_txs}
        label={(row) => `${LEDGER_KIND_LABELS[row.label] ?? (row.label || "—")}${row.note ? ` · ${row.note}` : ""}`}
      />
    </GlassSection>
  );
}
