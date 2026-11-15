"use client";

import { Button, Tabs, toast } from "@heroui/react";
import { useEffect, useState } from "react";

import { Icon } from "@/icons/Icon";

import { useJson, useQuery } from "../../core/data";
import { ErrorBlock, LoadingBlock } from "../../ui/States";
import { safeMessage } from "../../core/api";
import { usePanelSession } from "../../core/session";
import { PanelShell } from "../../layout/PanelShell";
import { PageHeader } from "../../ui/Page";
import { AutomationTab } from "./AutomationTab";
import { CancellationsTab } from "./CancellationsTab";
import { DeliveryTab } from "./DeliveryTab";
import { ReceiptDialog } from "./Dialogs";
import { OrdersTab } from "./OrdersTab";
import { PaymentsTab } from "./PaymentsTab";
import { ReportsTab } from "./ReportsTab";
import { pickTab } from "./pickTab";
import { SettingsDialog } from "./SettingsDialog";
import type { FinanceOverview, FinanceTab } from "./types";

const TAB_LABELS: Record<FinanceTab, string> = {
  reports: "گزارشات",
  orders: "سفارشات",
  payments: "پرداخت‌ها",
  delivery: "تحویل ناموفق",
  cancellations: "درخواست‌های لغو",
  automation: "تمدید خودکار",
};

const SETTINGS_TABS = new Set(["payment", "billing", "cleanup", "purge"]);
// Query keys that belong to one tab; they are dropped when the tab changes.
const TAB_KEYS = ["q", "page", "before", "after", "period"] as const;
// Messages the server's redirects leave in the address; shown once as a toast, then removed.
const FLASH_KEYS = ["ok", "err", "error", "msg", "saved"] as const;

function useAddressFlash(ready: boolean) {
  const query = useQuery();
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    const error = safeMessage(params.get("err") || params.get("error"), "");
    const ok = safeMessage(params.get("ok") || params.get("msg"), "") || (params.get("saved") === "1" ? "ذخیره شد." : "");
    if (!error && !ok && !FLASH_KEYS.some((key) => params.has(key))) return;
    if (error) toast.danger(error);
    else if (ok) toast.success(ok);
    query.set(Object.fromEntries(FLASH_KEYS.map((key) => [key, null])), { replace: true });
    // The address is read once when the page is ready; later changes come from this page itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}

function Content({ overview }: { overview: FinanceOverview }) {
  const query = useQuery();
  const { session } = usePanelSession();
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const tab = pickTab(query.get("tab"), overview.tabs);
  const settings = query.get("settings");
  const settingsOpen = overview.can_settings && SETTINGS_TABS.has(settings);
  useAddressFlash(true);

  const goTab = (next: FinanceTab) => query.set({ tab: next, ...Object.fromEntries(TAB_KEYS.map((key) => [key, null])) });

  return (
    <>
      <PageHeader
        icon="solar:wallet-money-bold"
        tone="green"
        title="مدیریت مالی"
        description="گزارش فروش، سفارش‌ها، پرداخت‌ها، تحویل ناموفق و درخواست‌های لغو"
        actions={
          overview.can_settings ? (
            <Button variant="outline" onPress={() => query.set({ settings: "payment" })}>
              <Icon name="solar:settings-linear" size={20} />
              تنظیمات
            </Button>
          ) : null
        }
      />
      <div className="mb-4 overflow-x-auto">
        <Tabs selectedKey={tab} onSelectionChange={(key) => goTab(String(key) as FinanceTab)}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="مدیریت مالی">
              {overview.tabs.map((id) => (
                <Tabs.Tab key={id} id={id}>
                  <span className="flex items-center gap-1.5">
                    {TAB_LABELS[id]}
                    {id === "cancellations" && session.alerts.cancellations ? <span role="img" aria-label="درخواست لغو در انتظار" className="inline-block size-2 rounded-full bg-danger" /> : null}
                  </span>
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>
      {tab === "reports" ? <ReportsTab goTab={goTab} /> : null}
      {tab === "orders" ? <OrdersTab onReceipt={setReceiptId} /> : null}
      {tab === "payments" ? <PaymentsTab onReceipt={setReceiptId} /> : null}
      {tab === "delivery" ? <DeliveryTab /> : null}
      {tab === "cancellations" ? <CancellationsTab /> : null}
      {tab === "automation" ? <AutomationTab onGoDelivery={() => goTab("delivery")} /> : null}
      <ReceiptDialog paymentId={receiptId} onClose={() => setReceiptId(null)} />
      <SettingsDialog
        open={settingsOpen}
        tab={settings}
        onTabChange={(next) => query.set({ settings: next }, { replace: true })}
        onClose={() => query.set({ settings: null })}
      />
    </>
  );
}

export function FinancePage() {
  const overview = useJson<FinanceOverview>("/api/panel/finance");
  return (
    <PanelShell title="مدیریت مالی">
      {overview.data ? <Content overview={overview.data} /> : overview.status === "error" ? <ErrorBlock message={overview.message} onRetry={overview.reload} /> : <LoadingBlock rows={6} />}
    </PanelShell>
  );
}
