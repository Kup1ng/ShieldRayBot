"use client";

import { Button, toast } from "@heroui/react";
import { useRef, useState, type FormEvent } from "react";

import { Icon } from "@/icons/Icon";

import { run } from "../../core/actions";
import { FALLBACK_ERROR, PanelError, panelJson } from "../../core/api";
import { useJson, useUrlFlash } from "../../core/data";
import { fa, formatDateTime, toman } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { Ltr, StatusChip } from "../../ui/Data";
import { FormGrid, MoneyInput, SelectInput, SubmitButton } from "../../ui/Fields";
import { GlassSection, PageHeader, StatTile } from "../../ui/Page";
import { Loadable, Notice } from "../../ui/States";
import { SelectableTable, type Column } from "../catalog/Tables";
import { MyAccountTabs } from "./MyAccountTabs";
import { safeWebLink, TOPUP_STATUS_COLOR } from "./myFinanceLabels";
import type { RecentTopup, TopupInstructions, TopupMethod, TopupOptions, TopupReply, WalletData } from "./myFinanceTypes";

const DATA_PATH = "/api/panel/my-subscription/wallet";
const WALLET_PATH = "/my-subscription/wallet";
/** The server refuses a bigger photo (Telegram takes up to 10 MB). */
const RECEIPT_MAX_BYTES = 8 * 1024 * 1024;
const RECEIPT_TYPES = ["image/jpeg", "image/png"];

const RECENT_COLUMNS: Column[] = [
  { id: "id", label: "شماره", rowHeader: true },
  { id: "amount", label: "مبلغ" },
  { id: "date", label: "زمان" },
  { id: "status", label: "وضعیت" },
  { id: "actions", label: <span className="sr-only">عملیات</span> },
];

/** The range the top-up amount must fall in, said the way the server refuses it. */
export function amountError(amount: string, options: Pick<TopupOptions, "min_amount" | "max_amount">): string | null {
  const value = Number(amount);
  if (!amount || !Number.isSafeInteger(value) || value < options.min_amount || value > options.max_amount) {
    return `مبلغ شارژ باید بین ${toman(options.min_amount)} و ${toman(options.max_amount)} باشد`;
  }
  return null;
}

/** Why a chosen receipt photo cannot be sent, or null when it can. */
export function receiptError(file: Pick<File, "size" | "type">): string | null {
  if (!RECEIPT_TYPES.includes(file.type)) return "فقط تصویر JPG یا PNG رسید را بفرستید";
  if (file.size > RECEIPT_MAX_BYTES) return "حجم تصویر رسید باید کمتر از ۸ مگابایت باشد";
  return null;
}

/** Picks a photo and posts it. The list reloads after any answer; `onSent` runs only when the receipt was accepted. */
function ReceiptUpload({ paymentId, reload, onSent, variant = "outline" }: { paymentId: number; reload: () => void; onSent?: () => void; variant?: "outline" | "primary" }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const send = async (file: File | undefined) => {
    if (!file || pending) return;
    const refusal = receiptError(file);
    if (refusal) {
      toast.danger(refusal);
      return;
    }
    setPending(true);
    try {
      const form = new FormData();
      form.append("receipt", file);
      const result = await run(`${WALLET_PATH}/topup/${paymentId}/receipt`, form, { success: "رسید ثبت شد.", refresh: reload });
      if (result?.ok) onSent?.();
    } finally {
      setPending(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <>
      <input ref={input} type="file" accept={RECEIPT_TYPES.join(",")} className="sr-only" tabIndex={-1} aria-label={`تصویر رسید شارژ ${fa(paymentId)}`} onChange={(event) => void send(event.target.files?.[0])} />
      <Button size="sm" variant={variant} isPending={pending} onPress={() => input.current?.click()}>
        <Icon name="solar:upload-linear" size={16} />
        ارسال رسید
      </Button>
    </>
  );
}

function LinkButton({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-focus">
      {children}
    </a>
  );
}

/** How to pay the top-up that was just created; the answer carries it once. */
function Instructions({ topup, onClose, reload }: { topup: TopupInstructions; onClose: () => void; reload: () => void }) {
  const [checking, setChecking] = useState(false);
  const gateway = safeWebLink(topup.gateway_link);
  const checkout = safeWebLink(topup.checkout_url);
  const check = async () => {
    if (!topup.settlement_id) return;
    setChecking(true);
    try {
      await run(`${WALLET_PATH}/check`, { settlement_id: topup.settlement_id }, { refresh: reload });
    } finally {
      setChecking(false);
    }
  };
  return (
    <GlassSection
      title={
        <>
          پرداخت <Ltr>{toman(topup.amount)}</Ltr>
        </>
      }
      description={`شارژ شمارهٔ ${fa(topup.payment_id)}`}
      actions={
        <Button size="sm" variant="ghost" onPress={onClose}>
          بستن
        </Button>
      }
    >
      <div className="flex flex-col gap-3 text-sm leading-7">
        {topup.card_number ? (
          <p>
            به کارت <Ltr className="font-semibold">{topup.card_number}</Ltr>
            {topup.card_holder ? ` به نام ${topup.card_holder}` : ""} واریز کنید و تصویر رسید را بفرستید.
          </p>
        ) : null}
        {topup.crypto_address ? (
          <p>
            {topup.crypto_asset}
            {topup.crypto_network ? ` (${topup.crypto_network})` : ""} به آدرس <Ltr className="font-semibold break-all">{topup.crypto_address}</Ltr> واریز کنید و تصویر رسید را بفرستید.
          </p>
        ) : null}
        {topup.note ? <p className="text-muted">{topup.note}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          {gateway ? <LinkButton href={gateway}>{`پرداخت در ${topup.gateway_name || "درگاه"}`}</LinkButton> : null}
          {checkout ? <LinkButton href={checkout}>رفتن به درگاه پرداخت</LinkButton> : null}
          {topup.needs_receipt ? <ReceiptUpload paymentId={topup.payment_id} variant="primary" reload={reload} onSent={onClose} /> : null}
          {topup.settlement_id ? (
            <Button size="sm" variant="outline" isPending={checking} onPress={() => void check()}>
              بررسی پرداخت
            </Button>
          ) : null}
        </div>
      </div>
    </GlassSection>
  );
}

function TopupForm({ data, reload, onStarted }: { data: WalletData; reload: () => void; onStarted: (topup: TopupInstructions) => void }) {
  const { options } = data;
  const [amount, setAmount] = useState("");
  const [methodKey, setMethodKey] = useState("");
  const [destId, setDestId] = useState("");
  const [pending, setPending] = useState(false);
  const method: TopupMethod | undefined = options.methods.find((m) => m.key === methodKey) ?? options.methods[0];
  // The shop picks the destination itself unless the method offers several to choose from.
  const dest = method?.choices.find((c) => c.id === destId)?.id ?? method?.choices[0]?.id ?? "";

  if (!method) {
    return <Notice tone="warning">روش پرداختی برای شارژ از وب‌پنل فعال نیست؛ از ربات شارژ کنید.</Notice>;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const refusal = amountError(amount, options);
    if (refusal) {
      toast.danger(refusal);
      return;
    }
    setPending(true);
    try {
      // The same key goes with every resend of this form, so the top-up cannot start twice.
      const reply = await panelJson<TopupReply>(`${WALLET_PATH}/topup`, { amount, method: method.key, dest_id: dest, request_key: data.request_key });
      toast.success(reply.message || "پرداخت ایجاد شد.");
      if (reply.topup) onStarted(reply.topup);
      setAmount("");
      reload();
    } catch (err) {
      if (err instanceof PanelError && err.status === 401) return;
      toast.danger(err instanceof Error ? err.message : FALLBACK_ERROR);
      // A lost answer may still have started the payment: show what the server has.
      if (err instanceof PanelError && err.status === 0) reload();
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <FormGrid>
        <MoneyInput label="مبلغ" value={amount} onChange={setAmount} required help={`از ${toman(options.min_amount)} تا ${toman(options.max_amount)}`} />
        <SelectInput label="روش پرداخت" value={method.key} onChange={setMethodKey} options={options.methods.map((m) => ({ id: m.key, label: m.label }))} />
        {method.choices.length ? <SelectInput label="مقصد" value={dest} onChange={setDestId} options={method.choices} /> : null}
      </FormGrid>
      {options.presets.length ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="مبلغ‌های پیشنهادی">
          {options.presets.map((preset) => (
            <Button key={preset} size="sm" variant="outline" onPress={() => setAmount(String(preset))}>
              {toman(preset)}
            </Button>
          ))}
        </div>
      ) : null}
      <div>
        <SubmitButton pending={pending}>ادامهٔ پرداخت</SubmitButton>
      </div>
    </form>
  );
}

function recentCells(row: RecentTopup, reload: () => void) {
  return [
    <Ltr key="i">#{fa(row.id)}</Ltr>,
    <Ltr key="a">{toman(row.amount)}</Ltr>,
    <span key="d" className="text-muted">{formatDateTime(row.created_at)}</span>,
    <StatusChip key="s" color={row.waiting_receipt ? "warning" : (TOPUP_STATUS_COLOR[row.status] ?? "default")}>{row.status_fa}</StatusChip>,
    row.waiting_receipt ? <ReceiptUpload key="r" paymentId={row.id} reload={reload} /> : <span key="r" />,
  ];
}

function WalletBody({ data, reload }: { data: WalletData; reload: () => void }) {
  const [topup, setTopup] = useState<TopupInstructions | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile icon="solar:wallet-money-bold" tone="green" label="موجودی کیف پول" value={<Ltr>{toman(data.balance)}</Ltr>} />
        {data.credit.limit ? <StatTile icon="solar:hand-money-bold" tone="blue" label="اعتبار قابل استفاده" value={<Ltr>{toman(data.credit.available)}</Ltr>} /> : null}
      </div>
      {topup ? <Instructions topup={topup} onClose={() => setTopup(null)} reload={reload} /> : null}
      <GlassSection title="شارژ کیف پول" description="شارژ به کیف پول فروشگاه شما می‌رود و هزینهٔ تمدید و خریدها از آن کسر می‌شود.">
        <TopupForm data={data} reload={reload} onStarted={setTopup} />
      </GlassSection>
      <GlassSection title="شارژهای اخیر" description={`${fa(data.recent.length)} شارژ`}>
        <SelectableTable ariaLabel="شارژهای اخیر" columns={RECENT_COLUMNS} rows={data.recent} rowId={(row) => row.id} cells={(row) => recentCells(row, reload)} empty="هنوز شارژی ثبت نشده است" minWidth={560} />
      </GlassSection>
    </div>
  );
}

function Body() {
  useUrlFlash();
  const state = useJson<WalletData>(DATA_PATH);
  return (
    <>
      <PageHeader icon="solar:card-bold" tone="green" title="اشتراک من" description="بستهٔ فروشگاه شما، کیف پول، اعتبار و هزینه‌ها" />
      <MyAccountTabs active="wallet" />
      <Loadable state={state} rows={4}>
        {(data) => <WalletBody data={data} reload={state.reload} />}
      </Loadable>
    </>
  );
}

export function MyWalletPage() {
  return (
    <PanelShell title="اشتراک من">
      <Body />
    </PanelShell>
  );
}
