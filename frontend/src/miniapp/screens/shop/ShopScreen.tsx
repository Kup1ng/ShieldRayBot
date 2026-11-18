"use client";

import { useEffect, useRef, useState } from "react";

import { SectionBadge } from "@/components/ui/SectionBadge";

import { FALLBACK_ERROR, api, isUnknownOutcome } from "../../core/api";
import { formatDate, money } from "../../core/format";
import { confirmAction, haptic } from "../../core/telegram";
import { invalidateResource, useResource } from "../../state/resources";
import { failureText, useMini } from "../../state/store";
import { SuccessTicket } from "../../ui/flow/SuccessTicket";
import { EmptyState, Settled } from "../../ui/ScreenState";
import { openTopup } from "../account/topup";
import { CheckoutStep } from "./CheckoutStep";
import { CARD_PAY_UNKNOWN, newRequestKey, readStart, type OrderChoice, type OrderPayStart, type OrderPayment } from "./orderPay";
import { PaymentStages } from "./PaymentStages";
import { PlanPicker } from "./PlanPicker";
import { defaultPlanId, trialPlan } from "./planGroups";
import { TRIAL_STEP } from "./trialStep";
import type { Checkout, PlansPayload, PurchaseResult } from "./types";
import { useServiceName } from "./useServiceName";

const UNKNOWN_OUTCOME = "نتیجهٔ درخواست مشخص نشد. پیش از تلاش دوباره، سرویس‌ها و تراکنش‌ها را بررسی کنید.";
const PAY_UNKNOWN_OUTCOME = "نتیجهٔ پرداخت مشخص نشد. دوباره «پرداخت» را بزنید؛ مبلغ فقط یک بار کسر می‌شود.";

type Step = "pick" | "invoice" | "pay";
type CheckoutState = Checkout & { planId: number };
type Ticket = { title: string; amount: number; date: string; method: string; detail?: string };
/** How a finished purchase reads on its ticket (wallet by default). */
type TicketKind = { title: string; method: string };
const WALLET_TICKET: TicketKind = { title: "پرداخت موفقیت‌آمیز", method: "کیف پول" };
const FREE_TICKET: TicketKind = { title: "سرویس تحویل شد", method: "دریافت رایگان (مدیر)" };
/** A card (or other) payment started for one exact choice of plan, code and method. */
type Started = { sig: string; orderId: number; payment: OrderPayment; label: string };

/** The buying flow over one loaded catalog. */
function ShopFlow({ data }: { data: PlansPayload }) {
  const mini = useMini();
  const { customer, commerce, features, run, busy, notify, refreshAfterChange, showFreshState, go, route } = mini;
  const plans = data.plans ?? [];
  // Arriving from the home offer «دریافت تست» starts on the trial plan, when this shop lists one.
  const [planId, setPlanId] = useState<number | null>(() => (route.then === TRIAL_STEP ? trialPlan(plans)?.id : undefined) ?? defaultPlanId(plans));
  const [step, setStep] = useState<Step>("pick");
  const [checkout, setCheckout] = useState<CheckoutState | null>(null);
  const [done, setDone] = useState<Ticket | null>(null);
  const [started, setStarted] = useState<Started | null>(null);
  const [payPick, setPayPick] = useState<string | null>(null);
  // One request key per order attempt: a retry of the same choice re-sends it, a new choice gets a new one.
  const attempt = useRef<{ sig: string; key: string } | null>(null);
  // Once an order has a payment (or may have), its discount code is no longer released by leaving.
  const orderLocked = useRef(false);
  const name = useServiceName(customer?.checkout, notify);
  const staffFree = Boolean(customer?.checkout?.staff_free);

  // Leaving the shop with an unpaid discounted order releases its reserved code — but never
  // while its payment is in flight (a cancel must not race the wallet debit).
  const openOrder = useRef<CheckoutState | null>(null);
  const paying = useRef(false);
  useEffect(() => {
    openOrder.current = checkout;
  }, [checkout]);
  useEffect(
    () => () => {
      const order = openOrder.current;
      if (order && !paying.current && !orderLocked.current) api(`/api/mini/checkout/${order.order_id}/cancel`, { method: "POST", body: {} }).catch(() => undefined);
    },
    [],
  );

  const plan = plans.find((p) => p.id === planId) ?? null;
  const wallet = Number(customer?.wallet) || 0;
  // A discounted order belongs to the plan it was made for.
  const activeCheckout = checkout && plan && checkout.planId === plan.id ? checkout : null;

  /** Release an unpaid discounted order (best effort; stale ones are also cleaned up on the server). */
  const dropCheckout = () => {
    const current = checkout;
    setCheckout(null);
    if (!current || orderLocked.current) return;
    api(`/api/mini/checkout/${current.order_id}/cancel`, { method: "POST", body: {} }).catch(() => undefined);
  };

  const selectPlan = (id: number) => {
    if (id === planId) return;
    haptic("select");
    dropCheckout();
    setPlanId(id);
  };

  const succeed = async (res: PurchaseResult, amount: number, kind: TicketKind = WALLET_TICKET) => {
    const message = res.message || "خرید انجام شد";
    notify(message);
    setCheckout(null);
    name.clear();
    // Wallet, activity and the services list are read again before the ticket is shown.
    await refreshAfterChange();
    setDone({
      title: plan?.is_trial ? "سرویس تست فعال شد" : kind.title,
      amount,
      date: formatDate(new Date().toISOString()),
      method: kind.method,
      detail: plan?.name,
    });
  };

  const buyPlan = () =>
    run("buy", async () => {
      if (!plan || !commerce || !name.check()) return;
      const ok = await confirmAction(`خرید «${plan.name}» به مبلغ ${money(plan.price)} از کیف پول؟`);
      if (!ok) return;
      try {
        const res = await api<PurchaseResult>("/api/mini/buy", { method: "POST", body: { plan_id: plan.id, price: plan.price, ...name.field() } });
        await succeed(res, Number(plan.price) || 0);
      } catch (err) {
        notify(failureText(err, UNKNOWN_OUTCOME), "err");
        // The wallet may have been charged: show fresh state, never retry on our own.
        if (isUnknownOutcome(err)) await showFreshState({ view: "services" });
      }
    });

  const payCheckout = () =>
    run("checkout-pay", async () => {
      const current = activeCheckout;
      if (!current || !commerce || !name.check()) return;
      const ok = await confirmAction(`پرداخت ${money(current.amount)} از کیف پول با کد «${current.code}»؟`);
      if (!ok) return;
      paying.current = true;
      try {
        const res = await api<PurchaseResult>(`/api/mini/checkout/${current.order_id}/pay`, { method: "POST", body: name.field() });
        await succeed(res, current.amount);
      } catch (err) {
        // Paying the same order again is safe: the server never debits it twice.
        notify(failureText(err, PAY_UNKNOWN_OUTCOME), "err");
      } finally {
        paying.current = false;
      }
    });

  /** Shop staff with free checkout: the order is delivered at once, without paying. */
  const buyFree = () =>
    run("buy-free", async () => {
      if (!plan || !commerce || !staffFree || !name.check()) return;
      const ok = await confirmAction(`دریافت رایگان «${plan.name}» برای خودتان؟`);
      if (!ok) return;
      try {
        const res = await api<PurchaseResult>("/api/mini/buy", {
          method: "POST",
          body: { plan_id: plan.id, price: plan.price, mode: "staff_free", ...name.field() },
        });
        await succeed({ ...res, message: res.message || "سرویس تحویل شد" }, 0, FREE_TICKET);
      } catch (err) {
        notify(failureText(err, UNKNOWN_OUTCOME), "err");
        // The order may exist (delivered, or waiting under failed deliveries): show fresh state, never retry on our own.
        if (isUnknownOutcome(err)) await showFreshState({ view: "services" });
      }
    });

  /** Card, crypto or a gateway: start the order's payment once per choice, then show where to pay. */
  const payOrder = (choice: OrderChoice) =>
    run("order-pay", async () => {
      if (!plan || !commerce || !name.check()) return;
      const orderId = activeCheckout?.order_id ?? null;
      const sig = [plan.id, plan.price, choice.id, orderId ?? ""].join("|");
      // The same choice already has its payment: show it again, never ask the server twice.
      if (started?.sig === sig) {
        setStep("pay");
        return;
      }
      if (attempt.current?.sig !== sig) attempt.current = { sig, key: newRequestKey() };
      if (orderId) orderLocked.current = true;
      try {
        const res = readStart(
          await api<OrderPayStart>("/api/mini/order/pay", {
            method: "POST",
            body: {
              plan_id: plan.id,
              price: plan.price,
              method: choice.method,
              dest_id: choice.dest,
              request_key: attempt.current.key,
              order_id: orderId,
              ...name.field(),
            },
          }),
        );
        if (!res) {
          // An answer we cannot use: the order may exist, so a retry re-sends the same key.
          notify(CARD_PAY_UNKNOWN, "err");
          return;
        }
        setStarted({ sig, orderId: res.order_id, payment: res.payment, label: choice.label });
        name.pin();
        setStep("pay");
      } catch (err) {
        notify(failureText(err, CARD_PAY_UNKNOWN), "err");
        // The order may already carry the name it was sent with.
        if (isUnknownOutcome(err)) name.pin();
        // A refusal means no order was made, so the code may be released again.
        if (!isUnknownOutcome(err) && orderId) orderLocked.current = false;
      }
    });

  /** The payment was rejected or expired: the next attempt is a fresh order. */
  const restartPayment = () => {
    attempt.current = null;
    orderLocked.current = false;
    name.unpin();
    setStarted(null);
    setCheckout(null);
    setStep("invoice");
  };

  const finishPayment = () => {
    setCheckout(null);
    name.clear();
    void refreshAfterChange();
  };

  const applyDiscount = (code: string) => {
    if (!plan || !commerce) return;
    if (!code) {
      notify("کد تخفیف را بنویسید", "err");
      return;
    }
    void run("discount", async () => {
      try {
        const res = await api<{ checkout: Checkout }>("/api/mini/checkout", {
          method: "POST",
          body: { plan_id: plan.id, price: plan.price, code },
        });
        setCheckout({ ...res.checkout, planId: plan.id });
        haptic("ok");
      } catch (err) {
        notify(failureText(err, FALLBACK_ERROR), "err");
      }
    });
  };

  const cancelCheckout = () =>
    run("checkout-cancel", async () => {
      const current = activeCheckout;
      if (!current) return;
      try {
        await api(`/api/mini/checkout/${current.order_id}/cancel`, { method: "POST", body: {} });
      } catch (err) {
        if (!isUnknownOutcome(err)) notify(failureText(err, FALLBACK_ERROR), "err");
      }
      setCheckout(null);
    });

  if (done) {
    return (
      <SuccessTicket
        title={done.title}
        amount={done.amount}
        detail={done.detail}
        facts={[
          { label: "تاریخ پرداخت", value: done.date },
          { label: "روش پرداخت", value: done.method },
        ]}
        actionLabel="مشاهده سرویس‌ها"
        onAction={() => go("services")}
      />
    );
  }

  if (!plans.length) {
    return (
      <>
        <ShopBadge />
        <EmptyState icon="solar:cart-large-2-linear" title="پلنی برای خرید فعال نیست." />
      </>
    );
  }

  if (step === "pay" && started) {
    return (
      <PaymentStages
        key={started.payment.id}
        payment={started.payment}
        orderId={started.orderId}
        methodLabel={started.label}
        onBack={() => setStep("invoice")}
        onRestart={restartPayment}
        onOpenService={(serviceId) => (serviceId ? go("service", { serviceId }) : go("services"))}
        onLeave={() => go("services")}
        onDelivered={finishPayment}
      />
    );
  }

  if (step !== "pick" && plan) {
    return (
      <CheckoutStep
        plan={plan}
        checkout={activeCheckout}
        wallet={wallet}
        walletEnabled={data.wallet_pay_enabled}
        allowCode={features.gift}
        allowTopup={features.topup}
        applying={busy("discount")}
        cancelling={busy("checkout-cancel")}
        paying={busy("buy") || busy("buy-free") || busy("checkout-pay") || busy("order-pay")}
        onApplyCode={applyDiscount}
        onCancelCode={() => void cancelCheckout()}
        onPayWallet={() => void (activeCheckout ? payCheckout() : buyPlan())}
        onPayOrder={(choice) => void payOrder(choice)}
        onBack={() => setStep("pick")}
        onTopup={() => openTopup(mini)}
        picked={payPick}
        onPicked={setPayPick}
        name={{ required: name.required, value: name.value, onChange: name.setValue, locked: name.pinned, showProblem: name.tried }}
        onPayFree={staffFree ? () => void buyFree() : null}
      />
    );
  }

  return (
    <>
      <ShopBadge />
      <PlanPicker plans={plans} plan={plan} onSelect={selectPlan} onNext={() => plan && setStep("invoice")} />
    </>
  );
}

function ShopBadge() {
  return <SectionBadge icon="solar:cart-large-2-bold" title="خرید سرویس" />;
}

export function ShopScreen() {
  const { features, commerce } = useMini();
  const allowed = commerce && features.shop;
  const plans = useResource<PlansPayload>("plans", allowed);
  // Once a catalog has loaded, a refresh keeps the flow (and any open discounted order) on
  // screen while the new catalog loads, instead of unmounting it back to a skeleton.
  const [lastPlans, setLastPlans] = useState<PlansPayload | null>(null);
  if (plans.status === "ready" && plans.data !== lastPlans) setLastPlans(plans.data);
  const shown = plans.status !== "ready" && lastPlans ? ({ status: "ready", data: lastPlans } as const) : plans;

  if (allowed && shown.status === "ready") return <ShopFlow data={shown.data} />;
  return (
    <>
      <ShopBadge />
      {allowed ? (
        <Settled resource={shown} rows={4} onRetry={() => invalidateResource("plans")}>
          {(data) => <ShopFlow data={data} />}
        </Settled>
      ) : (
        <EmptyState icon="solar:cart-large-2-linear" title="خرید سرویس در این فروشگاه فعال نیست." />
      )}
    </>
  );
}
