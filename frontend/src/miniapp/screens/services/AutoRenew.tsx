"use client";

import { Alert, Switch } from "@heroui/react";
import { useState } from "react";

import { api } from "../../core/api";
import { num } from "../../core/format";
import { failureText, useMini } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { ChoiceList } from "./ChoiceList";
import { PriceText } from "./PriceText";
import { SheetLoad } from "./SheetStates";
import type { AutomationAction, AutomationData, AutoRenewState } from "./types";
import { useLoad } from "./useLoad";

const RENEW = "renew";
const OFF: AutoRenewState = { enabled: false, blocked: false };
const UNKNOWN_SAVE = "نتیجهٔ ذخیره مشخص نشد؛ وضعیت تمدید خودکار را دوباره بررسی کنید.";

const automationPath = (serviceId: number) => `/api/mini/service/${serviceId}/automation`;

type PickerProps = { serviceId: number; item: AutomationAction; onSaved: () => void };

function RenewPlanPicker({ serviceId, item, onSaved }: PickerProps) {
  const { run, busy, notify } = useMini();
  // A deleted or hidden plan is not offered again: the customer picks a current one.
  const [choice, setChoice] = useState<number | null>(item.unavailable ? null : (item.choice_id ?? null));
  const key = `auto-renew:${serviceId}`;

  const save = () =>
    void run(key, async () => {
      if (!choice) {
        notify("پلن تمدید را انتخاب کنید", "err");
        return;
      }
      try {
        await api(automationPath(serviceId), { method: "POST", body: { action: RENEW, enabled: true, choice_id: choice } });
        notify("تمدید خودکار روشن شد");
        onSaved();
      } catch (err) {
        notify(failureText(err, UNKNOWN_SAVE), "err");
      }
    });

  if (!item.choices.length) return <p className="text-sm text-muted">پلنی برای تمدید خودکار فعال نیست.</p>;
  return (
    <>
      <ChoiceList
        label="پلن تمدید خودکار"
        value={choice}
        onChange={setChoice}
        items={item.choices.map((c) => ({ id: c.id, title: c.name, price: <PriceText quote={c} /> }))}
      />
      <ActionButton tone="ink" size="md" onPress={save} isPending={busy(key)} className="w-full">
        روشن کردن تمدید خودکار
      </ActionButton>
    </>
  );
}

function ReviewNotice({ orderId }: { orderId?: number | null }) {
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>
          {orderId ? `سفارش #${num(orderId)} ` : "سفارش خودکار قبلی "}
          نیاز به بررسی پشتیبانی دارد؛ تا آن زمان تمدید خودکار روشن نمی‌شود.
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

/** Turning automatic renewal on: the plan and its price are chosen here, before the wallet consent is saved. */
export function AutoRenewSheet({ serviceId, onSaved }: { serviceId: number; onSaved: () => void }) {
  const { state, reload } = useLoad(() => api<AutomationData>(automationPath(serviceId)));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-6 text-muted">
        وقتی زمان یا حجم سرویس تمام شود، پلن انتخابی با قیمت همان روز از کیف پول خریده و سرویس تمدید می‌شود.
      </p>
      <SheetLoad state={state} rows={2} onRetry={() => reload()}>
        {(data) => {
          if (data.needs_review || data.pending_order_id) return <ReviewNotice orderId={data.pending_order_id} />;
          const item = (data.actions ?? []).find((a) => a.action === RENEW);
          return item ? (
            <RenewPlanPicker serviceId={serviceId} item={item} onSaved={onSaved} />
          ) : (
            <p className="text-sm text-muted">پلنی برای تمدید خودکار فعال نیست.</p>
          );
        }}
      </SheetLoad>
    </div>
  );
}

type SwitchProps = { serviceId: number; state?: AutoRenewState; onChanged: (next: AutoRenewState) => void };

/**
 * «تمدید خودکار» on the blue service card. It shows the saved state only: off is sent at once,
 * on opens the plan sheet and flips once the server has saved it.
 */
export function AutoRenewSwitch({ serviceId, state = OFF, onChanged }: SwitchProps) {
  const { run, busy, notify, openSheet } = useMini();
  const key = `auto-renew:${serviceId}`;

  const turnOff = () =>
    void run(key, async () => {
      try {
        await api(automationPath(serviceId), { method: "POST", body: { action: RENEW, enabled: false } });
        notify("تمدید خودکار خاموش شد");
        onChanged({ ...state, enabled: false });
      } catch (err) {
        notify(failureText(err, UNKNOWN_SAVE), "err");
      }
    });

  const turnOn = () =>
    openSheet({
      title: "تمدید خودکار",
      render: (close) => (
        <AutoRenewSheet
          serviceId={serviceId}
          onSaved={() => {
            close();
            onChanged({ enabled: true, blocked: false });
          }}
        />
      ),
    });

  return (
    <div className="flex shrink-0 flex-col items-start">
      <Switch
        size="sm"
        isSelected={state.enabled}
        // While a purchase waits for support the switch can still go off, never on.
        isDisabled={busy(key) || (state.blocked && !state.enabled)}
        onChange={(on) => (on ? turnOn() : turnOff())}
        className="switch--on-blue"
      >
        {/* The padding makes the whole label a comfortable tap target; the track itself is small. */}
        <Switch.Content className="gap-2 py-3 text-xs font-medium">
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          تمدید خودکار
        </Switch.Content>
      </Switch>
      {state.blocked ? <span className="text-[11px] leading-4 text-white/80">در انتظار بررسی پشتیبانی</span> : null}
    </div>
  );
}
