"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";

import { SectionBadge } from "@/components/ui/SectionBadge";
import { IconTile, type TileTone } from "@/components/ui/IconTile";

import { api, isUnknownOutcome } from "../../core/api";
import { formatDate } from "../../core/format";
import { failureText, useMini } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { BankCard } from "../../ui/flow/BankCard";
import { ProcessingView } from "../../ui/flow/ProcessingView";
import { ReceiptDrop } from "../../ui/flow/ReceiptDrop";
import { StepFooter } from "../../ui/flow/StepFooter";
import { SuccessTicket } from "../../ui/flow/SuccessTicket";
import { prepareReceipt } from "../account/receipt";
import { ORDER_RECEIPT_UNKNOWN, type OrderPayment, type ReceiptReply } from "./orderPay";
import { PayDetails } from "./PayDetails";
import { usePaymentPoll, type PollState } from "./usePaymentPoll";

type Stage = "transfer" | "track";

type PaymentStagesProps = {
  payment: OrderPayment;
  orderId: number;
  /** «کارت به کارت»… for the ticket. */
  methodLabel: string;
  /** «قبلی» on the payment step (back to the invoice). */
  onBack: () => void;
  backDisabled?: boolean;
  /** The order was rejected or expired: start again with a fresh attempt. */
  onRestart: () => void;
  /** After the ticket's button: the new service when it is known. */
  onOpenService: (serviceId: number | null) => void;
  /** Leave while the payment is still in review. */
  onLeave: () => void;
  /** The order was delivered: wallet, activity and services are read again. */
  onDelivered: () => void;
};

function OutcomeNotice({
  tone,
  icon,
  title,
  message,
  children,
}: {
  tone: TileTone;
  icon: string;
  title: string;
  message?: string;
  children: ReactNode;
}) {
  return (
    <section role="status" aria-label={title} className="inset-tile flex flex-col gap-4 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={icon} tone={tone} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-base font-semibold text-foreground">{title}</h1>
          {message ? <p className="text-sm leading-6 text-foreground/80">{message}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

const shortMessage = (text: string | undefined): string | undefined => {
  const t = String(text ?? "").trim();
  return t && t.length <= 300 ? t : undefined;
};

function Tracker({
  payment,
  orderId,
  methodLabel,
  poll,
  onResend,
  onRestart,
  onOpenService,
  onLeave,
}: {
  payment: OrderPayment;
  orderId: number;
  methodLabel: string;
  poll: PollState;
  onResend: () => void;
  onRestart: () => void;
  onOpenService: (serviceId: number | null) => void;
  onLeave: () => void;
}) {
  const { phase, status } = poll;
  const message = shortMessage(status?.message);

  if (phase === "checking") return <ProcessingView />;

  if (phase === "delivered") {
    const paid = Number(status?.amount);
    const serviceId = Number(status?.service_id) > 0 ? Number(status?.service_id) : null;
    return (
      <SuccessTicket
        title="پرداخت موفقیت‌آمیز"
        amount={Number.isFinite(paid) && paid > 0 ? paid : payment.amount}
        facts={[
          { label: "تاریخ پرداخت", value: formatDate(status?.paid_at || new Date().toISOString()) },
          { label: "روش پرداخت", value: methodLabel || status?.method || "—" },
        ]}
        actionLabel={serviceId ? "مشاهده سرویس" : "مشاهده سرویس‌ها"}
        onAction={() => onOpenService(serviceId)}
      />
    );
  }

  if (phase === "waiting") {
    return (
      <OutcomeNotice tone="orange" icon="solar:gallery-bold" title="رسید هنوز ثبت نشده" message={message ?? "تصویر رسید به ما نرسیده است؛ دوباره آن را بفرستید."}>
        <ActionButton tone="ink" trailingIcon="solar:arrow-left-linear" fullWidth onPress={onResend}>
          ارسال رسید
        </ActionButton>
      </OutcomeNotice>
    );
  }

  if (phase === "rejected" || phase === "expired") {
    const rejected = phase === "rejected";
    return (
      <OutcomeNotice
        tone="red"
        icon="solar:close-circle-bold"
        title={rejected ? "پرداخت تأیید نشد" : "مهلت پرداخت تمام شد"}
        message={message ?? (rejected ? "رسید شما تأیید نشد. می‌توانید دوباره پرداخت را انجام دهید." : "این پرداخت منقضی شده است؛ پرداخت تازه‌ای ثبت کنید.")}
      >
        <ActionButton tone="ink" trailingIcon="solar:arrow-left-linear" fullWidth onPress={onRestart}>
          پرداخت دوباره
        </ActionButton>
      </OutcomeNotice>
    );
  }

  // Time ran out while the payment is still being reviewed: nothing more to do here.
  return (
    <OutcomeNotice
      tone="yellow"
      icon="solar:clock-circle-bold"
      title="در انتظار تأیید"
      message={message ?? "رسید شما ثبت شد و در انتظار تأیید است. نتیجه در ربات و بخش «سرویس‌ها» اعلام می‌شود؛ می‌توانید از اینجا بروید."}
    >
      <p className="num text-xs text-muted">
        پیگیری: سفارش <bdi>{orderId}</bdi>
      </p>
      <ActionButton tone="ink" trailingIcon="solar:arrow-left-linear" fullWidth onPress={onLeave}>
        مشاهده سرویس‌ها
      </ActionButton>
    </OutcomeNotice>
  );
}

function Checking({ onDelivered, ...tracker }: Omit<ComponentProps<typeof Tracker>, "poll"> & { onDelivered: () => void }) {
  const poll = usePaymentPoll(tracker.payment.id, tracker.orderId);
  const notified = useRef(false);
  useEffect(() => {
    if (poll.phase !== "delivered" || notified.current) return;
    notified.current = true;
    onDelivered();
  }, [poll.phase, onDelivered]);
  return <Tracker {...tracker} poll={poll} />;
}

/**
 * After an order's payment was started: where to pay + the receipt (Figma "Payment"), then the
 * checking screen (Figma "Loading") and the final ticket. Nothing here re-submits an order.
 */
export function PaymentStages({ payment, orderId, methodLabel, onBack, backDisabled, onRestart, onOpenService, onLeave, onDelivered }: PaymentStagesProps) {
  const { run, busy, notify } = useMini();
  const [stage, setStage] = useState<Stage>("transfer");
  const [file, setFile] = useState<File | null>(null);
  const key = `order-receipt:${payment.id}`;

  const submit = () =>
    run(key, async () => {
      if (!payment.needs_receipt) {
        setStage("track");
        return;
      }
      if (!file) {
        notify("تصویر رسید را انتخاب کنید", "err");
        return;
      }
      let image: Blob;
      try {
        image = await prepareReceipt(file);
      } catch (err) {
        notify(err instanceof Error ? err.message : String(err), "err");
        return;
      }
      try {
        const res = await api<ReceiptReply>(`/api/mini/order/payments/${payment.id}/receipt`, { method: "POST", raw: image });
        if (res?.message) notify(res.message);
        setStage("track");
      } catch (err) {
        notify(failureText(err, ORDER_RECEIPT_UNKNOWN), "err");
        // The photo may have arrived: only read the payment's state, never send it twice.
        if (isUnknownOutcome(err)) setStage("track");
      }
    });

  if (stage === "track") {
    return (
      <Checking
        payment={payment}
        orderId={orderId}
        methodLabel={methodLabel}
        onResend={() => setStage("transfer")}
        onRestart={onRestart}
        onOpenService={onOpenService}
        onLeave={onLeave}
        onDelivered={onDelivered}
      />
    );
  }

  return (
    <>
      <SectionBadge icon="solar:wallet-money-bold" title="پرداخت" />
      {payment.card_number ? (
        <BankCard number={payment.card_number} holder={payment.holder} bank={payment.bank} amount={payment.amount} />
      ) : (
        <PayDetails payment={payment} />
      )}
      {payment.note ? <p className="text-xs leading-5 whitespace-pre-line text-muted">{payment.note}</p> : null}
      {payment.needs_receipt ? <ReceiptDrop file={file} onFile={setFile} /> : null}
      <StepFooter
        primaryLabel={payment.needs_receipt ? "ثبت" : "بررسی پرداخت"}
        onPrimary={() => void submit()}
        primaryPending={busy(key)}
        secondaryLabel="قبلی"
        onSecondary={onBack}
        secondaryDisabled={busy(key) || backDisabled}
      />
    </>
  );
}
