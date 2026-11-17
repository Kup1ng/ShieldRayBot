"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SectionBadge } from "@/components/ui/SectionBadge";

import { api } from "../../core/api";
import { copyText, safeUrl } from "../../core/format";
import { openExternal } from "../../core/telegram";
import { useMini } from "../../state/store";
import { ErrorState, LoadingRows } from "../../ui/ScreenState";
import { AutoRenewSwitch } from "./AutoRenew";
import { CancellationSheet } from "./CancellationSheet";
import { openGuides, rememberSubscriptionUrl } from "./guides";
import { ManageRow } from "./ManageRow";
import { QrSheet } from "./QrSheet";
import { RenewFlow } from "./RenewFlow";
import { ServiceHeader, ServiceHero, ServiceInfoNotice, ServiceInfoRows, SubscriptionLinkRow } from "./ServiceView";
import type { ServiceRow } from "./types";
import { UsageChart } from "./UsageChart";
import { useLoad } from "./useLoad";

/** Figma "Service view": summary, link, facts, usage and every action for one service. */
export function ServiceScreen() {
  const mini = useMini();
  const { me, route, features, can, back, openSheet, run, busy, notify } = mini;
  const id = Number(route.serviceId) || 0;

  const { state, reload, replace, update } = useLoad(async () => {
    const res = await api<{ service: ServiceRow }>(`/api/mini/service/${id}`);
    return res.service;
  });

  // A purchase, a renewal or a pull-to-refresh reloads /me; the service shows the fresh state.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    reload(true);
  }, [me, reload]);

  const service = state.status === "ready" ? state.data : null;
  useEffect(() => {
    if (service) rememberSubscriptionUrl(service);
  }, [service]);

  const open = Boolean(service) && !service?.is_cancelled && !service?.cancellation_pending;

  // Renewal runs as full-page steps in place of the service view. «Renew» from home or a
  // notice (`then: "renew"`) opens it once, when the service has loaded and is still open.
  const [renewing, setRenewing] = useState(false);
  const [autoDone, setAutoDone] = useState(false);
  const showRenew = renewing || (route.then === "renew" && !autoDone && open);
  const openRenew = useCallback(() => setRenewing(true), []);
  const exitRenew = useCallback(() => {
    setRenewing(false);
    setAutoDone(true);
  }, []);

  const refresh = () =>
    void run(`refresh:${id}`, async () => {
      try {
        const res = await api<{ service: ServiceRow }>(`/api/mini/service/${id}`);
        replace(res.service);
        if (res.service?.error) notify(res.service.error_message || "دریافت اطلاعات سرویس ناموفق بود", "err");
        else notify("اطلاعات سرویس به‌روز شد");
      } catch (err) {
        notify(err instanceof Error ? err.message : String(err), "err");
      }
    });

  const copyLink = async () => {
    const ok = service ? await copyText(safeUrl(service.subscription_url)) : false;
    notify(ok ? "لینک کپی شد" : "کپی نشد", ok ? "ok" : "err");
  };

  const openLink = () => {
    if (!service || !openExternal(service.subscription_url ?? "")) notify("لینک معتبر نیست", "err");
  };

  if (showRenew) return <RenewFlow serviceId={id} onExit={exitRenew} />;
  if (state.status === "loading") return <LoadingRows rows={4} />;
  if (state.status === "error" || !service) {
    return (
      <>
        <SectionBadge icon="solar:shield-check-bold" tone="blue" title="سرویس" />
        <ErrorState message={state.status === "error" ? state.error : "دریافت اطلاعات سرویس ناموفق بود."} onRetry={() => reload()} />
      </>
    );
  }

  const cancelLabel = service.is_cancelled || service.cancellation_pending ? "وضعیت درخواست لغو" : "درخواست لغو سرویس";
  const autoRenew =
    open && features.manage ? (
      <AutoRenewSwitch serviceId={id} state={service.auto_renew} onChanged={(next) => update((s) => ({ ...s, auto_renew: next }))} />
    ) : null;

  return (
    <>
      <ServiceHeader service={service} onBack={back} />
      <ServiceHero service={service} onRenew={open ? openRenew : undefined} autoRenew={autoRenew} />

      <section aria-label="جزئیات سرویس" className="flex flex-col gap-3">
        <SubscriptionLinkRow
          service={service}
          showQr={features.qr}
          onCopy={() => void copyLink()}
          onOpen={openLink}
          onQr={() => openSheet({ title: "QR کد اشتراک", render: () => <QrSheet serviceId={id} /> })}
        />
        <ServiceInfoRows service={service} />
        <ServiceInfoNotice service={service} onRetry={refresh} retrying={busy(`refresh:${id}`)} />
      </section>

      <UsageChart serviceId={id} />

      <section aria-label="مدیریت سرویس" className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">مدیریت سرویس</h2>
        {can("guides") ? <ManageRow icon="solar:book-2-bold" tone="teal" label="راهنمای اتصال" onPress={() => openGuides(mini, id)} /> : null}
        {features.manage ? (
          <ManageRow
            icon="solar:close-circle-bold"
            tone="red"
            label={cancelLabel}
            danger
            onPress={() =>
              openSheet({
                title: "درخواست لغو",
                render: () => <CancellationSheet serviceId={id} onChanged={() => reload(true)} />,
              })
            }
          />
        ) : null}
      </section>
    </>
  );
}
