"use client";

import { Button, Tooltip } from "@heroui/react";

import { Icon } from "@/icons/Icon";

import { copyText, money } from "../../core/format";
import { haptic, openExternal } from "../../core/telegram";
import { useMini } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import type { OrderPayment } from "./orderPay";

function CopyRow({ label, value }: { label: string; value: string }) {
  const { notify } = useMini();
  const copy = async () => {
    const ok = await copyText(value);
    if (ok) haptic("ok");
    notify(ok ? `${label} کپی شد` : "کپی نشد", ok ? "ok" : "err");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      <div className="inset-tile flex items-center gap-2 rounded-lg p-2 ps-3">
        <strong dir="ltr" className="min-w-0 flex-1 text-start text-sm break-all text-foreground">
          {value}
        </strong>
        <Tooltip delay={600}>
          <Button isIconOnly size="sm" variant="ghost" aria-label={`کپی ${label}`} onPress={() => void copy()}>
            <Icon name="solar:copy-linear" size={20} />
          </Button>
          <Tooltip.Content>
            <p>کپی {label}</p>
          </Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}

/** Where to pay when it is not a bank card: a wallet address to copy and/or a payment link. */
export function PayDetails({ payment }: { payment: OrderPayment }) {
  const { notify } = useMini();
  const openLink = () => {
    if (!openExternal(String(payment.link ?? ""))) notify("لینک پرداخت معتبر نیست", "err");
  };
  return (
    <section aria-label="جزئیات پرداخت" className="inset-tile flex flex-col gap-4 rounded-lg p-4">
      <p className="text-center text-sm text-foreground">
        لطفاً مبلغ{" "}
        <b className="num">
          <bdi>{money(payment.amount)}</bdi>
        </b>{" "}
        را پرداخت نمایید
      </p>
      {payment.address ? (
        <>
          {payment.network ? (
            <p className="text-sm text-foreground/80">
              شبکه: <bdi className="font-semibold">{payment.network}</bdi>
            </p>
          ) : null}
          <CopyRow label="آدرس کیف پول" value={payment.address} />
        </>
      ) : null}
      {payment.link ? (
        <ActionButton tone="accent" icon="solar:link-round-linear" fullWidth onPress={openLink}>
          ورود به درگاه پرداخت
        </ActionButton>
      ) : null}
    </section>
  );
}
