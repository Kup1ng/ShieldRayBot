"use client";

import { Chip, Radio, RadioGroup } from "@heroui/react";

import { money } from "../../core/format";
import { haptic } from "../../core/telegram";
import { StepFooter } from "../../ui/flow/StepFooter";
import { priceView } from "./catalogPrice";
import { PriceText } from "./PriceText";
import { Description, InkSegment, InsetBlock } from "./parts";
import { durationKey, durationOptions, planMetaText, paidPlans, trialPlan, volumeOptions, type PlanKind } from "./planGroups";
import type { Plan } from "./types";

type PlanPickerProps = {
  plans: Plan[];
  plan: Plan | null;
  onSelect: (planId: number) => void;
  onNext: () => void;
};

const KIND_LABELS: Record<PlanKind, string> = { paid: "سرویس اصلی", trial: "سرویس تست" };

/** Figma "New service" step 1: type → duration → volume, then the price pill and «بعدی». */
export function PlanPicker({ plans, plan, onSelect, onNext }: PlanPickerProps) {
  const paid = paidPlans(plans);
  const trial = trialPlan(plans);
  const kind: PlanKind = plan?.is_trial ? "trial" : "paid";
  const durations = durationOptions(plans);
  const duration = plan && !plan.is_trial ? durationKey(plan) : durations[0]?.key ?? "0";
  const volumes = volumeOptions(plans, duration);

  const offer = plan ? priceView(plan) : null;
  const kinds: PlanKind[] = [...(paid.length ? (["paid"] as const) : []), ...(trial ? (["trial"] as const) : [])];

  const chooseKind = (next: string) => {
    if (next === kind) return;
    if (next === "trial" && trial) onSelect(trial.id);
    else if (paid[0]) onSelect(paid[0].id);
  };

  const chooseDuration = (next: string) => {
    if (next === duration) return;
    const first = volumeOptions(plans, next)[0];
    if (first) onSelect(first.plan.id);
  };

  const chooseVolume = (value: string) => {
    const id = Number(value);
    if (id && id !== plan?.id) {
      haptic("select");
      onSelect(id);
    }
  };

  return (
    <>
      {kinds.length > 1 ? (
        <InsetBlock title="انتخاب نوع سرویس" labelId="shop-kind" hint="با سرویس تست، کیفیت اتصال را پیش از خرید امتحان کنید.">
          <InkSegment label="نوع سرویس" options={kinds.map((k) => ({ key: k, label: KIND_LABELS[k] }))} value={kind} onChange={chooseKind} />
        </InsetBlock>
      ) : null}

      {kind === "trial" && trial ? (
        <InsetBlock title="سرویس تست" labelId="shop-trial">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {trial.name}
                <Chip size="sm" variant="soft" color="success">
                  <Chip.Label>تست</Chip.Label>
                </Chip>
              </p>
              <p className="text-xs text-muted">{planMetaText(trial)}</p>
            </div>
            <PriceText quote={trial} className="text-sm text-foreground" />
          </div>
          <Description text={trial.description} />
        </InsetBlock>
      ) : (
        <>
          {durations.length > 1 ? (
            <InsetBlock title="انتخاب زمان سرویس" labelId="shop-duration">
              <InkSegment label="زمان سرویس" options={durations} value={duration} onChange={chooseDuration} />
            </InsetBlock>
          ) : null}

          <InsetBlock title="انتخاب حجم سرویس" labelId="shop-volume">
            <RadioGroup
              aria-labelledby="shop-volume"
              value={plan && !plan.is_trial ? String(plan.id) : ""}
              onChange={chooseVolume}
              className="grid grid-cols-2 gap-x-4 gap-y-3"
            >
              {volumes.map(({ plan: option, label }) => (
                <Radio key={option.id} value={String(option.id)} className="min-w-0">
                  <Radio.Content className="flex items-start gap-2">
                    <Radio.Control className="mt-0.5 shrink-0">
                      <Radio.Indicator />
                    </Radio.Control>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm text-foreground">{label}</span>
                      {option.original_price != null && Number(option.original_price) > Number(option.price) ? (
                        <span className="text-[11px] font-medium text-success">تخفیف‌دار</span>
                      ) : null}
                    </span>
                  </Radio.Content>
                </Radio>
              ))}
            </RadioGroup>
          </InsetBlock>
          {plan?.description?.trim() ? (
            <InsetBlock title="توضیحات پلن" labelId="shop-description">
              <Description text={plan.description} />
            </InsetBlock>
          ) : null}
        </>
      )}

      {offer?.deadline ? <p className="text-center text-xs text-muted">تخفیف تا {offer.deadline}</p> : null}
      <StepFooter
        price={
          plan ? (
            <span className="inline-flex items-baseline gap-1.5">
              <span>قیمت:</span>
              {offer && offer.previous !== null ? (
                <>
                  <s className="num text-xs opacity-70">
                    <span className="sr-only">قیمت پیشین: </span>
                    <bdi>{money(offer.previous)}</bdi>
                  </s>
                  <span aria-hidden>←</span>
                </>
              ) : null}
              <b className="num font-semibold">
                <bdi>{money(offer?.price)}</bdi>
              </b>
            </span>
          ) : (
            "یک پلن را انتخاب کنید."
          )
        }
        primaryLabel="بعدی"
        onPrimary={onNext}
        primaryDisabled={!plan}
      />
    </>
  );
}
