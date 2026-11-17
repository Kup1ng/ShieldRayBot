"use client";

import { Button } from "@heroui/react";
import { useEffect, useState } from "react";

import { Icon } from "@/icons/Icon";

import { api } from "../../core/api";
import { num, safeUrl } from "../../core/format";
import { openExternal, openTelegramLink } from "../../core/telegram";
import { invalidateResource, useResource } from "../../state/resources";
import { failureText, useMini, type MiniContextValue } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { EmptyState, Settled } from "../../ui/ScreenState";
import type { Guide, ServiceRow } from "./types";

type GuidesPayload = { guides: Guide[] };

/**
 * Subscription links of services already loaded in this visit, so a guide can offer
 * «افزودن اشتراک به برنامه» without asking the panel again.
 */
const subscriptionUrls = new Map<number, string>();

/** Called by the service screen whenever it has a fresh service row. */
export function rememberSubscriptionUrl(service: ServiceRow): void {
  const id = Number(service.id) || 0;
  const url = safeUrl(service.subscription_url);
  if (id && url) subscriptionUrls.set(id, url);
  else subscriptionUrls.delete(id);
}

/** The service's link: remembered, else read once from the server (guides opened from home). */
function useSubscriptionUrl(serviceId: number, needed: boolean): string {
  const [url, setUrl] = useState(() => subscriptionUrls.get(serviceId) ?? "");
  useEffect(() => {
    if (!needed || !serviceId || url) return;
    let alive = true;
    api<{ service?: ServiceRow }>(`/api/mini/service/${serviceId}`)
      .then((res) => {
        if (!res.service) return;
        rememberSubscriptionUrl(res.service);
        if (alive) setUrl(subscriptionUrls.get(serviceId) ?? "");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [needed, serviceId, url]);
  return url;
}

function GuideList({ guides, onOpen }: { guides: Guide[]; onOpen: (id: string) => void }) {
  if (!guides.length) return <EmptyState icon="solar:book-2-linear" title="هنوز آموزشی تعریف نشده است." />;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">برنامهٔ دستگاه خود را انتخاب کنید.</p>
      {guides.map((guide) => (
        <Button
          key={guide.id}
          variant="secondary"
          onPress={() => onOpen(guide.id)}
          className="inset-tile !h-auto min-h-12 !w-full !justify-start !gap-2 !rounded-lg !p-3 text-start"
        >
          <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <span className="text-sm font-semibold text-foreground">{guide.title}</span>
            {guide.media_count ? <span className="num text-xs text-muted">{num(guide.media_count)} عکس یا ویدیو</span> : null}
          </span>
          <Icon name="solar:alt-arrow-left-linear" size={18} className="text-muted" />
        </Button>
      ))}
    </div>
  );
}

function GuideDetail({ guide, serviceId, onBack }: { guide: Guide; serviceId: number; onBack: () => void }) {
  const { notify, run, busy } = useMini();
  const subscription = useSubscriptionUrl(serviceId, guide.opens_subscription);

  const openSubscription = () => {
    if (!openExternal(subscription)) notify("لینک معتبر نیست", "err");
  };
  const openLink = (index: number) => {
    const link = guide.links[index];
    if (!link || !openTelegramLink(link.url)) notify("لینک معتبر نیست", "err");
  };
  const send = () =>
    void run("send-guide", async () => {
      try {
        const res = await api<{ message?: string }>(`/api/mini/guides/${encodeURIComponent(guide.id)}/send`, { method: "POST", body: {} });
        notify(res.message || "آموزش در ربات فرستاده شد");
      } catch (err) {
        notify(failureText(err, "نتیجهٔ ارسال مشخص نشد؛ چت ربات را بررسی کنید."), "err");
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold text-foreground">{guide.title}</h3>
      <p className="text-sm leading-7 whitespace-pre-line text-foreground/90">{guide.body}</p>
      <div className="flex flex-col gap-2">
        {guide.opens_subscription && subscription ? (
          <ActionButton tone="accent" icon="solar:link-round-bold" fullWidth onPress={openSubscription}>
            افزودن اشتراک به برنامه
          </ActionButton>
        ) : null}
        {guide.links.map((link, index) => (
          <ActionButton key={`${link.url}:${index}`} tone="neutral" icon="solar:square-arrow-right-up-linear" fullWidth onPress={() => openLink(index)}>
            {link.label}
          </ActionButton>
        ))}
        {guide.media_count ? (
          <ActionButton tone="neutral" icon="solar:plain-linear" fullWidth onPress={send} isPending={busy("send-guide")}>
            ارسال آموزش کامل با عکس و ویدیو در ربات
          </ActionButton>
        ) : null}
        <ActionButton tone="ink" icon="solar:arrow-right-linear" fullWidth onPress={onBack}>
          همهٔ آموزش‌ها
        </ActionButton>
      </div>
    </div>
  );
}

function GuidesSheet({ serviceId }: { serviceId: number }) {
  const resource = useResource<GuidesPayload>("guides");
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Settled resource={resource} rows={3} onRetry={() => invalidateResource("guides")}>
      {(data) => {
        const guides = data.guides ?? [];
        const guide = openId ? guides.find((g) => g.id === openId) : undefined;
        return guide ? (
          <GuideDetail guide={guide} serviceId={serviceId} onBack={() => setOpenId(null)} />
        ) : (
          <GuideList guides={guides} onOpen={setOpenId} />
        );
      }}
    </Settled>
  );
}

/** Opens the connection-guides sheet for a service (0 = general guides). */
export function openGuides(mini: MiniContextValue, serviceId: number): void {
  mini.openSheet({ title: "راهنمای اتصال", render: () => <GuidesSheet serviceId={serviceId} /> });
}
