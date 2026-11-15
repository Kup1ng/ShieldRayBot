"use client";

import { Button } from "@heroui/react";

import { IconTile } from "@/components/ui/IconTile";

import { api } from "../../core/api";
import { confirmAction, haptic } from "../../core/telegram";
import { invalidateResource } from "../../state/resources";
import { failureText, useMini } from "../../state/store";
import { EmptyState } from "../../ui/ScreenState";
import { Block, RowButton } from "../ops/parts";
import { CopyRow } from "./CopyRow";
import { REDEEM_UNKNOWN, pointsText, rewardAmountText, rewardIcon, rewardValueText, type Club, type RedeemResult, type Reward } from "./clubKit";

const BUSY_KEY = "redeem-reward";

function RewardCode({ code }: { code: string }) {
  return (
    <div className="flex flex-col gap-3">
      <CopyRow label="کد تخفیف" value={code} />
      <p className="text-xs text-muted">هنگام خرید سرویس، کد را در بخش «کد تخفیف» وارد کنید.</p>
    </div>
  );
}

function ServicePicker({ reward, services, onPick }: { reward: Reward; services: NonNullable<Club["services"]>; onPick: (serviceId: number) => void }) {
  if (!services.length) return <EmptyState icon="solar:shield-check-linear" title="برای این جایزه سرویس فعالی ندارید." />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground/80">
        {rewardValueText(reward)} به کدام سرویس اضافه شود؟ هزینه: {pointsText(reward.cost)}
      </p>
      {services.map((service) => (
        <RowButton
          key={service.id}
          icon="solar:shield-check-bold"
          tone="green"
          title={<bdi className="ltr">{service.name}</bdi>}
          aria-label={`افزودن به سرویس ${service.name}`}
          onPress={() => onPick(Number(service.id) || 0)}
        />
      ))}
    </div>
  );
}

/** Rewards list and the redeem flow: confirm, pick a service when needed, one request per tap. */
export function RewardsSection({ club }: { club: Club }) {
  const { run, busy, notify, openSheet, refreshAfterChange } = useMini();
  const rewards = club.rewards ?? [];

  /** No automatic retry: a lost answer is settled by reading the club again. */
  const redeem = (reward: Reward, serviceId: number | null, closeOwnSheet?: () => void) =>
    run(BUSY_KEY, async () => {
      let result: RedeemResult | null = null;
      try {
        result = await api<RedeemResult>(`/api/mini/club/rewards/${Number(reward.id)}/redeem`, {
          method: "POST",
          body: serviceId ? { service_id: serviceId } : {},
        });
      } catch (err) {
        notify(failureText(err, REDEEM_UNKNOWN), "err");
      }
      // Only the picker sheet that started this redeem closes; never a sheet opened since.
      closeOwnSheet?.();
      invalidateResource("club");
      if (result) {
        haptic("ok");
        notify(result.message || "جایزه دریافت شد");
        const code = result.discount_code;
        if (code) openSheet({ title: "کد تخفیف شما", render: () => <RewardCode code={code} /> });
      }
      if (!result || reward.type === "wallet_credit" || reward.needs_service) await refreshAfterChange();
    });

  const choose = async (reward: Reward) => {
    if (!reward.affordable) return;
    if (reward.needs_service) {
      openSheet({
        title: reward.name,
        render: (close) => <ServicePicker reward={reward} services={club.services ?? []} onPick={(serviceId) => void redeem(reward, serviceId, close)} />,
      });
      return;
    }
    const ok = await confirmAction(`«${reward.name}» (${rewardValueText(reward)}) با ${pointsText(reward.cost)} دریافت شود؟`);
    if (ok) await redeem(reward, null);
  };

  return (
    <Block title="جوایز" icon="solar:gift-bold" tone="pink">
      {rewards.length ? (
        rewards.map((reward) => (
          <div key={reward.id} className="flex items-center gap-3 rounded-lg bg-surface/70 p-2 ps-3">
            <IconTile icon={rewardIcon(reward.type)} tone={reward.affordable ? "pink" : "gray"} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">{reward.name}</span>
              <span className="text-xs text-muted">
                <bdi className="num">{rewardAmountText(reward)}</bdi>، {pointsText(reward.cost)}
              </span>
              {reward.description ? <span className="text-xs whitespace-pre-line text-muted">{reward.description}</span> : null}
            </div>
            <Button
              size="sm"
              variant={reward.affordable ? "primary" : "secondary"}
              isDisabled={!reward.affordable}
              isPending={busy(BUSY_KEY)}
              className="!rounded-lg"
              onPress={() => void choose(reward)}
            >
              {reward.affordable ? "دریافت" : "امتیاز کافی نیست"}
            </Button>
          </div>
        ))
      ) : (
        <p className="text-xs text-muted">هنوز جایزه‌ای تعریف نشده است.</p>
      )}
    </Block>
  );
}
