"use client";

import { Button, Chip, Input, Label, TextField } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/icons/Icon";

import { ApiError, FALLBACK_ERROR, api, isGateError, isUnknownOutcome } from "../../core/api";
import { openTelegramLink } from "../../core/telegram";
import { ActionButton } from "../../ui/ActionButton";
import { ErrorState, LoadingRows } from "../../ui/ScreenState";
import { GateFrame } from "./GateFrame";
import {
  JOIN_CHECK_PATH,
  ONBOARDING_PATH,
  REFERRAL_MAX,
  REFERRAL_PATH,
  TERMS_PATH,
  isOnboardingStep,
  refusalKind,
  type Channel,
  type ChannelStatus,
  type OnboardingStep,
  type Refusal,
} from "./onboardingKit";

const EMPTY_CODE = "کد معرف را وارد کنید.";
const BAD_LINK_CODE = "کد معرفی که همراه لینک آمده بود معتبر نیست؛ کد معتبر را وارد کنید.";
const STILL_MISSING = "هنوز عضویت شما تأیید نشد؛ پس از عضو شدن دوباره «عضو شدم» را بزنید.";
const BAD_REPLY = "پاسخ سرور قابل خواندن نبود؛ دوباره تلاش کنید.";

const TITLES: Record<OnboardingStep["step"], string> = {
  referral: "ثبت‌نام با کد معرف",
  force_join: "عضویت در کانال‌ها",
  terms: "قوانین",
  ready: "تایید دسترسی",
};

const CHANNEL_CHIPS: Record<ChannelStatus, { label: string; color: "success" | "warning" | "danger" }> = {
  joined: { label: "عضو هستید", color: "success" },
  missing: { label: "عضو نیستید", color: "warning" },
  unverified: { label: "قابل بررسی نیست", color: "danger" },
};

type Pending = Exclude<OnboardingStep, { step: "ready" }>;

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "step"; step: Pending; notice: string };

/** Send one step's action; `onStep` may turn the next step into a note shown on it. */
type Act = (path: string, body: unknown, onStep?: (next: OnboardingStep) => string | undefined) => void;

type StepProps<S extends Pending["step"]> = { step: Extract<Pending, { step: S }>; notice: string; pending: boolean; act: Act };

function Notice({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="text-sm leading-6 text-danger">
      {text}
    </p>
  ) : null;
}

function ReferralStep({ step, notice, pending, act }: StepProps<"referral">) {
  const [code, setCode] = useState("");
  const [empty, setEmpty] = useState(false);
  const submit = () => {
    const value = code.trim();
    setEmpty(!value);
    if (value) act(REFERRAL_PATH, { code: value });
  };
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="text-sm leading-7 whitespace-pre-line text-foreground">{step.text}</p>
      <TextField value={code} onChange={setCode} maxLength={REFERRAL_MAX} isInvalid={empty} fullWidth variant="secondary">
        <Label className="sr-only">کد معرف</Label>
        <div className="relative">
          <Input
            dir="ltr"
            placeholder="کد معرف"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="ltr !h-12 !rounded-lg !ps-4 !pe-12 text-start placeholder:text-start"
          />
          <span aria-hidden className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-foreground/70">
            <Icon name="solar:ticket-linear" size={24} />
          </span>
        </div>
      </TextField>
      <Notice text={empty ? EMPTY_CODE : notice || (step.invalid ? BAD_LINK_CODE : "")} />
      <ActionButton type="submit" tone="ink" trailingIcon="solar:arrow-left-linear" fullWidth isPending={pending}>
        ثبت‌نام
      </ActionButton>
    </form>
  );
}

function ChannelRow({ channel }: { channel: Channel }) {
  const chip = CHANNEL_CHIPS[channel.status] ?? CHANNEL_CHIPS.missing;
  return (
    <li className="inset-tile flex min-h-12 items-center gap-2 rounded-lg p-2 ps-3">
      <span dir="auto" className="min-w-0 flex-1 truncate text-sm text-foreground">
        {channel.label}
      </span>
      <Chip size="sm" variant="soft" color={chip.color}>
        <Chip.Label>{chip.label}</Chip.Label>
      </Chip>
      {channel.status === "joined" ? null : channel.url ? (
        <Button size="sm" variant="secondary" className="!rounded-lg" aria-label={"عضویت در " + channel.label} onPress={() => openTelegramLink(channel.url)}>
          عضویت
        </Button>
      ) : (
        <span className="text-xs text-muted">لینک عضویت تنظیم نشده</span>
      )}
    </li>
  );
}

function ForceJoinStep({ step, notice, pending, act }: StepProps<"force_join">) {
  // A step that still lists missing channels after «عضو شدم» says so, instead of looking unchanged.
  const check = () => act(JOIN_CHECK_PATH, {}, (next) => (next.step === "force_join" ? STILL_MISSING : undefined));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-7 whitespace-pre-line text-foreground">{step.text}</p>
      <ul aria-label="کانال‌ها" className="flex flex-col gap-2">
        {step.channels.map((channel, index) => (
          <ChannelRow key={`${index}:${channel.url || channel.label}`} channel={channel} />
        ))}
      </ul>
      <Notice text={notice} />
      <ActionButton tone="ink" icon="solar:check-circle-linear" fullWidth isPending={pending} onPress={check}>
        {step.check_label || "عضو شدم"}
      </ActionButton>
    </div>
  );
}

function TermsStep({ step, notice, pending, act }: StepProps<"terms">) {
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="متن قوانین" tabIndex={0} className="inset-tile max-h-60 overflow-y-auto rounded-lg p-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <p className="text-sm leading-7 whitespace-pre-line text-foreground">{step.text}</p>
      </section>
      <Notice text={notice} />
      <ActionButton tone="ink" trailingIcon="solar:arrow-left-linear" fullWidth isPending={pending} onPress={() => act(TERMS_PATH, {})}>
        {step.button || "موافقم"}
      </ActionButton>
    </div>
  );
}

/**
 * The steps a person finishes before the app opens (the ones the bot asks for in its chat): a
 * referral code, the required channels, the entry terms. The server names the next step;
 * `onDone` runs once it says there is none, and `onRefused` when the person is blocked or waits
 * for an admin's approval.
 */
export function OnboardingScreen({ onDone, onRefused }: { onDone: () => void; onRefused: (kind: Refusal, err: ApiError) => void }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const apply = useCallback(
    (next: unknown, notice = "") => {
      if (!live.current) return;
      if (!isOnboardingStep(next)) {
        setLoad({ status: "error", message: BAD_REPLY });
        return;
      }
      if (next.step === "ready") onDone();
      else setLoad({ status: "step", step: next, notice });
    },
    [onDone],
  );

  /** A failure that ends onboarding goes to the app; any other is shown through `show`. */
  const fail = useCallback(
    (err: unknown, show: (message: string) => void) => {
      const kind = refusalKind(err);
      if (kind && err instanceof ApiError) onRefused(kind, err);
      // A 401 is already handled app-wide (the reopen notice); stay quiet here.
      else if (!(err instanceof ApiError && err.status === 401)) show(err instanceof ApiError && err.message ? err.message : FALLBACK_ERROR);
    },
    [onRefused],
  );

  const fetchStep = useCallback(() => {
    api<unknown>(ONBOARDING_PATH).then(
      (next) => apply(next),
      (err: unknown) => {
        if (live.current) fail(err, (message) => setLoad({ status: "error", message }));
      },
    );
  }, [apply, fail]);

  const read = useCallback(() => {
    setLoad({ status: "loading" });
    fetchStep();
  }, [fetchStep]);

  useEffect(() => {
    fetchStep();
  }, [fetchStep]);

  const act: Act = (path, body, onStep) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    api<unknown>(path, { method: "POST", body }).then(
      (next) => {
        busy.current = false;
        setPending(false);
        apply(next, isOnboardingStep(next) ? onStep?.(next) : "");
      },
      (err: unknown) => {
        busy.current = false;
        setPending(false);
        if (!live.current) return;
        // A lost reply, or another step taking over (the person left a channel): ask where they stand
        // instead of repeating this one.
        if (isUnknownOutcome(err) || isGateError(err)) read();
        else fail(err, (message) => setLoad((current) => (current.status === "step" ? { ...current, notice: message } : current)));
      },
    );
  };

  const title = load.status === "step" ? TITLES[load.step.step] : TITLES.ready;
  return (
    <GateFrame title={title}>
      {load.status === "loading" ? <LoadingRows rows={3} /> : null}
      {load.status === "error" ? <ErrorState message={load.message} onRetry={read} /> : null}
      {load.status === "step" && load.step.step === "referral" ? <ReferralStep step={load.step} notice={load.notice} pending={pending} act={act} /> : null}
      {load.status === "step" && load.step.step === "force_join" ? <ForceJoinStep step={load.step} notice={load.notice} pending={pending} act={act} /> : null}
      {load.status === "step" && load.step.step === "terms" ? <TermsStep step={load.step} notice={load.notice} pending={pending} act={act} /> : null}
    </GateFrame>
  );
}
