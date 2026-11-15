"use client";

import { Button, Tooltip } from "@heroui/react";

import { Icon } from "@/icons/Icon";

import { copyText, money } from "../../core/format";
import { useMini } from "../../state/store";

const CARD_GROUP = 4;

/** «4556 - 5642 - 0695 - 5168» for a card number; anything else is shown as given. */
export function cardGroups(number: string): string {
  const digits = number.replace(/[\s-]+/g, "");
  if (!/^\d{12,19}$/.test(digits)) return number;
  const parts: string[] = [];
  for (let i = 0; i < digits.length; i += CARD_GROUP) parts.push(digits.slice(i, i + CARD_GROUP));
  return parts.join(" - ");
}

type BankCardProps = {
  number: string;
  holder?: string | null;
  bank?: string | null;
  /** «لطفاً مبلغ … را واریز نمایید» under the card. */
  amount: number;
};

/** Figma "Payment": the purple bank card (bank, contactless mark, number with copy, holder). */
export function BankCard({ number, holder, bank, amount }: BankCardProps) {
  const { notify } = useMini();
  const digits = number.replace(/[\s-]+/g, "");
  const copy = async () => {
    const ok = await copyText(digits);
    notify(ok ? "شمارهٔ کارت کپی شد" : "کپی انجام نشد", ok ? "ok" : "err");
  };
  return (
    <section aria-label="کارت مقصد" className="inset-tile flex flex-col gap-3 rounded-lg p-4">
      <div className="relative mx-auto flex aspect-[1.79] w-full max-w-[300px] flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br from-[oklch(62%_0.22_305)] via-[oklch(50%_0.24_300)] to-[oklch(38%_0.2_290)] p-4 text-white shadow-[0_18px_36px_-12px_rgb(120_40_200/0.55)]">
        <span aria-hidden className="absolute -end-12 -top-20 size-56 rounded-full bg-white/8" />
        <div className="relative flex items-center justify-between">
          <span className="text-sm font-bold text-white">{bank || "کارت به کارت"}</span>
          <Icon name="solar:wi-fi-router-minimalistic-linear" size={22} className="-rotate-90 text-white/80" />
        </div>
        <div dir="ltr" className="relative flex items-center justify-center gap-2">
          <span className="num text-[15px] font-semibold tracking-wide">{cardGroups(number)}</span>
          <Tooltip delay={600}>
            <Button isIconOnly size="sm" variant="ghost" aria-label="کپی شمارهٔ کارت" className="!size-7 !min-w-7 text-white hover:!bg-white/15" onPress={() => void copy()}>
              <Icon name="solar:copy-bold" size={16} />
            </Button>
            <Tooltip.Content>
              <p>کپی شمارهٔ کارت</p>
            </Tooltip.Content>
          </Tooltip>
        </div>
        <span className="relative truncate text-end text-sm font-medium">{holder || ""}</span>
      </div>
      <p className="text-center text-sm text-foreground">
        لطفاً مبلغ{" "}
        <b className="num">
          <bdi>{money(amount)}</bdi>
        </b>{" "}
        را واریز نمایید
      </p>
    </section>
  );
}
