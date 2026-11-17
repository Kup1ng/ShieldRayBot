"use client";

import { Button, Chip, Input, Label, TextField } from "@heroui/react";
import { useState } from "react";

import { SectionBadge } from "@/components/ui/SectionBadge";
import { Icon } from "@/icons/Icon";

import { money } from "../../core/format";
import { ActionButton } from "../../ui/ActionButton";
import { InvoiceCard, type InvoiceLine } from "../../ui/flow/InvoiceCard";
import { StepFooter } from "../../ui/flow/StepFooter";
import { priceView } from "./catalogPrice";
import type { OrderChoice } from "./orderPay";
import { PayPicker, usePayMethods, usePayPicker } from "./PayPicker";
import { InsetBlock } from "./parts";
import { durationLabel, volumeLabel } from "./planGroups";
import { ServiceNameField } from "./ServiceNameField";
import type { Checkout, Plan } from "./types";

const CODE_MAX = 64;

type CheckoutStepProps = {
  plan: Plan;
  checkout: Checkout | null;
  wallet: number;
  /** The catalog says the shop takes wallet payment. */
  walletEnabled: boolean;
  /** The shop opened discount/gift codes and wallet top-up. */
  allowCode: boolean;
  allowTopup: boolean;
  applying: boolean;
  cancelling: boolean;
  paying: boolean;
  onApplyCode: (code: string) => void;
  onCancelCode: () => void;
  onPayWallet: () => void;
  onPayOrder: (choice: OrderChoice) => void;
  onBack: () => void;
  onTopup: () => void;
  /** The chosen way to pay, kept by the flow so going back from the payment page keeps it. */
  picked: string | null;
  onPicked: (id: string) => void;
  /** Where the shop makes the buyer name the service: the field's state. */
  name: { required: boolean; value: string; onChange: (value: string) => void; locked: boolean; showProblem: boolean };
  /** Shop staff with free checkout may take the order free (a plain order, not a discounted one). */
  onPayFree: (() => void) | null;
};

/** The lines of «فاکتور نهایی»: what is bought, and the code when one was applied. */
function invoiceLines(plan: Plan, checkout: Checkout | null): InvoiceLine[] {
  const lines: InvoiceLine[] = [
    { label: "نوع سرویس", value: plan.name },
    { label: "زمان سرویس", value: durationLabel(plan.days) },
    { label: "حجم سرویس", value: volumeLabel(plan.gb) },
  ];
  if (checkout) {
    lines.push({ label: "کد تخفیف", value: <bdi className="ltr">{checkout.code}</bdi> });
    lines.push({ label: "مبلغ تخفیف", value: <bdi>{money(checkout.discount)}</bdi> });
  } else {
    const view = priceView(plan);
    if (view.deadline) lines.push({ label: "تخفیف تا", value: view.deadline });
  }
  return lines;
}

/** Figma "New service" step 2: the blue invoice, an optional discount code and how to pay. */
export function CheckoutStep(props: CheckoutStepProps) {
  const { plan, checkout, wallet, allowCode, allowTopup, applying, cancelling, paying } = props;
  const view = priceView(plan);
  const payable = checkout ? checkout.amount : view.price;
  const { state: methods, reload: reloadMethods } = usePayMethods();
  const picker = usePayPicker({ methods, walletEnabled: props.walletEnabled, wallet, payable, walletOnly: plan.is_trial, picked: props.picked, onPicked: props.onPicked });
  const { pick, enough } = picker;

  const pay = () => {
    if (pick?.kind === "wallet") props.onPayWallet();
    else if (pick?.kind === "order") props.onPayOrder(pick.choice);
  };

  return (
    <>
      <SectionBadge icon="solar:cart-large-2-bold" title="خرید سرویس" />

      <InvoiceCard
        lines={invoiceLines(plan, checkout)}
        amount={payable}
        originalAmount={checkout ? checkout.original_amount : view.previous}
      />

      {plan.is_trial || !allowCode ? null : checkout ? (
        <InsetBlock title="کد تخفیف" labelId="shop-code">
          <div className="flex items-center justify-between gap-3">
            <Chip variant="soft" color="success">
              <Icon name="solar:ticket-sale-bold" size={16} />
              <Chip.Label>
                <bdi className="ltr">{checkout.code}</bdi>
              </Chip.Label>
            </Chip>
            <Button size="sm" variant="ghost" isPending={cancelling} onPress={props.onCancelCode}>
              حذف کد و انصراف
            </Button>
          </div>
        </InsetBlock>
      ) : (
        <DiscountForm applying={applying} onApply={props.onApplyCode} />
      )}

      {props.name.required ? (
        <ServiceNameField value={props.name.value} onChange={props.name.onChange} locked={props.name.locked} showProblem={props.name.showProblem} />
      ) : null}

      <PayPicker picker={picker} allowTopup={allowTopup} onTopup={props.onTopup} onRetry={() => reloadMethods()} />

      <StepFooter
        secondaryLabel="قبلی"
        onSecondary={props.onBack}
        secondaryDisabled={paying}
        primaryLabel={plan.is_trial ? "دریافت سرویس تست" : "پرداخت"}
        onPrimary={pay}
        primaryDisabled={!pick || (pick.kind === "wallet" && !enough)}
        primaryPending={paying}
      />
      {props.onPayFree && !plan.is_trial && !checkout ? (
        <ActionButton tone="neutral" icon="solar:gift-linear" fullWidth isDisabled={paying} onPress={props.onPayFree}>
          دریافت رایگان (مدیر)
        </ActionButton>
      ) : null}
    </>
  );
}

function DiscountForm({ applying, onApply }: { applying: boolean; onApply: (code: string) => void }) {
  const [code, setCode] = useState("");
  return (
    <InsetBlock>
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onApply(code.trim());
        }}
      >
        <TextField className="min-w-0 flex-1" value={code} onChange={setCode} maxLength={CODE_MAX} variant="secondary">
          <Label className="text-xs text-muted">کد تخفیف (اختیاری)</Label>
          <Input dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} className="ltr" />
        </TextField>
        <Button type="submit" variant="secondary" isPending={applying} className="!h-10 !rounded-lg">
          اعمال
        </Button>
      </form>
    </InsetBlock>
  );
}
