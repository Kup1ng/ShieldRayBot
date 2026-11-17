"use client";

import { useMemo, useState } from "react";

import { IconTile } from "@/components/ui/IconTile";

import { money } from "../../core/format";
import { ActionButton } from "../../ui/ActionButton";
import { LoadingRows } from "../../ui/ScreenState";
import { PayMethods, type PayMethodOption } from "../../ui/flow/PayMethods";
import { api } from "../../core/api";
import { useLoad, type Loaded } from "../services/useLoad";
import { WALLET_ID, methodIcon, orderChoices, type OrderChoice, type PayMethodsPayload } from "./orderPay";

/** The shop's non-wallet ways to pay an order; read each time the payment step opens. */
export function usePayMethods() {
  return useLoad(() => api<PayMethodsPayload>("/api/mini/pay/methods"));
}

export type PayPick = { kind: "wallet" } | { kind: "order"; choice: OrderChoice };

type PickerInput = {
  /** /api/mini/pay/methods while it loads, failed or arrived. */
  methods: Loaded<PayMethodsPayload>;
  /** The shop opened wallet payment (the catalog says so too). */
  walletEnabled: boolean;
  wallet: number;
  payable: number;
  /** A free trial or anything else that only the wallet can pay. */
  walletOnly?: boolean;
  /** Only this row may be chosen (a renewal whose payment already started). */
  lockedTo?: string | null;
  /** Non-wallet methods cannot pay this order (the server said so). */
  ordersBlocked?: string | null;
  /** Keep the chosen row outside, so it survives leaving and re-entering the step. */
  picked?: string | null;
  onPicked?: (id: string) => void;
};

/** The state behind the «روش پرداخت» block: the rows, which one is chosen, and what it means. */
export function usePayPicker({ methods, walletEnabled, wallet, payable, walletOnly, lockedTo, ordersBlocked, picked: outer, onPicked }: PickerInput) {
  const [inner, setInner] = useState<string | null>(null);
  const picked = outer !== undefined ? outer : inner;
  const setPicked = onPicked ?? setInner;
  const loaded = methods.status === "ready" ? methods.data : null;
  const choices = useMemo(() => (walletOnly || !loaded ? [] : orderChoices(loaded.methods)), [loaded, walletOnly]);
  const walletOk = walletEnabled && (loaded ? Boolean(loaded.wallet_pay_enabled) : true);
  const enough = payable <= wallet;

  const rowOk = (id: string) => !lockedTo || lockedTo === id;
  const walletUsable = walletOk && rowOk(WALLET_ID);
  const orderUsable = (id: string) => !ordersBlocked && rowOk(id);

  const usable = (id: string) => (id === WALLET_ID ? walletUsable : choices.some((c) => c.id === id) && orderUsable(id));
  const fallback = walletUsable ? WALLET_ID : choices.find((c) => orderUsable(c.id))?.id ?? null;
  const selected = picked && usable(picked) ? picked : lockedTo && usable(lockedTo) ? lockedTo : fallback;

  const options: PayMethodOption[] = [];
  if (walletEnabled || choices.length) {
    options.push({
      id: WALLET_ID,
      label: "موجودی کیف پول",
      icon: "solar:wallet-bold",
      hint: walletOk ? money(wallet) : "پرداخت با کیف پول غیرفعال است",
      chip: walletOk ? { text: enough ? "کافی" : "ناکافی", tone: enough ? "success" : "danger" } : undefined,
      disabled: !walletUsable,
    });
  }
  for (const choice of choices) {
    options.push({
      id: choice.id,
      label: choice.label,
      icon: methodIcon(choice.method),
      hint: !orderUsable(choice.id) && ordersBlocked ? ordersBlocked : choice.hint,
      disabled: !orderUsable(choice.id),
    });
  }

  const pick: PayPick | null =
    selected === WALLET_ID ? { kind: "wallet" } : selected ? { kind: "order", choice: choices.find((c) => c.id === selected) as OrderChoice } : null;

  return { options, selected, setPicked, pick, enough, walletOk, loading: methods.status === "loading", failed: methods.status === "error", empty: !options.length };
}

export type PayPickerState = ReturnType<typeof usePayPicker>;

/** Figma «روش پرداخت»: the wallet and every other way the shop takes payment for an order. */
export function PayPicker({
  picker,
  allowTopup,
  onTopup,
  onRetry,
  noWayText = "پرداخت با کیف پول در تنظیمات ربات غیرفعال است؛ خرید را از داخل ربات انجام دهید.",
}: {
  picker: PayPickerState;
  allowTopup: boolean;
  onTopup: () => void;
  onRetry: () => void;
  noWayText?: string;
}) {
  const { options, selected, setPicked, pick, enough, loading, failed } = picker;
  if (!pick) {
    if (loading) return <LoadingRows rows={2} />;
    return (
      <div role="note" className="inset-tile flex items-start gap-3 rounded-lg p-4">
        <IconTile icon="solar:wallet-bold" tone="gray" />
        <p className="text-sm leading-6 text-foreground/80">{noWayText}</p>
      </div>
    );
  }
  const short = pick?.kind === "wallet" && !enough;
  return (
    <>
      <PayMethods options={options} value={selected} onChange={setPicked} />
      {loading ? <LoadingRows rows={1} /> : null}
      {failed ? (
        <div role="note" className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>روش‌های دیگر پرداخت بارگذاری نشد.</span>
          <ActionButton tone="neutral" size="md" onPress={onRetry}>
            تلاش دوباره
          </ActionButton>
        </div>
      ) : null}
      {short ? (
        <div role="alert" className="flex flex-col gap-3">
          <p className="text-sm text-danger">موجودی کیف پول کافی نیست.</p>
          {allowTopup ? (
            <ActionButton tone="neutral" icon="solar:wallet-money-bold" fullWidth onPress={onTopup}>
              شارژ کیف پول
            </ActionButton>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
