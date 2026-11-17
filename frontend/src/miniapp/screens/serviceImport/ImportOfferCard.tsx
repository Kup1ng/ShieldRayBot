"use client";

import { Button } from "@heroui/react";

import { IconTile } from "@/components/ui/IconTile";

import { api } from "../../core/api";
import { failureText, useMini } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { DISMISS_PATH, useImportOffer } from "./importKit";
import { openImportSheet } from "./ImportSheet";

const DISMISS_KEY = "service-import-dismiss";

/** Home offer for a customer with no service yet: add one bought before, or ask not to be offered again. */
export function ImportOfferCard() {
  const mini = useMini();
  const { can, commerce, customer, run, busy, notify } = mini;
  const hasServices = (customer?.home?.service_count ?? 0) > 0;
  const offer = useImportOffer(commerce && can("services") && !hasServices);
  if (!offer.show) return null;

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
    <section aria-label="اتصال اشتراک قبلی" className="flex flex-col gap-3 rounded-lg bg-accent-soft p-3">
      <div className="flex items-start gap-3">
        <IconTile icon="solar:link-round-bold" tone="blue" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">اتصال اشتراک قبلی</p>
          <p className="text-xs leading-5 text-foreground/70">اگر سرویسی بیرون از ربات گرفته‌اید، با لینک اشتراک آن را اضافه کنید.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ActionButton tone="accent" size="md" icon="solar:link-round-bold" className="flex-1" onPress={() => openImportSheet(mini, offer.hide)}>
          اتصال اشتراک
        </ActionButton>
        <Button size="sm" variant="ghost" className="!rounded-lg" isPending={busy(DISMISS_KEY)} onPress={dismiss}>
          نمایش نده
        </Button>
      </div>
    </section>
  );
}
