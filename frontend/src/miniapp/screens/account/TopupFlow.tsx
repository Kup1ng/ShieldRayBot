"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { useRef, useState } from "react";

import { IconTile } from "@/components/ui/IconTile";
import { SectionBadge } from "@/components/ui/SectionBadge";
import { Icon } from "@/icons/Icon";

import { FALLBACK_ERROR, api, isUnknownOutcome } from "../../core/api";
import { copyText, formatDate, money, num, parseAmount } from "../../core/format";
import { openExternal } from "../../core/telegram";
import { invalidateResource, useResource } from "../../state/resources";
import { failureText, useMini } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { BankCard } from "../../ui/flow/BankCard";
import { InvoiceCard } from "../../ui/flow/InvoiceCard";
import { PayMethods, type PayMethodOption } from "../../ui/flow/PayMethods";
import { ProcessingView } from "../../ui/flow/ProcessingView";
import { ReceiptDrop } from "../../ui/flow/ReceiptDrop";
import { StepFooter } from "../../ui/flow/StepFooter";
import { SuccessTicket } from "../../ui/flow/SuccessTicket";
import { EmptyState, ErrorState, LoadingRows } from "../../ui/ScreenState";
import { RECEIPT_UNKNOWN_OUTCOME, prepareReceipt } from "./receipt";
import { topupAmount } from "./topup";
import type { TopupMethod, TopupOptions, TopupStart } from "./types";

const METHOD_ICON: Record<string, string> = {
  card: "solar:card-bold",
  gateway: "solar:global-bold",
  psp: "solar:card-2-bold",
  crypto: "solar:wallet-bold",
};

type Step =
  | { kind: "amount" }
  | { kind: "pay"; topup: TopupStart }
  | { kind: "processing" }
  | { kind: "done"; topup: TopupStart; approved: boolean; message: string }
  | { kind: "unknown" };

function methodLabel(options: TopupOptions, key: string): string {
  return options.methods.find((m) => m.key === key)?.label ?? key;
}

/** Figma "Add balance": the amount pill with its presets, the invoice and the payment methods. */
function AmountStep({
  options,
  onStarted,
  startedFor,
}: {
  options: TopupOptions;
  onStarted: (topup: TopupStart, key: string) => void;
  startedFor: (key: string) => TopupStart | null;
}) {
  const { run, busy, notify } = useMini();
  const methods = options.methods ?? [];
  const presets = options.presets ?? [];
  const [text, setText] = useState("");
  const [methodKey, setMethodKey] = useState<string>(methods[0]?.key ?? "");
  const [dests, setDests] = useState<Record<string, string>>(() =>
    Object.fromEntries(methods.filter((m) => m.choices?.length).map((m) => [m.key, m.choices[0].id])),
  );

  if (!methods.length) {
    return (
      <EmptyState
        icon="solar:wallet-money-bold"
        title={options.bot_only ? "افزایش موجودی فعلاً فقط از داخل ربات ممکن است." : "روش افزایش موجودی فعال نیست."}
      />
    );
  }

  const method: TopupMethod = methods.find((m) => m.key === methodKey) ?? methods[0];
  const dest = method.choices?.length ? dests[method.key] : undefined;
  const parsed = parseAmount(text);
  const valid = topupAmount("custom", text, options);

  const methodOptions: PayMethodOption[] = methods.map((m) => ({
    id: m.key,
    label: m.label,
    icon: METHOD_ICON[m.key] ?? "solar:card-bold",
    hint: m.needs_receipt ? "پس از واریز، تصویر رسید را بفرستید" : "پرداخت آنلاین و تأیید خودکار",
  }));

  const pay = () =>
    run("topup-start", async () => {
      if (!valid) {
        notify(`مبلغ را بین ${money(options.min_amount)} و ${money(options.max_amount)} وارد کنید`, "err");
        return;
      }
      const key = `${valid}|${method.key}|${dest ?? ""}`;
      // Back from the payment step with the same choices: the payment already made is still the one to pay.
      const again = startedFor(key);
      if (again) {
        onStarted(again, key);
        return;
      }
      try {
        const data = await api<{ topup: TopupStart }>("/api/mini/topup", {
          method: "POST",
          body: { amount: valid, method: method.key, ...(dest ? { dest_id: String(dest) } : {}) },
        });
        onStarted(data.topup, key);
        invalidateResource("topup");
      } catch (err) {
        notify(failureText(err, FALLBACK_ERROR), "err");
      }
    });

  return (
    <form
      className="flex flex-1 flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void pay();
      }}
    >
      <div className="flex flex-col gap-3">
        <TextField value={text} onChange={setText} maxLength={16} fullWidth variant="secondary">
          <Label className="sr-only">مبلغ</Label>
          <div className="relative">
            <Input dir="ltr" inputMode="numeric" autoComplete="off" placeholder="مبلغ" className="num !h-12 !rounded-lg !pr-14 !pl-4 text-end" />
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--tile-gray)] text-white">
                <Icon name="solar:dollar-bold" size={20} />
              </span>
            </span>
          </div>
        </TextField>
        {presets.length ? (
          <div role="group" aria-label="مبلغ‌های پیشنهادی" className="flex flex-wrap gap-2">
            {presets.map((n) => (
              <Button
                key={n}
                size="sm"
                variant={parsed === n ? "primary" : "secondary"}
                aria-pressed={parsed === n}
                className="!rounded-lg"
                onPress={() => setText(String(n))}
              >
                <span className="num">
                  <bdi>{money(n)}</bdi>
                </span>
              </Button>
            ))}
          </div>
        ) : null}
        <p className="text-xs text-muted">
          از <bdi className="num">{money(options.min_amount)}</bdi> تا <bdi className="num">{money(options.max_amount)}</bdi>
        </p>
      </div>

      <InvoiceCard subtitle="افزایش موجودی" amount={valid ?? 0} />

      <PayMethods options={methodOptions} value={method.key} onChange={setMethodKey} />
      {method.choices && method.choices.length > 1 ? (
        <PayMethods
          title="مقصد پرداخت"
          options={method.choices.map((c) => ({ id: c.id, label: c.label, icon: "solar:card-2-bold" }))}
          value={dest ?? null}
          onChange={(id) => setDests((prev) => ({ ...prev, [method.key]: id }))}
        />
      ) : null}
      {options.bot_only ? <p className="text-xs text-muted">روش «بزن به کارت» فقط از داخل ربات در دسترس است.</p> : null}

      <div className="mt-auto">
        <StepFooter primaryLabel="پرداخت" onPrimary={() => void pay()} primaryPending={busy("topup-start")} />
      </div>
    </form>
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const { notify } = useMini();
  const copy = async () => {
    const ok = await copyText(value);
    notify(ok ? "کپی شد" : "کپی انجام نشد", ok ? "ok" : "err");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex items-center gap-2 rounded-lg bg-surface/70 p-2 ps-3">
        <strong dir="ltr" className="min-w-0 flex-1 text-start text-sm break-all text-foreground">
          {value}
        </strong>
        <Button isIconOnly size="sm" variant="ghost" aria-label={`کپی ${label}`} onPress={() => void copy()}>
          <Icon name="solar:copy-linear" size={20} />
        </Button>
      </div>
    </div>
  );
}

/** Figma "Payment": where and how to pay one started top-up, then the receipt. */
function PayStep({
  topup,
  label,
  file,
  onFile,
  onBack,
  onStep,
}: {
  topup: TopupStart;
  label: string;
  file: File | null;
  onFile: (file: File | null) => void;
  onBack: () => void;
  onStep: (step: Step) => void;
}) {
  const { run, busy, notify, refreshAfterChange, go, homeView } = useMini();
  const gatewayName = topup.gateway_name || "درگاه";
  const receiptKey = `receipt:${topup.payment_id}`;

  const openLink = () => {
    const url = topup.method === "psp" ? topup.checkout_url : topup.gateway_link;
    if (!openExternal(String(url || ""))) notify("لینک پرداخت معتبر نیست", "err");
  };

  const check = (settlementId: number) =>
    run("topup-check", async () => {
      try {
        const res = await api<{ outcome: string; message: string }>("/api/mini/topup/check", {
          method: "POST",
          body: { settlement_id: settlementId },
        });
        notify(res.message);
        if (res.outcome === "settled" || res.outcome === "closed") {
          invalidateResource("topup");
          await refreshAfterChange();
          if (res.outcome === "settled") onStep({ kind: "done", topup, approved: true, message: res.message });
          else go(homeView);
        }
      } catch (err) {
        notify(failureText(err, FALLBACK_ERROR), "err");
      }
    });

  const submitReceipt = () => {
    if (!file) {
      notify("تصویر رسید را انتخاب کنید", "err");
      return;
    }
    void run(receiptKey, async () => {
      let image: Blob;
      try {
        image = await prepareReceipt(file);
      } catch (err) {
        notify(err instanceof Error ? err.message : String(err), "err");
        return;
      }
      onStep({ kind: "processing" });
      try {
        const res = await api<{ status?: string; message?: string }>(`/api/mini/topup/${topup.payment_id}/receipt`, { method: "POST", raw: image });
        const approved = res.status === "approved";
        invalidateResource("topup");
        if (approved) await refreshAfterChange();
        onStep({ kind: "done", topup, approved, message: res.message || "رسید ثبت شد" });
      } catch (err) {
        notify(failureText(err, RECEIPT_UNKNOWN_OUTCOME), "err");
        if (isUnknownOutcome(err)) {
          // The photo may have arrived: never offer to send it again, show fresh state instead.
          invalidateResource("topup");
          await refreshAfterChange();
          onStep({ kind: "unknown" });
        } else {
          onStep({ kind: "pay", topup });
        }
      }
    });
  };

  let primary: { label: string; onPress: () => void; pending?: boolean; icon?: string };
  if (topup.needs_receipt) primary = { label: "ثبت", onPress: submitReceipt, pending: busy(receiptKey) };
  else if (topup.method === "psp" && topup.settlement_id) {
    primary = { label: "بررسی پرداخت", onPress: () => void check(Number(topup.settlement_id) || 0), pending: busy("topup-check"), icon: "solar:refresh-linear" };
  } else primary = { label: "داشبورد", onPress: () => go(homeView) };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <SectionBadge icon="solar:card-bold" title="پرداخت" />
        <span className="truncate text-xs text-muted">{label}</span>
      </div>

      {topup.method === "card" ? (
        <BankCard number={topup.card_number || ""} holder={topup.card_holder} amount={topup.amount} />
      ) : (
        <div className="inset-tile flex items-center justify-between rounded-lg p-4 text-sm font-semibold text-foreground">
          <span>مبلغ</span>
          <span className="num">
            <bdi>{money(topup.amount)}</bdi>
          </span>
        </div>
      )}

      {topup.method === "gateway" && topup.gateway_link ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground/80">پرداخت از طریق {gatewayName}</p>
          <ActionButton tone="accent" icon="solar:link-round-linear" fullWidth onPress={openLink}>
            ورود به {gatewayName}
          </ActionButton>
        </div>
      ) : null}

      {topup.method === "crypto" ? (
        <div className="inset-tile flex flex-col gap-3 rounded-lg p-4">
          <p className="text-sm text-foreground/80">
            <bdi>{topup.crypto_asset || ""}</bdi>
            {topup.crypto_network ? (
              <>
                ، شبکهٔ <bdi>{topup.crypto_network}</bdi>
              </>
            ) : null}
          </p>
          <CopyLine label="آدرس کیف پول" value={topup.crypto_address || ""} />
        </div>
      ) : null}

      {topup.method === "psp" ? (
        <div className="flex flex-col gap-3">
          {topup.checkout_url ? (
            <ActionButton tone="accent" icon="solar:link-round-linear" fullWidth onPress={openLink}>
              ورود به درگاه پرداخت
            </ActionButton>
          ) : (
            <ErrorState message="لینک درگاه آماده نشد؛ دوباره تلاش کنید." />
          )}
          <p className="text-xs leading-5 text-muted">پس از پرداخت، کیف پول خودکار شارژ می‌شود؛ اگر برنگشتید «بررسی پرداخت» را بزنید.</p>
        </div>
      ) : null}

      {topup.note ? <p className="text-xs leading-5 whitespace-pre-line text-muted">{topup.note}</p> : null}
      <p className="text-xs text-muted">
        شمارهٔ پرداخت: <span className="num">{num(topup.payment_id)}</span>
      </p>

      {topup.needs_receipt ? <ReceiptDrop file={file} onFile={onFile} /> : null}

      <div className="mt-auto">
        <StepFooter
          primaryLabel={primary.label}
          onPrimary={primary.onPress}
          primaryPending={primary.pending}
          primaryIcon={primary.icon}
          secondaryLabel="قبلی"
          onSecondary={onBack}
        />
      </div>
    </div>
  );
}

/** The receipt may be in but the reply was lost: say so and never offer to send it again. */
function UnknownOutcome() {
  const { go, homeView } = useMini();
  return (
    <div className="flex flex-1 flex-col gap-6">
      <SectionBadge icon="solar:card-bold" title="پرداخت" />
      <div role="alert" className="inset-tile flex flex-col items-center gap-4 rounded-lg p-6 text-center">
        <IconTile icon="solar:info-circle-bold" tone="yellow" size="lg" />
        <p className="text-sm leading-6 text-foreground">{RECEIPT_UNKNOWN_OUTCOME}</p>
      </div>
      <div className="mt-auto flex gap-3">
        <ActionButton tone="neutral" className="min-w-0 flex-1" onPress={() => go("account")}>
          شارژهای اخیر
        </ActionButton>
        <ActionButton tone="ink" trailingIcon="solar:arrow-left-linear" className="min-w-0 flex-1" onPress={() => go(homeView)}>
          داشبورد
        </ActionButton>
      </div>
    </div>
  );
}

/**
 * The full-page top-up flow (Figma Add balance, Payment, Loading, Add balance receipt),
 * opened by `openTopup`. Fresh methods and limits are read every time it starts.
 */
export function TopupFlow() {
  const { go, homeView } = useMini();
  const options = useResource<TopupOptions>("topup");
  const [step, setStep] = useState<Step>({ kind: "amount" });
  const [file, setFile] = useState<File | null>(null);
  const started = useRef<{ key: string; topup: TopupStart } | null>(null);
  // A top-up in progress changes the list the server sends (recent top-ups): keep the first answer on screen.
  const [known, setKnown] = useState<TopupOptions | null>(null);
  if (options.status === "ready" && known !== options.data) setKnown(options.data);
  const data = known;

  if (step.kind === "processing") return <ProcessingView />;
  if (step.kind === "unknown") return <UnknownOutcome />;
  if (!data) {
    if (options.status === "error") {
      return <ErrorState message={options.error || "دریافت روش‌های افزایش موجودی ناموفق بود"} onRetry={() => invalidateResource("topup")} />;
    }
    return <LoadingRows rows={3} />;
  }
  if (step.kind === "done") {
    return (
      <SuccessTicket
        title={step.approved ? "پرداخت موفقیت‌آمیز" : "رسید شما ثبت شد"}
        amount={step.topup.amount}
        detail={step.approved ? undefined : step.message}
        facts={[
          { label: "تاریخ پرداخت", value: formatDate(new Date().toISOString()) },
          { label: "روش پرداخت", value: methodLabel(data, step.topup.method) },
        ]}
        actionLabel="داشبورد"
        onAction={() => go(homeView)}
      />
    );
  }
  return (
    <>
      {/* The amount step stays mounted behind the payment step so «قبلی» finds what was typed. */}
      <div hidden={step.kind !== "amount"} className="flex flex-1 flex-col gap-6">
        <SectionBadge icon="solar:wallet-bold" title="افزایش موجودی" />
        <AmountStep
          options={data}
          startedFor={(key) => (started.current?.key === key ? started.current.topup : null)}
          onStarted={(topup, key) => {
            started.current = { key, topup };
            setStep({ kind: "pay", topup });
          }}
        />
      </div>
      {step.kind === "pay" ? (
        <PayStep
          topup={step.topup}
          label={methodLabel(data, step.topup.method)}
          file={file}
          onFile={setFile}
          onBack={() => setStep({ kind: "amount" })}
          onStep={setStep}
        />
      ) : null}
    </>
  );
}
