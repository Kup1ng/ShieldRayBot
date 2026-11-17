"use client";

import { Chip } from "@heroui/react";

import { IconTile, type TileTone } from "@/components/ui/IconTile";
import { Icon } from "@/icons/Icon";

import { num } from "../../core/format";
import type { ViewId } from "../../types";
import { ShortcutTile } from "../../ui/ShortcutTile";
import { RowButton, type StatSpec } from "./parts";

export type PanelLink = { id: string; label: string; path: string };

export type OpsData = {
  stats?: Record<string, number | undefined>;
  panel_links?: PanelLink[];
  panel_base?: string;
  can_review?: boolean;
  shop?: {
    bot_username?: string;
    active?: boolean;
    billing?: { balance?: number; suspended?: boolean } | null;
  };
};

export const ADMIN_STATS: StatSpec[] = [
  { key: "users", label: "کاربران", icon: "solar:users-group-rounded-bold", tone: "blue" },
  { key: "resellers", label: "نمایندگان", icon: "solar:shop-bold", tone: "purple" },
  { key: "orders", label: "سفارش‌ها", icon: "solar:bill-list-bold", tone: "green" },
  { key: "services", label: "سرویس‌ها", icon: "solar:shield-check-bold", tone: "teal" },
];

export const RESELLER_STATS: StatSpec[] = [
  { key: "users", label: "کاربران", icon: "solar:users-group-rounded-bold", tone: "blue" },
  { key: "orders", label: "سفارش‌ها", icon: "solar:bill-list-bold", tone: "green" },
  { key: "services", label: "سرویس‌ها", icon: "solar:shield-check-bold", tone: "teal" },
  { key: "plans", label: "پلن‌ها", icon: "solar:tag-bold", tone: "purple" },
];

export const SHOP_PEEK_STATS: StatSpec[] = [
  { key: "users", label: "کاربران", icon: "solar:users-group-rounded-bold", tone: "blue" },
  { key: "orders", label: "سفارش‌ها", icon: "solar:bill-list-bold", tone: "green" },
  { key: "pending", label: "رسید معلق", icon: "solar:clock-circle-bold", tone: "yellow" },
  { key: "tickets", label: "تیکت باز", icon: "solar:headphones-round-bold", tone: "pink" },
];

type AttentionSpec = { statKey: string; label: string; linkId: string; inAppView: ViewId | null; icon: string; tone: TileTone };

const ATTENTION: AttentionSpec[] = [
  { statKey: "pending", label: "رسیدهای در انتظار تأیید", linkId: "finance", inAppView: "review", icon: "solar:bill-check-bold", tone: "yellow" },
  { statKey: "tickets", label: "تیکت‌های باز", linkId: "tickets", inAppView: null, icon: "solar:headphones-round-bold", tone: "pink" },
];

/** Views the server lets this account open inside the Mini App (the receipt queue only for reviewers). */
function inAppAttention(ops: OpsData): Set<ViewId> {
  return new Set<ViewId>(ops.can_review ? ["review"] : []);
}

/** Counts that need someone to act: the in-app screen when allowed, else the panel page, else just the number. */
export function AttentionList({ ops, onGo, onPanel }: { ops: OpsData; onGo: (view: ViewId) => void; onPanel: (path: string) => void }) {
  const stats = ops.stats ?? {};
  const links = new Map((ops.panel_links ?? []).map((link) => [link.id, link]));
  const inApp = inAppAttention(ops);
  const rows = ATTENTION.filter((spec) => Number(stats[spec.statKey]) > 0);
  if (!rows.length) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-lg bg-success/12 p-3 text-sm text-foreground">
        <Icon name="solar:check-circle-bold" size={22} className="text-success" />
        کار معوقی نیست.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {rows.map((spec) => {
        const count = <Chip size="sm" variant="soft" color="danger"><Chip.Label><span className="num">{num(stats[spec.statKey])}</span></Chip.Label></Chip>;
        const link = links.get(spec.linkId);
        const view = spec.inAppView;
        if (view && inApp.has(view)) {
          return <RowButton key={spec.statKey} icon={spec.icon} tone={spec.tone} title={spec.label} trailing={count} onPress={() => onGo(view)} />;
        }
        if (link) {
          return <RowButton key={spec.statKey} icon={spec.icon} tone={spec.tone} title={spec.label} trailing={count} onPress={() => onPanel(link.path)} />;
        }
        return (
          <div key={spec.statKey} className="inset-tile flex min-h-12 items-center gap-3 rounded-lg p-2 pe-3">
            <IconTile icon={spec.icon} tone={spec.tone} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{spec.label}</span>
            {count}
          </div>
        );
      })}
    </div>
  );
}

const PANEL_LINK_LOOKS: Record<string, { icon: string; tone: TileTone }> = {
  dashboard: { icon: "solar:chart-2-bold", tone: "blue" },
  home: { icon: "solar:chart-2-bold", tone: "blue" },
  finance: { icon: "solar:wallet-bold", tone: "green" },
  users: { icon: "solar:users-group-rounded-bold", tone: "blue" },
  resellers: { icon: "solar:shop-bold", tone: "purple" },
  tickets: { icon: "solar:headphones-round-bold", tone: "pink" },
  shop: { icon: "solar:settings-bold", tone: "teal" },
};

const FALLBACK_LOOK = { icon: "solar:square-arrow-right-up-linear", tone: "purple" as TileTone };

/** Badge counts on web-panel tiles: open tickets, and receipts only when they are not reviewed in the app. */
export function opsPanelBadges(ops: OpsData): Record<string, number | undefined> {
  const stats = ops.stats ?? {};
  return { tickets: stats.tickets, finance: ops.can_review ? 0 : stats.pending };
}

/** In-app shortcuts first (receipt review when allowed), then one tile per web-panel link. */
export function PanelShortcuts({ ops, onGo, onPanel }: { ops: OpsData; onGo: (view: ViewId) => void; onPanel: (path: string) => void }) {
  const badges = opsPanelBadges(ops);
  const links = ops.panel_links ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        {ops.can_review ? (
          <ShortcutTile icon="solar:bill-check-bold" tone="yellow" label="بررسی رسیدها" badge={ops.stats?.pending} onPress={() => onGo("review")} />
        ) : null}
        {links.map((link) => {
          const look = PANEL_LINK_LOOKS[link.id] ?? FALLBACK_LOOK;
          return <ShortcutTile key={link.id} icon={look.icon} tone={look.tone} label={link.label} badge={badges[link.id]} onPress={() => onPanel(link.path)} />;
        })}
      </div>
      {links.length ? null : <p className="text-xs text-muted">آدرس پنل وب در دسترس نیست.</p>}
    </div>
  );
}
