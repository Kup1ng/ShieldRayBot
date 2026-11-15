/** Shapes returned by /api/mini/*. Fields the screens do not read stay out on purpose. */

export type Persona = "admin" | "reseller" | "user";

export type ViewId =
  | "home"
  | "services"
  | "service"
  | "shop"
  | "account"
  | "support"
  | "ticket"
  | "club"
  | "review"
  | "ops";

export type NavItem = { id: ViewId; label: string; icon?: string };

export type Brand = {
  name?: string;
  accent?: string;
  logo_url?: string;
  notice?: string;
  [key: string]: unknown;
};

/** One service row on home and in the list ("glance" rows). */
export type ServiceGlance = {
  id: number;
  name?: string;
  title?: string;
  status?: string;
  status_label?: string;
  expires_at?: string | null;
  days_left?: number | null;
  usage_label?: string;
  usage_percent?: number | null;
  [key: string]: unknown;
};

export type HomeSummary = {
  service_count: number;
  attention: ServiceGlance[];
  recent: ServiceGlance[];
};

export type CustomerSummary = {
  wallet: number;
  wallet_pay_enabled: boolean;
  qr_enabled: boolean;
  commerce_allowed: boolean;
  home: HomeSummary;
  badges?: { support?: number; club?: number; [key: string]: number | undefined };
  invite_code?: string;
  [key: string]: unknown;
};

export type MePayload = {
  persona: Persona;
  nav: NavItem[];
  /** Only in a shop's Mini App: the sections that shop has opened. */
  sections?: string[];
  shop?: { name?: string };
  user: { id: number; name: string; role: string; wallet: number };
  currency: string;
  panel_base: string;
  commerce_allowed: boolean;
  brand: Brand;
  customer: CustomerSummary;
};

export type Route = {
  view: ViewId;
  serviceId?: number | null;
  ticketId?: number | null;
  /** A follow-up to run on arrival, e.g. "renew" on a service screen. */
  then?: string | null;
};

export type ResourceName = "plans" | "activity" | "ops" | "topup" | "support" | "guides" | "club" | "review";

export type Resource<T = unknown> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: string };
