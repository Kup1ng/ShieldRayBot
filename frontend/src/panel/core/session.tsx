"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { panelGet, setCsrfToken } from "./api";

export type NavItem = {
  id: string;
  href: string;
  label: string;
  icon: string;
  match: string[];
  dot: "inbox" | "tickets" | "cancellations" | null;
};

export type NavSection = { id: "system" | "shop" | "pg"; label: string; items: NavItem[] };

export type PanelSession = {
  staff: { username: string; role: string; kind: string | null; label: string | null; pg_role_name: string | null; chips: string[] };
  is_owner: boolean;
  nav: NavSection[];
  alerts: { tickets: number; inbox: boolean; cancellations: boolean };
  brand: { name: string; logo_url: string; has_custom_logo: boolean };
  version: { version: string; channel: string; channel_label: string; update_available: boolean } | null;
  csrf_token: string;
};

type SessionState =
  | { status: "loading" }
  | { status: "ready"; session: PanelSession }
  | { status: "error"; message: string };

type SessionContextValue = {
  session: PanelSession;
  /** Re-read the session (after a settings change, a new alert…). */
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function usePanelSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("usePanelSession must be used inside <PanelSessionProvider>");
  return value;
}

async function loadSession(): Promise<SessionState> {
  try {
    const session = await panelGet<PanelSession>("/api/panel/session");
    setCsrfToken(session.csrf_token);
    return { status: "ready", session };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

export function PanelSessionProvider({ children, fallback }: { children: ReactNode; fallback: (state: SessionState) => ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    void loadSession().then(setState);
  }, []);

  const refresh = useCallback(async () => {
    const next = await loadSession();
    if (next.status === "ready") setState(next);
  }, []);

  if (state.status !== "ready") return <>{fallback(state)}</>;
  return <SessionContext.Provider value={{ session: state.session, refresh }}>{children}</SessionContext.Provider>;
}

export type { SessionState };
