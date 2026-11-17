"use client";

import { Alert } from "@heroui/react";
import { useState } from "react";

import { SectionBadge } from "@/components/ui/SectionBadge";

import { ApiError, api, isUnknownOutcome } from "../../core/api";
import { haptic } from "../../core/telegram";
import { failureText, useMini } from "../../state/store";
import { InvoiceCard, type InvoiceLine } from "../../ui/flow/InvoiceCard";
import { StepFooter } from "../../ui/flow/StepFooter";
import { ErrorState, LoadingRows } from "../../ui/ScreenState";
import { ActionButton } from "../../ui/ActionButton";
import { openTopup } from "../account/topup";
import { priceView } from "../shop/catalogPrice";
import { CARD_PAY_UNKNOWN, WALLET_ID, readStart, type OrderChoice, type OrderPayStart, type OrderPayment } from "../shop/orderPay";
import { PayPicker, usePayMethods, usePayPicker } from "../shop/PayPicker";
import { PaymentStages } from "../shop/PaymentStages";
import { InsetBlock } from "../shop/parts";
import { durationLabel, volumeLabel } from "../shop/planGroups";
import type { Plan } from "../shop/types";
import { RenewCategoryPlans, RenewChoices } from "./RenewChoices";
import { categoryGroups, type RenewPlan, type RenewalOptions } from "./renewalOptions";
import { RENEW_UNKNOWN_OUTCOME, type RenewPreview } from "./types";
import { useLoad } from "./useLoad";

const CARD_REFUSED = "تمدید با این روش پرداخت ممکن نیست؛ از کیف پول پرداخت کنید.";

type Started = { orderId: number; payment: OrderPayment; label: string };

function invoiceLines(preview: RenewPreview, plan: Plan): InvoiceLine[] {
  const lines: InvoiceLine[] = [
    { label: "نوع سرویس", value: preview.plan_name },
    { label: "زمان سرویس", value: durationLabel(plan.days) },
    { label: "حجم سرویس", value: volumeLabel(plan.gb) },
  ];
  const view = priceView(preview);
  if (view.deadline) lines.push({ label: "تخفیف تا", value: view.deadline });
  return lines;
}

/** Figma "Renew service" step 2 once the preview is in: the invoice and how to pay. */
function RenewPay({
  serviceId,
  plan,
  preview,
  walletEnabled,
  onBack,
  onRestart,
  onExit,
}: {
  serviceId: number;
  plan: Plan;
  preview: RenewPreview;
  walletEnabled: boolean;
  onBack: () => void;
  /** A rejected or expired card payment: a new preview (a new request key) is needed. */
  onRestart: () => void;
  onExit: () => void;
}) {
  const mini = useMini();
  const { commerce, customer, features, run, busy, notify, showFreshState, refreshAfterChange, go } = mini;
  const { state: methods, reload: reloadMethods } = usePayMethods();
  // After a lost reply or a started card payment only this choice may be paid again: it re-sends
  // the same request key, which the server applies at most once. Going back would mean a new key.
  const [locked, setLocked] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [started, setStarted] = useState<Started | null>(null);
  const [onPayStep, setOnPayStep] = useState(false);
  const key = `renew:${serviceId}`;

  const wallet = Number(customer?.wallet) || 0;
  const price = Number(preview.price) || 0;
  const picker = usePayPicker({ methods, walletEnabled, wallet, payable: price, lockedTo: locked, ordersBlocked: refused });
  const { pick, enough } = picker;

  const body = () => ({ terms: preview.terms, price: preview.price, request_key: preview.request_key });

  const payWallet = () =>
    run(key, async () => {
      if (!commerce) return;
      try {
        const res = await api<{ message?: string }>("/api/mini/renew", {
          method: "POST",
          body: { service_id: serviceId, plan_id: plan.id, preview: body() },
        });
        notify(res.message || "تمدید انجام شد");
        await showFreshState({ serviceId });
        onExit();
      } catch (err) {
        // Keep the preview: a retry re-sends its request key, which the server applies at most once.
        if (isUnknownOutcome(err)) setLocked(WALLET_ID);
        notify(failureText(err, RENEW_UNKNOWN_OUTCOME), "err");
      }
    });

  const payCard = (choice: OrderChoice) =>
    run(key, async () => {
      if (!commerce) return;
      // This preview already has its payment: show it again, never ask the server twice.
      if (started) {
        setOnPayStep(true);
        return;
      }
      try {
        const res = readStart(
          await api<OrderPayStart>("/api/mini/renew/pay", {
            method: "POST",
            body: { service_id: serviceId, plan_id: plan.id, preview: body(), method: choice.method, dest_id: choice.dest },
          }),
        );
        setLocked(choice.id);
        if (!res) {
          notify(CARD_PAY_UNKNOWN, "err");
          return;
        }
        setStarted({ orderId: res.order_id, payment: res.payment, label: choice.label });
        setOnPayStep(true);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          // The service layer cannot renew through this payment: nothing was created.
          setRefused(err.message || CARD_REFUSED);
          notify(err.message || CARD_REFUSED, "err");
          return;
        }
        if (isUnknownOutcome(err)) setLocked(choice.id);
        notify(failureText(err, CARD_PAY_UNKNOWN), "err");
      }
    });

  const submit = () => {
    if (pick?.kind === "wallet") void payWallet();
    else if (pick?.kind === "order") void payCard(pick.choice);
  };

  if (onPayStep && started) {
    return (
      <PaymentStages
        key={started.payment.id}
        payment={started.payment}
        orderId={started.orderId}
        methodLabel={started.label}
        onBack={() => setOnPayStep(false)}
        onRestart={onRestart}
        onOpenService={() => onExit()}
        onLeave={() => go("services")}
        onDelivered={() => void refreshAfterChange()}
      />
    );
  }

  return (
    <>
      <SectionBadge icon="solar:refresh-circle-bold" title="تمدید سرویس" />
      <InvoiceCard lines={invoiceLines(preview, plan)} amount={price} originalAmount={priceView(preview).previous} />

      {(preview.lines ?? []).length ? (
        <InsetBlock title="پس از تمدید" labelId="renew-lines">
          <ul className="flex flex-col gap-1.5 text-sm leading-6 text-foreground/85">
            {(preview.lines ?? []).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </InsetBlock>
      ) : null}
      {(preview.warnings ?? []).map((line) => (
        <Alert key={line} status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{line}</Alert.Description>
          </Alert.Content>
        </Alert>
      ))}
      {preview.notice ? <p className="text-xs leading-6 text-muted">{preview.notice}</p> : null}

      <PayPicker
        picker={picker}
        allowTopup={features.topup}
        onTopup={() => openTopup(mini)}
        onRetry={() => reloadMethods()}
        noWayText="پرداخت با کیف پول در تنظیمات ربات غیرفعال است؛ تمدید را از داخل ربات انجام دهید."
      />
      {locked ? (
        <p className="text-xs leading-6 text-muted">
          {locked === WALLET_ID
            ? "مبلغ فقط یک بار از کیف پول کم می‌شود؛ با «پرداخت» دوباره تلاش کردن امن است."
            : "پرداخت این تمدید ثبت شده است؛ با «پرداخت» به ادامهٔ آن برگردید."}
        </p>
      ) : null}

      <StepFooter
        primaryLabel="پرداخت"
        onPrimary={submit}
        primaryPending={busy(key)}
        primaryDisabled={!pick || (pick.kind === "wallet" && !enough && !locked)}
        secondaryLabel="قبلی"
        onSecondary={onBack}
        // After a lost reply or a started payment only «پرداخت» may go on: a new preview would carry a new request key.
        secondaryDisabled={busy(key) || Boolean(locked)}
      />
    </>
  );
}

/** Step 2 (Figma 13933:64017): the previewed result, then confirm. */
function RenewInvoice({
  serviceId,
  plan,
  walletEnabled,
  onBack,
  onExit,
}: {
  serviceId: number;
  plan: Plan;
  walletEnabled: boolean;
  onBack: () => void;
  onExit: () => void;
}) {
  const { state, reload } = useLoad(() => api<RenewPreview>(`/api/mini/service/${serviceId}/renewal-preview?plan_id=${plan.id}`));

  if (state.status === "loading") {
    return (
      <>
        <SectionBadge icon="solar:refresh-circle-bold" title="تمدید سرویس" />
        <LoadingRows rows={3} />
      </>
    );
  }
  if (state.status === "error") {
    return (
      <>
        <SectionBadge icon="solar:refresh-circle-bold" title="تمدید سرویس" />
        <ErrorState message={state.error} onRetry={() => reload()} />
        <ActionButton tone="neutral" icon="solar:arrow-right-linear" onPress={onBack}>
          انتخاب پلن
        </ActionButton>
      </>
    );
  }
  return (
    <RenewPay
      key={state.data.request_key}
      serviceId={serviceId}
      plan={plan}
      preview={state.data}
      walletEnabled={walletEnabled}
      onBack={onBack}
      onRestart={() => {
        haptic("select");
        reload();
      }}
      onExit={onExit}
    />
  );
}

type RenewView = { step: "choices" } | { step: "category"; key: string } | { step: "invoice"; plan: RenewPlan; from: string | null };

/** Renewal as full-page steps inside the service screen: plan (current, then categories) → invoice + payment → receipt → ticket. */
export function RenewFlow({ serviceId, onExit }: { serviceId: number; onExit: () => void }) {
  const [view, setView] = useState<RenewView>({ step: "choices" });
  // The choices are read fresh each time the renewal opens: they depend on this service's plan.
  const { state, reload } = useLoad(() => api<RenewalOptions>(`/api/mini/service/${serviceId}/renewal-options`));

  if (state.status === "loading") {
    return (
      <>
        <SectionBadge icon="solar:refresh-circle-bold" title="تمدید سرویس" />
        <LoadingRows rows={3} />
      </>
    );
  }
  if (state.status === "error") {
    return (
      <>
        <SectionBadge icon="solar:refresh-circle-bold" title="تمدید سرویس" />
        <ErrorState message={state.error} onRetry={() => reload()} />
        <ActionButton tone="neutral" icon="solar:arrow-right-linear" onPress={onExit}>
          بازگشت به سرویس
        </ActionButton>
      </>
    );
  }

  const options = state.data;
  if (view.step === "invoice") {
    const back = () => setView(view.from ? { step: "category", key: view.from } : { step: "choices" });
    return (
      <RenewInvoice key={view.plan.id} serviceId={serviceId} plan={view.plan} walletEnabled={options.wallet_pay_enabled} onBack={back} onExit={onExit} />
    );
  }

  // An unknown or emptied category (the catalog changed) goes back to the choices.
  const group = view.step === "category" ? categoryGroups(options).find((g) => g.key === view.key) : undefined;
  const from = group ? group.key : null;
  const pick = (plan: RenewPlan) => {
    haptic("select");
    setView({ step: "invoice", plan, from });
  };

  return (
    <>
      <SectionBadge icon="solar:refresh-circle-bold" title="تمدید سرویس" />
      {group ? (
        <RenewCategoryPlans group={group} onPick={pick} onBack={() => setView({ step: "choices" })} />
      ) : (
        <RenewChoices options={options} onPick={pick} onOpenCategory={(key) => setView({ step: "category", key })} />
      )}
    </>
  );
}
