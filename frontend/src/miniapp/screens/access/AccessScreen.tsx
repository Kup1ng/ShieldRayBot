"use client";

import { Checkbox, Input, Label, TextField } from "@heroui/react";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/shell/BrandMark";
import { CrystalBackdrop } from "@/components/shell/CrystalBackdrop";
import { GlassBar } from "@/components/shell/Glass";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { Icon } from "@/icons/Icon";

import { FALLBACK_ERROR, api, isUnknownOutcome } from "../../core/api";
import { paintTelegramChrome } from "../../core/telegram";
import { MINI_MAX_W } from "../../layout/MiniShell";
import { failureText, notify } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { ErrorState, LoadingRows } from "../../ui/ScreenState";

/** GET /api/mini/access: reachable while the terms gate blocks /api/mini/me. */
export type AccessInfo = {
  required: boolean;
  terms: { title: string; text: string } | null;
  referral: { asked: boolean; required: boolean };
};

const REFERRAL_MAX = 64;
const ACCESS_UNKNOWN = "نتیجهٔ ثبت مشخص نشد؛ وضعیت دسترسی دوباره بررسی می‌شود.";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; info: AccessInfo };

function AccessForm({ info, onDone }: { info: AccessInfo; onDone: () => void }) {
  const [accepted, setAccepted] = useState(false);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const termsTitle = info.terms?.title || "قوانین و شرایط استفاده";

  const submit = async () => {
    if (pending) return;
    const referral = code.trim();
    if (info.terms && !accepted) {
      notify("برای ادامه باید قوانین و شرایط استفاده را بپذیرید", "err");
      return;
    }
    if (info.referral.asked && info.referral.required && !referral) {
      notify("کد دعوت را وارد کنید", "err");
      return;
    }
    setPending(true);
    try {
      await api<{ ok: boolean }>("/api/mini/access", {
        method: "POST",
        body: { accept: true, referral_code: info.referral.asked && referral ? referral : null },
      });
      onDone();
    } catch (err) {
      notify(failureText(err, ACCESS_UNKNOWN), "err");
      // A lost reply may still have recorded the acceptance: read the state again.
      if (isUnknownOutcome(err)) onDone();
      else setPending(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {info.terms ? (
        <section
          aria-label={termsTitle}
          tabIndex={0}
          className="inset-tile max-h-52 overflow-y-auto rounded-lg p-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <h2 className="mb-1 text-sm font-medium text-muted">{termsTitle}</h2>
          <p className="text-sm leading-7 whitespace-pre-line text-foreground">{info.terms.text}</p>
        </section>
      ) : null}

      {info.terms ? (
        <Checkbox isSelected={accepted} onChange={setAccepted} name="accept">
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <span className="text-sm text-muted">با قوانین و شرایط استفاده موافقم</span>
          </Checkbox.Content>
        </Checkbox>
      ) : null}

      {info.referral.asked ? (
        <TextField value={code} onChange={setCode} maxLength={REFERRAL_MAX} isRequired={info.referral.required} validationBehavior="aria" fullWidth variant="secondary">
          <Label className="sr-only">کد دعوت</Label>
          <div className="relative">
            <Input
              dir="ltr"
              placeholder="کد دعوت"
              autoComplete="off"
              spellCheck={false}
              className="ltr !h-12 !rounded-lg !ps-4 !pe-12 text-start placeholder:text-start"
            />
            <span aria-hidden className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-foreground/70">
              <Icon name="solar:ticket-linear" size={24} />
            </span>
          </div>
        </TextField>
      ) : null}

      <ActionButton type="submit" tone="ink" trailingIcon="solar:arrow-left-linear" fullWidth isPending={pending}>
        ثبت
      </ActionButton>
    </form>
  );
}

/**
 * Figma "Access check": shown at launch when the server holds the person at the terms gate.
 * It draws its own frame (there is no signed-in app yet) and calls `onDone` once the
 * acceptance is recorded, so the app can read /me again.
 */
export function AccessScreen({ onDone }: { onDone: () => void }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    api<AccessInfo>("/api/mini/access").then(
      (info) => live && setLoad({ status: "ready", info }),
      (err: unknown) => live && setLoad({ status: "error", message: err instanceof Error && err.message ? err.message : FALLBACK_ERROR }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = () => {
    setLoad({ status: "loading" });
    setAttempt((n) => n + 1);
  };

  return (
    <>
      <CrystalBackdrop />
      <div className={`mx-auto flex min-h-dvh w-full ${MINI_MAX_W} flex-col gap-6 px-4 pt-[calc(var(--mini-safe-top)+24px)] pb-[calc(var(--mini-safe-bottom)+24px)]`}>
        <GlassBar start={<BrandMark size={30} />} end={<ThemeToggle onChange={paintTelegramChrome} />} />
        <main className="glass my-auto flex flex-col gap-4 rounded-xl p-6" aria-live="polite">
          <h1 className="text-center text-2xl font-medium text-foreground">تایید دسترسی</h1>
          {load.status === "loading" ? <LoadingRows rows={3} /> : null}
          {load.status === "error" ? <ErrorState message={load.message} onRetry={retry} /> : null}
          {load.status === "ready" && load.info.required ? <AccessForm info={load.info} onDone={onDone} /> : null}
          {load.status === "ready" && !load.info.required ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <p className="text-sm text-muted">تأیید دسترسی انجام شده است.</p>
              <ActionButton tone="ink" trailingIcon="solar:arrow-left-linear" fullWidth onPress={onDone}>
                ادامه
              </ActionButton>
            </div>
          ) : null}
        </main>
      </div>
    </>
  );
}
