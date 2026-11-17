"use client";

import { Button, Chip } from "@heroui/react";

import { IconTile } from "@/components/ui/IconTile";
import { SectionBadge } from "@/components/ui/SectionBadge";
import { Icon } from "@/icons/Icon";

import { api } from "../../core/api";
import { money, num } from "../../core/format";
import { confirmAction, haptic } from "../../core/telegram";
import { failureText, useMini } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { ErrorState, LoadingRows } from "../../ui/ScreenState";
import { openTopup } from "../account/topup";
import { Block, HeroCard } from "../ops/parts";
import { useLoad } from "../services/useLoad";
import {
  EXTRA_UNITS,
  PURCHASE_UNKNOWN,
  capacityText,
  daysLeftText,
  isActive,
  packLabel,
  type ExtraKind,
  type PurchaseReply,
  type SubscriptionOverview,
  type SubscriptionPack,
  type UnitOffer,
} from "./subscriptionKit";

const BUSY_KEY = "reseller-purchase";
const OVERVIEW_PATH = "/api/mini/reseller/subscription";

type Purchase = { question: string; path: string; body: Record<string, unknown>; done: string };

function StatusCard({ overview }: { overview: SubscriptionOverview }) {
  const active = isActive(overview);
  return (
    <Block title="وضعیت اشتراک" icon="solar:shield-check-bold" tone="teal" action={
      <Chip size="sm" variant="soft" color={active ? "success" : "warning"}>
        <Chip.Label>{active ? "فعال" : "نیازمند تمدید"}</Chip.Label>
      </Chip>
    }>
      <p dir="auto" className="text-sm font-semibold text-foreground">
        {overview.plan_name || "بدون پلن"}
      </p>
      <dl className="flex flex-col gap-2 text-sm text-foreground/80">
        <div className="flex items-center justify-between gap-3">
          <dt>زمان</dt>
          <dd className="font-medium text-foreground">{daysLeftText(overview)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>حجم</dt>
          <dd className="num font-medium text-foreground">
            <bdi>{capacityText(overview.base_gb, overview.extra_gb, "گیگ")}</bdi>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>کاربر</dt>
          <dd className="num font-medium text-foreground">
            <bdi>{capacityText(overview.base_users, overview.extra_users, "کاربر")}</bdi>
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted">
        {overview.usage ? `مصرف فعلی: ${num(overview.usage.users)} کاربر · ${num(overview.usage.used_gb)} گیگ` : "مصرف فعلی از پنل خوانده نشد."}
      </p>
    </Block>
  );
}

function RenewBlock({ overview, onBuy, pending }: { overview: SubscriptionOverview; onBuy: (purchase: Purchase) => void; pending: boolean }) {
  const total = overview.renew_total;
  if (overview.is_payg) return null;
  if (total === null || total === undefined) {
    return overview.renew_note ? (
      <p role="note" className="text-xs leading-6 text-muted">
        {overview.renew_note}
      </p>
    ) : null;
  }
  const short = total > overview.wallet;
  return (
    <Block title="تمدید اشتراک" icon="solar:refresh-circle-bold" tone="green">
      <ActionButton
        tone="ink"
        icon="solar:refresh-linear"
        fullWidth
        isPending={pending}
        isDisabled={short}
        onPress={() =>
          onBuy({
            question: `تمدید اشتراک نمایندگی به مبلغ ${money(total)} از کیف پول؟`,
            path: "/api/mini/reseller/renew",
            body: {},
            done: "تمدید انجام شد",
          })
        }
      >
        {`تمدید — ${money(total)}`}
      </ActionButton>
      {short ? <p className="text-xs text-danger">موجودی کیف پول کافی نیست.</p> : null}
    </Block>
  );
}

function PackRow({ pack, wallet, pending, onBuy }: { pack: SubscriptionPack; wallet: number; pending: boolean; onBuy: (purchase: Purchase) => void }) {
  const short = pack.price > wallet;
  return (
    <Button
      variant="secondary"
      isDisabled={pending || short}
      onPress={() =>
        onBuy({
          question: `خرید بستهٔ «${pack.name}» به مبلغ ${money(pack.price)} از کیف پول؟ تاریخ انقضا تغییر نمی‌کند.`,
          path: "/api/mini/reseller/pack",
          body: { pack_id: pack.id },
          done: "بسته اعمال شد",
        })
      }
      className="inset-tile !h-auto !w-full !justify-start !gap-3 !rounded-lg !p-3 text-start"
    >
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span dir="auto" className="max-w-full truncate text-sm font-medium text-foreground">
          {pack.name}
        </span>
        <span className="num text-xs text-muted">{packLabel(pack)}</span>
        {pack.description ? (
          <span dir="auto" className="text-xs whitespace-pre-line text-muted">
            {pack.description}
          </span>
        ) : null}
        {short ? <span className="text-xs text-danger">موجودی کافی نیست</span> : null}
      </span>
      <span className="num shrink-0 text-sm font-semibold text-foreground">
        <bdi>{money(pack.price)}</bdi>
      </span>
    </Button>
  );
}

function UnitBlock({
  title,
  kind,
  offer,
  wallet,
  pending,
  onBuy,
}: {
  title: string;
  kind: ExtraKind;
  offer: UnitOffer;
  wallet: number;
  pending: boolean;
  onBuy: (purchase: Purchase) => void;
}) {
  const unit = EXTRA_UNITS[kind];
  return (
    <Block title={title} icon={kind === "gb" ? "solar:database-bold" : "solar:users-group-rounded-bold"} tone={kind === "gb" ? "blue" : "orange"}>
      <p className="text-xs text-muted">
        نرخ: <bdi className="num">{money(offer.unit_price)}</bdi> برای هر {unit}
      </p>
      <div className="flex flex-wrap gap-2">
        {offer.options.map((amount) => {
          const price = offer.unit_price * amount;
          return (
            <Button
              key={amount}
              size="sm"
              variant="secondary"
              isDisabled={pending || price > wallet}
              aria-label={`${num(amount)} ${unit}، ${money(price)}`}
              className="!rounded-lg"
              onPress={() =>
                onBuy({
                  question: `خرید ${num(amount)} ${unit} به مبلغ ${money(price)} از کیف پول؟`,
                  path: "/api/mini/reseller/extra",
                  body: { kind, amount },
                  done: "ظرفیت اضافه شد",
                })
              }
            >
              {num(amount)} {unit}
            </Button>
          );
        })}
      </div>
    </Block>
  );
}

function Overview({ overview, onBuy, pending }: { overview: SubscriptionOverview; onBuy: (purchase: Purchase) => void; pending: boolean }) {
  const mini = useMini();
  const { features } = mini;
  const wallet = Number(overview.wallet) || 0;
  return (
    <>
      <HeroCard label="موجودی کیف پول" value={money(wallet)} ariaLabel="کیف پول">
        {features.topup ? (
          <div className="pt-2">
            <Button className="!h-10 !rounded-lg !border-transparent !bg-white !text-[var(--eclipse)]" onPress={() => openTopup(mini)}>
              <Icon name="solar:add-circle-linear" size={20} />
              شارژ کیف پول
            </Button>
          </div>
        ) : null}
      </HeroCard>

      {overview.unavailable ? (
        <div role="status" className="flex items-start gap-3 rounded-lg bg-warning/12 p-3">
          <IconTile icon="solar:danger-triangle-bold" tone="yellow" />
          <p className="text-sm leading-6 text-foreground">{overview.unavailable}</p>
        </div>
      ) : null}

      <StatusCard overview={overview} />
      <RenewBlock overview={overview} onBuy={onBuy} pending={pending} />

      {overview.packs.length ? (
        <Block title="بسته‌های آماده" icon="solar:box-bold" tone="purple">
          <div className="flex flex-col gap-2">
            {overview.packs.map((pack) => (
              <PackRow key={pack.id} pack={pack} wallet={wallet} pending={pending} onBuy={onBuy} />
            ))}
          </div>
        </Block>
      ) : null}
      {overview.unit_gb ? <UnitBlock title="حجم اضافه" kind="gb" offer={overview.unit_gb} wallet={wallet} pending={pending} onBuy={onBuy} /> : null}
      {overview.unit_users ? <UnitBlock title="کاربر اضافه" kind="users" offer={overview.unit_users} wallet={wallet} pending={pending} onBuy={onBuy} /> : null}
    </>
  );
}

/** «اشتراک نمایندگی»: the shop owner's own package, wallet, renewal, capacity packs and unit extras. */
export function SubscriptionScreen() {
  const { run, busy, notify, refreshAfterChange } = useMini();
  const { state, reload, replace } = useLoad(() => api<SubscriptionOverview>(OVERVIEW_PATH));

  /** The package as it is now; the next purchase must carry its generation, so nothing is bought before this is back. */
  const readAgain = async () => {
    try {
      replace(await api<SubscriptionOverview>(OVERVIEW_PATH));
    } catch {
      reload();
    }
  };

  /**
   * Confirm, then send one purchase with the generation this screen was loaded with: a repeated
   * request is refused by the server, and the next tap waits until the new generation is on screen.
   * Nothing is retried automatically; afterwards the package and the wallet are read again,
   * whatever the answer was.
   */
  const buy = (purchase: Purchase) =>
    run(BUSY_KEY, async () => {
      if (state.status !== "ready") return;
      if (!(await confirmAction(purchase.question))) return;
      try {
        const res = await api<PurchaseReply>(purchase.path, {
          method: "POST",
          body: { ...purchase.body, generation: state.data.generation },
        });
        haptic("ok");
        notify(res.message || purchase.done);
      } catch (err) {
        notify(failureText(err, PURCHASE_UNKNOWN), "err");
      }
      await refreshAfterChange();
      await readAgain();
    });

  return (
    <>
      <SectionBadge icon="solar:shop-bold" title="اشتراک نمایندگی" />
      {state.status === "loading" ? <LoadingRows rows={3} /> : null}
      {state.status === "error" ? <ErrorState message={state.error} onRetry={() => reload()} /> : null}
      {state.status === "ready" ? <Overview overview={state.data} onBuy={(purchase) => void buy(purchase)} pending={busy(BUSY_KEY)} /> : null}
    </>
  );
}
