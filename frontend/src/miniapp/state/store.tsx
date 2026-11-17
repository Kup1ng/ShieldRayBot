"use client";

import { toast } from "@heroui/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { ApiError, FALLBACK_ERROR, api, isUnknownOutcome } from "../core/api";
import { safePanelPath, setCurrency } from "../core/format";
import { bindBackButton, haptic, isTelegramConnected, onTelegramReady, openExternal, webApp } from "../core/telegram";
import type { CustomerSummary, MePayload, Persona, Route, ViewId } from "../types";
import { invalidateAllResources, invalidateResource, peekResource, resetActivityLimit } from "./resources";

/* ---------- navigation rules (same as the server-driven tabs of the old Mini App) ---------- */

type SubView = { parent: ViewId; label: string };

const SUB_VIEWS: Partial<Record<ViewId, SubView>> = {
  service: { parent: "services", label: "سرویس‌ها" },
  subscription: { parent: "services", label: "سرویس‌ها" },
  support: { parent: "home", label: "خانه" },
  club: { parent: "home", label: "خانه" },
  ticket: { parent: "support", label: "پشتیبانی" },
};

/** Sub-screens that belong to a section a shop's Mini App may not have opened. */
const VIEW_SECTIONS: Partial<Record<ViewId, string>> = { support: "support", ticket: "support", club: "club" };

const LEGACY_VIEWS: Record<string, ViewId> = { wallet: "account" };

const KNOWN_VIEWS = new Set<ViewId>(["home", "services", "service", "shop", "account", "support", "ticket", "club", "review", "ops", "subscription"]);

function reviewParent(persona: Persona): SubView {
  return persona === "admin" ? { parent: "home", label: "داشبورد" } : { parent: "ops", label: "فروشگاه" };
}

export function parentOf(view: ViewId, persona: Persona): SubView | null {
  if (view === "review") return reviewParent(persona);
  return SUB_VIEWS[view] ?? null;
}

/** The route part of the address; Telegram's own `tgWebApp…` parameters are not a route. */
export function routeFromHash(hash: string): Route {
  const raw = String(hash || "").replace(/^#/, "").split("?")[0];
  const route = raw.startsWith("tgWebApp") ? "" : raw.split("&")[0];
  const match = /^(service|ticket)\/(\d{1,10})$/.exec(route);
  if (match?.[1] === "service") return { view: "service", serviceId: Number(match[2]) };
  if (match) return { view: "ticket", ticketId: Number(match[2]) };
  const view = (LEGACY_VIEWS[route] ?? route) as ViewId;
  return { view: KNOWN_VIEWS.has(view) ? view : "home" };
}

function hashFor(route: Route): string {
  if (route.view === "service") return `service/${route.serviceId}`;
  if (route.view === "ticket") return `ticket/${route.ticketId}`;
  return route.view;
}

/* ---------- context ---------- */

export type SheetSpec = {
  title: string;
  /** Rendered inside the bottom sheet; `close` dismisses this sheet only (see useSheetClose). */
  render: (close: () => void) => ReactNode;
};

/** An open sheet; the id lets a late reply close only the sheet that started it. */
export type OpenSheet = SheetSpec & { id: number };

const SheetCloseContext = createContext<(() => void) | null>(null);

/** Provided by the sheet host around a sheet's body. */
export const SheetCloseProvider = SheetCloseContext.Provider;

/**
 * Close the sheet this component is rendered in — and only that one. A reply that lands after
 * the person opened another sheet must not close the new one.
 */
export function useSheetClose(): () => void {
  const scoped = useContext(SheetCloseContext);
  const { closeSheet } = useMini();
  return scoped ?? closeSheet;
}

type Notify = (message: string, kind?: "ok" | "err") => void;

export type MiniContextValue = {
  me: MePayload;
  persona: Persona;
  commerce: boolean;
  customer: CustomerSummary;
  route: Route;
  homeView: ViewId;
  /** A shop's Mini App lists the sections it opened; the platform Mini App has them all. */
  can: (section: string) => boolean;
  features: { walletPay: boolean; qr: boolean; topup: boolean; gift: boolean; manage: boolean; shop: boolean };
  brandName: string;
  go: (view: ViewId, options?: Omit<Route, "view">) => void;
  back: () => void;
  sheet: OpenSheet | null;
  openSheet: (spec: SheetSpec) => number;
  /** Close whatever sheet is open (navigation, back). */
  closeSheet: () => void;
  /** Close the sheet with this id, if it is still the open one. */
  closeSheetIf: (id: number) => void;
  notify: Notify;
  /** Run one action at a time per key; `busy(key)` is true while it runs. */
  run: (key: string, fn: () => Promise<void>) => Promise<void>;
  busy: (key: string) => boolean;
  reloadMe: () => Promise<void>;
  /** After a purchase or a lost response that may have charged the wallet: never auto-retry. */
  showFreshState: (target: { view?: ViewId; serviceId?: number }) => Promise<void>;
  refreshAfterChange: () => Promise<void>;
  openPanelPath: (path: string) => void;
};

const MiniContext = createContext<MiniContextValue | null>(null);

export function useMini(): MiniContextValue {
  const value = useContext(MiniContext);
  if (!value) throw new Error("useMini must be used inside <MiniProvider>");
  return value;
}

/** Toast + haptic, the single feedback channel for every screen. */
export const notify: Notify = (message, kind = "ok") => {
  if (kind === "err") toast.danger(message);
  else toast.success(message);
  haptic(kind === "err" ? "err" : "ok");
};

/** Message for a failed action: «outcome unknown» copy when the reply was lost. */
export function failureText(err: unknown, unknownOutcome: string): string {
  if (isUnknownOutcome(err)) return unknownOutcome;
  // ApiError messages are already safe Persian text; anything else is an internal (English) detail.
  return err instanceof ApiError ? err.message : FALLBACK_ERROR;
}

type ProviderProps = {
  initialMe: MePayload;
  initialRoute: Route;
  onMeChange?: (me: MePayload) => void;
  children: ReactNode;
};

export function MiniProvider({ initialMe, initialRoute, onMeChange, children }: ProviderProps) {
  const [me, setMe] = useState<MePayload>(initialMe);
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const sheetSeq = useRef(0);
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());
  const busyRef = useRef(new Set<string>());

  const persona: Persona = me.persona || "user";
  const commerce = Boolean(me.commerce_allowed);
  const homeView: ViewId = me.nav?.[0]?.id ?? "home";

  const can = useCallback(
    (section: string) => !Array.isArray(me.sections) || me.sections.includes(section),
    [me.sections],
  );

  const viewAllowed = useCallback(
    (view: ViewId) => {
      // The server decides who reviews; the screen shows its answer (including a refusal).
      if (view === "review") return persona === "admin" || persona === "reseller";
      // The owner's own package lives on the platform; a shop's Mini App has no such routes.
      if (view === "subscription") return persona === "reseller" && commerce && !me.shop;
      const section = VIEW_SECTIONS[view];
      if (section && !can(section)) return false;
      if (SUB_VIEWS[view]) return commerce;
      if (view === "home") return true;
      return (me.nav || []).some((item) => item.id === view);
    },
    [can, commerce, me.nav, me.shop, persona],
  );

  const normalize = useCallback(
    (wanted: Route): Route => {
      let view = viewAllowed(wanted.view) ? wanted.view : homeView;
      const serviceId = view === "service" ? Number(wanted.serviceId) || null : null;
      const ticketId = view === "ticket" ? Number(wanted.ticketId) || null : null;
      if (view === "service" && !serviceId) view = "services";
      if (view === "ticket" && !ticketId) view = "support";
      return { view, serviceId, ticketId, then: wanted.then ?? null };
    },
    [homeView, viewAllowed],
  );

  const [route, setRoute] = useState<Route>(() => normalize(initialRoute));

  const closeSheet = useCallback(() => setSheet(null), []);
  const closeSheetIf = useCallback((id: number) => setSheet((open) => (open && open.id === id ? null : open)), []);
  const openSheet = useCallback((spec: SheetSpec) => {
    sheetSeq.current += 1;
    const id = sheetSeq.current;
    setSheet({ ...spec, id });
    return id;
  }, []);

  const go = useCallback(
    (view: ViewId, options: Omit<Route, "view"> = {}) => {
      const next = normalize({ view, ...options });
      setSheet(null);
      setRoute(next);
      const hash = hashFor(next);
      if (window.location.hash.replace(/^#/, "") !== hash) window.history.replaceState(null, "", `#${hash}`);
      window.scrollTo(0, 0);
    },
    [normalize],
  );

  const back = useCallback(() => {
    if (sheet) {
      setSheet(null);
      return;
    }
    const parent = parentOf(route.view, persona);
    if (parent) go(parent.parent);
    else if (route.view !== homeView) go(homeView);
  }, [go, homeView, persona, route.view, sheet]);

  // Android/iOS system back only stays inside a Mini App while Telegram's BackButton is shown.
  // Re-runs when a slow SDK connects after the first screen.
  const telegramConnected = useSyncExternalStore(onTelegramReady, isTelegramConnected, () => false);
  useEffect(() => {
    const show = Boolean(sheet) || route.view !== homeView;
    return bindBackButton(show ? back : null);
  }, [back, homeView, route.view, sheet, telegramConnected]);

  // The address can still change (an old deep link, the browser's own back).
  useEffect(() => {
    const onHash = () => {
      const next = routeFromHash(window.location.hash);
      if (next.view !== route.view || (next.serviceId ?? null) !== (route.serviceId ?? null) || (next.ticketId ?? null) !== (route.ticketId ?? null)) {
        go(next.view, next);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [go, route]);

  const run = useCallback(async (key: string, fn: () => Promise<void>) => {
    if (busyRef.current.has(key)) return;
    busyRef.current.add(key);
    setBusyKeys(new Set(busyRef.current));
    try {
      await fn();
    } finally {
      busyRef.current.delete(key);
      setBusyKeys(new Set(busyRef.current));
    }
  }, []);

  const busy = useCallback((key: string) => busyKeys.has(key), [busyKeys]);

  const applyMe = useCallback(
    (next: MePayload) => {
      setCurrency(next.currency);
      setMe(next);
      onMeChange?.(next);
    },
    [onMeChange],
  );

  const reloadMe = useCallback(async () => {
    applyMe(await api<MePayload>("/api/mini/me"));
  }, [applyMe]);

  const refreshAfterChange = useCallback(async () => {
    invalidateResource("activity");
    resetActivityLimit();
    try {
      await reloadMe();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "err");
    }
  }, [reloadMe]);

  const showFreshState = useCallback(
    async (target: { view?: ViewId; serviceId?: number }) => {
      await refreshAfterChange();
      if (target.serviceId) go("service", { serviceId: target.serviceId });
      else go(target.view ?? homeView);
    },
    [go, homeView, refreshAfterChange],
  );

  const openPanelPath = useCallback(
    (path: string) => {
      const safe = safePanelPath(path);
      if (!safe) return;
      const ops = peekResource<{ panel_base?: string }>("ops");
      const base = (ops?.status === "ready" && ops.data.panel_base) || me.panel_base || "";
      openExternal(String(base).replace(/\/+$/, "") + safe);
    },
    [me.panel_base],
  );

  const customer = me.customer;
  const features = useMemo(
    () => ({
      walletPay: Boolean(customer?.wallet_pay_enabled),
      qr: Boolean(customer?.qr_enabled),
      topup: can("topup"),
      gift: can("codes"),
      manage: can("manage"),
      shop: can("shop"),
    }),
    [can, customer],
  );

  const brandName = me.brand?.name || me.shop?.name || "";

  const value = useMemo<MiniContextValue>(
    () => ({
      me,
      persona,
      commerce,
      customer,
      route,
      homeView,
      can,
      features,
      brandName,
      go,
      back,
      sheet,
      openSheet,
      closeSheet,
      closeSheetIf,
      notify,
      run,
      busy,
      reloadMe,
      showFreshState,
      refreshAfterChange,
      openPanelPath,
    }),
    [me, persona, commerce, customer, route, homeView, can, features, brandName, go, back, sheet, openSheet, closeSheet, closeSheetIf, run, busy, reloadMe, showFreshState, refreshAfterChange, openPanelPath],
  );

  return <MiniContext.Provider value={value}>{children}</MiniContext.Provider>;
}

/** Pull to refresh / «تازه‌سازی»: drop every cached list and read /me again. */
export async function refreshEverything(reloadMe: () => Promise<void>): Promise<void> {
  invalidateAllResources();
  resetActivityLimit();
  await reloadMe();
  if (webApp()) haptic("ok");
}
