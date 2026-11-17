"use client";

import { SearchField } from "@heroui/react";
import { useEffect, useState } from "react";

import { SectionBadge } from "@/components/ui/SectionBadge";

import { useMini } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { EmptyState, ErrorState, LoadingRows } from "../../ui/ScreenState";
import { SubscriptionLink } from "../subscription/SubscriptionLink";
import { ServiceListRow } from "./ServiceListRow";
import { useServiceList } from "./useServiceList";

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_MAX = 64;

/** Figma "My services": a search field, then the customer's services, paged. */
export function ServicesScreen() {
  const { go, can } = useMini();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const { list, more, reset } = useServiceList(q);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(text.trim().slice(0, SEARCH_MAX)), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  const openService = (id: number) => go("service", { serviceId: id });
  const loadingFirst = list.status === "loading" && !list.items.length;

  let body;
  if (loadingFirst) {
    body = <LoadingRows rows={3} />;
  } else if (list.status === "error" && !list.items.length) {
    body = <ErrorState message={list.error} onRetry={reset} />;
  } else if (!list.items.length) {
    body = q ? (
      <EmptyState icon="solar:magnifer-linear" title="سرویسی با این نام پیدا نشد." />
    ) : (
      <EmptyState
        icon="solar:shield-check-linear"
        title="هنوز سرویسی ندارید."
        action={
          can("shop") ? (
            <ActionButton tone="accent" icon="solar:cart-large-2-linear" onPress={() => go("shop")}>
              خرید سرویس
            </ActionButton>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <>
        <ul className="flex flex-col" aria-label="فهرست سرویس‌ها">
          {list.items.map((service) => (
            <li key={service.id}>
              <ServiceListRow service={service} onOpen={openService} />
            </li>
          ))}
        </ul>
        {list.status === "error" ? <ErrorState message={list.error} /> : null}
        {list.next ? (
          <ActionButton tone="neutral" fullWidth isPending={list.status === "loading"} onPress={more}>
            سرویس‌های بیشتر
          </ActionButton>
        ) : null}
      </>
    );
  }

  return (
    <>
      <SectionBadge icon="solar:crown-bold" tone="yellow" title="سرویس‌ها" />
      <SubscriptionLink />
      <section className="inset-tile flex flex-col gap-3 rounded-xl p-4" aria-label="سرویس‌های من">
        <SearchField aria-label="جست‌وجوی نام سرویس" value={text} onChange={setText} fullWidth>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="نام سرویس را وارد کنید..." maxLength={SEARCH_MAX} dir="auto" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <hr className="border-t border-border" />
        {/* The list scrolls inside the panel (Figma shows its scroll bar); «بیشتر» sits at its end. */}
        <div className="flex max-h-[min(60dvh,520px)] min-h-48 flex-col gap-3 overflow-y-auto pe-1">{body}</div>
      </section>
    </>
  );
}
