"use client";

import { Button } from "@heroui/react";

import { IconTile } from "@/components/ui/IconTile";

import { api } from "../../core/api";
import { failureText, useMini } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { TRIAL_STEP } from "../shop/trialStep";
import { DISMISS_PATH, useImportOffer } from "./importKit";
import { openImportSheet } from "./ImportSheet";

const DISMISS_KEY = "service-import-dismiss";

type Copy = { title: string; note: string; icon: string };

/** The same words the bot's home offer uses for each combination. */
function copyFor(withImport: boolean, withTrial: boolean): Copy {
  if (withImport && withTrial) return { title: "شروع سریع", note: "سرویس قبلی خود را اضافه کنید یا یک تست رایگان بگیرید.", icon: "solar:link-round-bold" };
  if (withTrial) return { title: "تست رایگان", note: "برای شروع می‌توانید یک تست رایگان بگیرید.", icon: "solar:gift-bold" };
  return { title: "اتصال اشتراک قبلی", note: "اگر سرویسی بیرون از ربات گرفته‌اید، با لینک اشتراک آن را اضافه کنید.", icon: "solar:link-round-bold" };
}

/**
 * Home offer for a customer with no service yet: add one bought before, take the shop's free trial
 * (through the shop's own purchase flow), or ask not to be offered again.
 */
export function ImportOfferCard() {
  const mini = useMini();
  const { can, commerce, customer, run, busy, notify, go } = mini;
  const hasServices = (customer?.home?.service_count ?? 0) > 0;
  const offer = useImportOffer(commerce && !hasServices && (can("services") || can("shop")));
  // Each offer shows only where its screen is open: a shop may have opened one and not the other.
  const withImport = offer.importEnabled && can("services");
  const withTrial = offer.trialAvailable && can("shop");
  if (!withImport && !withTrial) return null;
  const copy = copyFor(withImport, withTrial);

  const dismiss = () =>
    void run(DISMISS_KEY, async () => {
      try {
        await api(DISMISS_PATH, { method: "POST", body: {} });
      } catch (err) {
        notify(failureText(err, "انجام نشد؛ دوباره تلاش کنید."), "err");
        return;
      }
      offer.hide();
      notify("این پیشنهاد دیگر نمایش داده نمی‌شود");
    });

  return (
    <section aria-label={copy.title} className="flex flex-col gap-3 rounded-lg bg-accent-soft p-3">
      <div className="flex items-start gap-3">
        <IconTile icon={copy.icon} tone="blue" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{copy.title}</p>
          <p className="text-xs leading-5 text-foreground/70">{copy.note}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {withImport ? (
          <ActionButton tone="accent" size="md" icon="solar:link-round-bold" className="flex-1" onPress={() => openImportSheet(mini, offer.hide)}>
            اتصال اشتراک
          </ActionButton>
        ) : null}
        {withTrial ? (
          <ActionButton tone={withImport ? "neutral" : "accent"} size="md" icon="solar:gift-bold" className="flex-1" onPress={() => go("shop", { then: TRIAL_STEP })}>
            دریافت تست
          </ActionButton>
        ) : null}
        <Button size="sm" variant="ghost" className="!rounded-lg" isPending={busy(DISMISS_KEY)} onPress={dismiss}>
          نمایش نده
        </Button>
      </div>
    </section>
  );
}
