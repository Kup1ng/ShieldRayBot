"use client";

import { Alert, Button, Checkbox } from "@heroui/react";
import { useCallback, useState } from "react";

import { run } from "../../core/actions";
import { useJson, useQuery } from "../../core/data";
import { fa } from "../../core/format";
import { Ltr } from "../../ui/Data";
import { EmptyBlock, Loadable } from "../../ui/States";
import { GlassSection } from "../../ui/Page";
import { faId } from "./format";
import type { AutomationItem, AutomationPayload } from "./types";

function Check({ checked, onChange, children, required }: { checked: boolean; onChange: (value: boolean) => void; children: string; required?: boolean }) {
  return (
    <Checkbox isSelected={checked} onChange={onChange} isRequired={required}>
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        {children}
      </Checkbox.Content>
    </Checkbox>
  );
}

function ClearForm({ item, refresh }: { item: AutomationItem; refresh: () => void }) {
  const [settled, setSettled] = useState(false);
  const [disable, setDisable] = useState(false);
  const [pending, setPending] = useState(false);
  const blocked = item.wallet_debited && !settled;

  const submit = async () => {
    if (blocked || pending) return;
    setPending(true);
    await run(
      `/service-automation/${item.service_id}/clear`,
      { money_settled: settled, disable_automation: disable },
      {
        ask: { title: "آزادسازی خرید خودکار", text: "این سرویس آزاد شود؟ خرید خودکار بعدی طبق تنظیمات مشتری ادامه پیدا می‌کند.", confirmLabel: "آزاد شود", tone: "warning" },
        refresh,
      },
    );
    setPending(false);
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {item.wallet_debited ? (
        <Check checked={settled} onChange={setSettled} required>
          مبلغ کسرشده از کیف مشتری برگردانده شده است
        </Check>
      ) : null}
      <Check checked={disable} onChange={setDisable}>
        خرید خودکار این سرویس خاموش شود
      </Check>
      <div>
        <Button type="submit" className="button--ink" isPending={pending} isDisabled={blocked}>
          آزادسازی
        </Button>
      </div>
    </form>
  );
}

function ItemCard({ item, refresh, onGoDelivery }: { item: AutomationItem; refresh: () => void; onGoDelivery: () => void }) {
  return (
    <article className="inset-tile flex flex-col gap-3 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-foreground">
        سرویس <Ltr>{item.username}</Ltr> — <span dir="auto">{item.customer}</span>
      </h4>
      <p className="text-sm text-muted">
        {item.action_label || "عمل نامشخص"}
        {item.order_id ? (
          <>
            {" "}
            · سفارش <Ltr>#{faId(item.order_id)}</Ltr> ({item.order_status_label || "پیدا نشد"})
          </>
        ) : null}
        {item.amount !== null ? (
          <>
            {" "}
            · <Ltr>{fa(item.amount)}</Ltr> تومان
          </>
        ) : null}
      </p>
      <p className="text-sm text-foreground">{item.state_label}</p>
      {item.state === "clearable" ? <ClearForm item={item} refresh={refresh} /> : null}
      {item.state === "wait_order" && item.order_id ? (
        <div>
          <Button variant="outline" onPress={onGoDelivery}>
            رفتن به تحویل ناموفق
          </Button>
        </div>
      ) : null}
    </article>
  );
}

export function AutomationTab({ onGoDelivery }: { onGoDelivery: () => void }) {
  const query = useQuery();
  const after = query.get("after");
  const state = useJson<AutomationPayload>(`/api/panel/finance/automation${after ? `?after=${encodeURIComponent(after)}` : ""}`);
  const { reload } = state;
  const refresh = useCallback(() => reload(), [reload]);
  return (
    <GlassSection title="تمدید خودکار" description="خریدهای خودکاری که برای بررسی دستی متوقف شده‌اند">
      <p className="text-sm leading-6 text-muted">
        خرید خودکاری که ممکن است از کیف پول کسر شده ولی کامل نشده باشد، برای احتیاط متوقف می‌شود و دوباره خرید نمی‌کند. پس از تعیین تکلیف سفارش، آن را از اینجا آزاد کنید. سفارش تحویل‌شده را سامانه خودش تکمیل می‌کند.
      </p>
      <Loadable state={state}>
        {(data) => (
          <div className="flex flex-col gap-3">
            {data.missing_bots.length ? (
              <Alert status="warning">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>
                    این فروشگاه‌ها خرید خودکار فعال دارند ولی ربات ندارند، پس اجرا و اعلان آن‌ها انجام نمی‌شود:{" "}
                    {data.missing_bots.map((id, index) => (
                      <span key={id}>
                        {index ? "، " : ""}
                        <Ltr>#{faId(id)}</Ltr>
                      </span>
                    ))}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
            {data.items.length ? (
              data.items.map((item) => <ItemCard key={item.service_id} item={item} refresh={refresh} onGoDelivery={onGoDelivery} />)
            ) : (
              <EmptyBlock title="خرید خودکار متوقف‌شده‌ای نیست." />
            )}
            {data.next_cursor ? (
              <div>
                <Button variant="outline" onPress={() => query.set({ after: String(data.next_cursor) })}>
                  موارد بعدی
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Loadable>
    </GlassSection>
  );
}
