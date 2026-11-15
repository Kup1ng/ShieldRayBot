"use client";

import { Button, Modal, Tabs } from "@heroui/react";
import { useCallback, useState } from "react";

import { run } from "../../core/actions";
import { useJson } from "../../core/data";
import { fa } from "../../core/format";
import { Ltr } from "../../ui/Data";
import { ErrorBlock, LoadingBlock } from "../../ui/States";
import { StatTile } from "../../ui/Page";
import { PurgePanel } from "./settings/PurgePanel";
import { SettingFieldView, isWideField } from "./settings/Fields";
import { fieldVisible, formFields, groupVisible, initialState, isDirty, type FormState } from "./settings/logic";
import type { FinanceSettingsPayload, SettingGroup, SettingsTabId } from "./types";

const SAVED = "ذخیره شد.";
const PENDING_ASK = {
  title: "لغو سفارش‌های معلق",
  text: "سفارش‌های معلق قدیمی‌تر از مهلت‌های ذخیره‌شده همین حالا لغو شوند؟ این عمل برگشت‌ناپذیر است.",
  confirmLabel: "لغو کن",
  tone: "warning",
} as const;

function GroupCard({ group, state, setField }: { group: SettingGroup; state: FormState; setField: (key: string, value: string | boolean) => void }) {
  if (!groupVisible(group, state)) return null;
  return (
    <section className="inset-tile flex flex-col gap-4 rounded-lg p-4" aria-label={group.name}>
      <h4 className="text-sm font-semibold text-foreground">{group.name}</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        {group.fields.map((field) =>
          fieldVisible(field, state) ? (
            <div key={field.key} className={isWideField(field) ? "sm:col-span-2" : undefined}>
              <SettingFieldView field={field} value={state[field.key]} onChange={(value) => setField(field.key, value)} />
            </div>
          ) : null,
        )}
      </div>
    </section>
  );
}

function SettingsForm({ groups, action, refresh }: { groups: SettingGroup[]; action: string; refresh: () => void }) {
  const [state, setState] = useState<FormState>(() => initialState(groups));
  const [pending, setPending] = useState(false);
  const dirty = isDirty(groups, state);

  const submit = async () => {
    if (pending) return;
    setPending(true);
    await run(action, formFields(groups, state), { success: SAVED, refresh });
    setPending(false);
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {groups.map((group) => (
        <GroupCard key={group.name} group={group} state={state} setField={(key, value) => setState((prev) => ({ ...prev, [key]: value }))} />
      ))}
      <div className="sticky bottom-0 -mx-1 flex justify-end bg-overlay/90 px-1 py-3 backdrop-blur">
        <Button type="submit" className="button--ink" isPending={pending} isDisabled={!dirty}>
          ذخیره تنظیمات
        </Button>
      </div>
    </form>
  );
}

function CleanupStatus({ status }: { status: NonNullable<FinanceSettingsPayload["cleanup_status"]> }) {
  return (
    <section className="inset-tile flex flex-col gap-3 rounded-lg p-4" aria-label="وضعیت پاکسازی">
      <div className="flex flex-col gap-0.5">
        <h4 className="text-sm font-semibold text-foreground">وضعیت پاکسازی</h4>
        <p className="text-xs text-muted">بر اساس مهلت‌های ذخیره‌شده؛ بعد از تغییر مهلت‌ها اول ذخیره کنید.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile icon="solar:clock-circle-bold" tone="orange" label="آمادهٔ لغو" value={fa(status.ready_count)} />
        <StatTile
          icon="solar:history-bold"
          tone="gray"
          label="آخرین اجرا"
          value={status.last_run ? <Ltr>{status.last_run}</Ltr> : "—"}
          hint={status.last_run ? `${fa(status.last_count)} سفارش لغو شد` : "هنوز اجرا نشده"}
        />
      </div>
    </section>
  );
}

function PendingOrders({ action, refresh }: { action: string; refresh: () => void }) {
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (pending) return;
    setPending(true);
    await run(action, {}, { ask: PENDING_ASK, refresh });
    setPending(false);
  };
  return (
    <section className="inset-tile flex flex-col gap-3 rounded-lg p-4" aria-label="لغو دستی">
      <h4 className="text-sm font-semibold text-foreground">لغو دستی</h4>
      <p className="text-xs leading-5 text-muted">
        سفارش‌های پرداخت‌نشده یا ردشده‌ای که از مهلت گذشته‌اند را همین حالا لغو می‌کند (وضعیت <code dir="ltr">cancelled</code>). روشن بودن لغو خودکار لازم نیست. سفارش پرداخت‌شده یا در حال تحویل هیچ‌وقت لغو نمی‌شود.
      </p>
      <div>
        <Button variant="secondary" isPending={pending} onPress={() => void submit()}>
          لغو سفارش‌های معلق الان
        </Button>
      </div>
    </section>
  );
}

function TabBody({ tab, data, refresh }: { tab: SettingsTabId; data: FinanceSettingsPayload; refresh: () => void }) {
  if (tab === "purge") return data.purge ? <PurgePanel purge={data.purge} refresh={refresh} /> : null;
  const groups = data.groups[tab];
  // A saved change comes back as new field values and restarts the form from them.
  const signature = JSON.stringify(groups);
  return (
    <div className="flex flex-col gap-4">
      {tab === "cleanup" && data.cleanup_status ? <CleanupStatus status={data.cleanup_status} /> : null}
      <SettingsForm key={`${tab}:${signature}`} groups={groups} action={data.actions[tab]} refresh={refresh} />
      {tab === "cleanup" ? <PendingOrders action={data.actions.pending_orders} refresh={refresh} /> : null}
    </div>
  );
}

function SettingsBody({ initialTab, onTabChange }: { initialTab: string; onTabChange: (tab: string) => void }) {
  const state = useJson<FinanceSettingsPayload>("/api/panel/finance/settings");
  const { reload } = state;
  const refresh = useCallback(() => reload(), [reload]);
  if (!state.data) return state.status === "error" ? <ErrorBlock message={state.message} onRetry={reload} /> : <LoadingBlock rows={4} />;
  const data = state.data;
  const tab = (data.tabs.find((t) => t.id === initialTab) ?? data.tabs[0]).id;
  return (
    <div className="flex flex-col gap-4">
      {state.status === "error" ? <ErrorBlock message={state.message} onRetry={reload} /> : null}
      <Tabs selectedKey={tab} onSelectionChange={(key) => onTabChange(String(key))}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="تب‌های تنظیمات مالی">
            {data.tabs.map((t) => (
              <Tabs.Tab key={t.id} id={t.id}>
                {t.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
      <TabBody tab={tab} data={data} refresh={refresh} />
    </div>
  );
}

/** «تنظیمات مالی»: payment methods, PAYG, pending-order cleanup and purge, posting the existing settings forms. */
export function SettingsDialog({ open, tab, onTabChange, onClose }: { open: boolean; tab: string; onTabChange: (tab: string) => void; onClose: () => void }) {
  return (
    <Modal.Backdrop isOpen={open} onOpenChange={(next) => !next && onClose()} variant="blur">
      <Modal.Container size="lg" scroll="inside">
        <Modal.Dialog aria-label="تنظیمات مالی">
          <Modal.CloseTrigger aria-label="بستن" />
          <Modal.Header>
            <Modal.Heading>تنظیمات مالی</Modal.Heading>
            <p className="text-sm text-muted">پرداخت، کارت، درگاه، پاکسازی سفارش‌ها و PAYG</p>
          </Modal.Header>
          <Modal.Body>{open ? <SettingsBody initialTab={tab} onTabChange={onTabChange} /> : null}</Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
