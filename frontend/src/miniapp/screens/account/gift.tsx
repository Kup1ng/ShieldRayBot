"use client";

import { Input, Label, TextField } from "@heroui/react";
import { useState } from "react";

import { api, isUnknownOutcome } from "../../core/api";
import { money } from "../../core/format";
import { failureText, useMini, type MiniContextValue } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";

const CODE_MAX = 64;
const GIFT_UNKNOWN_OUTCOME = "نتیجه مشخص نشد؛ موجودی دوباره خوانده شد.";

function GiftForm({ close }: { close: () => void }) {
  const { run, busy, notify, refreshAfterChange } = useMini();
  const [code, setCode] = useState("");

  const redeemGift = () => {
    const value = code.trim();
    if (!value) {
      notify("کد هدیه را بنویسید", "err");
      return;
    }
    void run("gift", async () => {
      try {
        const res = await api<{ amount: number; wallet: number; message?: string }>("/api/mini/wallet/redeem", {
          method: "POST",
          body: { code: value },
        });
        notify(`${res.message || "کیف پول شارژ شد"}: ${money(res.amount)}`);
        close();
      } catch (err) {
        notify(failureText(err, GIFT_UNKNOWN_OUTCOME), "err");
        if (!isUnknownOutcome(err)) return;
      }
      await refreshAfterChange();
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        redeemGift();
      }}
    >
      <TextField value={code} onChange={setCode} maxLength={CODE_MAX} autoFocus>
        <Label>کد هدیه</Label>
        <Input dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} className="ltr" />
      </TextField>
      <ActionButton type="submit" tone="ink" icon="solar:ticket-sale-bold" fullWidth isPending={busy("gift")}>
        ثبت کد و شارژ کیف پول
      </ActionButton>
    </form>
  );
}

/** Opens the gift-code sheet; a valid code charges the wallet. */
export function openGiftCode(mini: MiniContextValue): void {
  if (!mini.commerce) return;
  mini.openSheet({ title: "کد هدیه", render: (close) => <GiftForm close={close} /> });
}
