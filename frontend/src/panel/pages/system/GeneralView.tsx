"use client";

import { toast } from "@heroui/react";
import { useState } from "react";

import { useJson } from "../../core/data";
import { run, usePending } from "../../core/actions";
import { GlassSection } from "../../ui/Page";
import { FormGrid, SubmitButton, TextInput } from "../../ui/Fields";
import { Loadable, Notice } from "../../ui/States";
import { restartRequested, validPort } from "./general";
import type { GeneralPayload } from "./types";
import { useServiceRestart } from "./useServiceRestart";

const SAVE_URL = "/settings?tab=general";

function GeneralForm({ data, onSaved }: { data: GeneralPayload; onSaved: () => void }) {
  const [port, setPort] = useState(data.web_port);
  const [currency, setCurrency] = useState(data.currency);
  const [publicUrl, setPublicUrl] = useState(data.public_base_url);
  const [portError, setPortError] = useState(false);
  const { pending, track } = usePending();
  const restart = useServiceRestart(() => {
    toast.success("سرویس دوباره بالا آمد.");
    onSaved();
  });

  const submit = () =>
    track(async () => {
      if (validPort(port) === null) {
        setPortError(true);
        toast.danger("پورت نامعتبر است.");
        return;
      }
      setPortError(false);
      const boot = await restart.baseline();
      const result = await run(SAVE_URL, { WEB_PORT: port.trim(), CURRENCY: currency, PUBLIC_BASE_URL: publicUrl }, { success: "تنظیمات عمومی ذخیره شد." });
      if (result?.ok && restartRequested(result.message)) restart.begin(boot);
      else onSaved();
    });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <FormGrid>
        <TextInput label="پورت وب‌پنل" value={port} onChange={setPort} ltr required type="number" min={1} max={65535} help={portError ? "پورت باید عددی بین ۱ تا ۶۵۵۳۵ باشد." : undefined} disabled={restart.waiting} />
        <TextInput label="واحد پول" value={currency} onChange={setCurrency} required disabled={restart.waiting} />
        <TextInput
          className="sm:col-span-2"
          label="آدرس عمومی (اختیاری)"
          value={publicUrl}
          onChange={setPublicUrl}
          ltr
          placeholder="https://bot.example.com"
          help="برای مینی‌اپ، لینک‌های عمومی و پیش‌فرض Webhook — با HTTPS فعال، دکمه Open تلگرام خودکار ست می‌شود"
          disabled={restart.waiting}
        />
      </FormGrid>
      {restart.waiting ? (
        <Notice tone="warning" title="در حال راه‌اندازی مجدد">
          {restart.note} اگر پورت را تغییر داده‌اید، پنل پس از راه‌اندازی روی پورت جدید باز می‌شود.
        </Notice>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton pending={pending} isDisabled={restart.waiting}>
          ذخیره تنظیمات عمومی
        </SubmitButton>
      </div>
    </form>
  );
}

/** «عمومی»: web port, currency and the public address (changes restart the service). */
export function GeneralView() {
  const state = useJson<GeneralPayload>("/api/panel/system/general");
  return (
    <GlassSection title="وب و عمومی" description="پورت پنل، واحد پول، و آدرس عمومی برای مینی‌اپ و پیش‌فرض Webhook.">
      <Loadable state={state} rows={3}>
        {(data) => <GeneralForm key={`${data.web_port}|${data.currency}|${data.public_base_url}`} data={data} onSaved={state.reload} />}
      </Loadable>
    </GlassSection>
  );
}
