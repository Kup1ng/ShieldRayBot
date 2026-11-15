"use client";

import { Avatar, Button, Chip, Dropdown, Label, Separator, Spinner, Tooltip } from "@heroui/react";
import { AppLayout, Navbar, Sidebar } from "@heroui-pro/react";
import type { ReactNode } from "react";

import { AppToastProvider } from "@/components/feedback/AppToast";
import { ConfirmHost } from "@/components/feedback/ConfirmHost";
import { BrandMark } from "@/components/shell/BrandMark";
import { CrystalBackdrop } from "@/components/shell/CrystalBackdrop";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { Icon } from "@/icons/Icon";
import { useLocation } from "@/lib/location";

import { panelAction } from "../core/api";
import { setConfirmPresenter } from "../core/confirm";
import { PanelSessionProvider, usePanelSession, type NavItem, type NavSection, type SessionState } from "../core/session";

function isCurrent(item: NavItem, path: string, search: string): boolean {
  const [hrefPath, hrefQuery] = item.href.split("?");
  if (hrefQuery && path === hrefPath) return search.includes(hrefQuery);
  if (path === hrefPath) return true;
  return item.match.some((prefix) => prefix !== "/" && (path === prefix || path.startsWith(`${prefix}/`)));
}

function NavDot({ item }: { item: NavItem }) {
  const { session } = usePanelSession();
  const on =
    (item.dot === "inbox" && session.alerts.inbox) ||
    (item.dot === "cancellations" && session.alerts.cancellations) ||
    (item.dot === "tickets" && session.alerts.tickets > 0);
  if (!on) return null;
  return (
    <Sidebar.MenuChip>
      {item.dot === "tickets" ? (
        <Chip size="sm" color="danger" variant="soft">
          <Chip.Label className="num">{session.alerts.tickets.toLocaleString("fa-IR")}</Chip.Label>
        </Chip>
      ) : (
        <span aria-label="مورد تازه" className="inline-block size-2 rounded-full bg-danger" />
      )}
    </Sidebar.MenuChip>
  );
}

function NavMenu({ sections }: { sections: NavSection[] }) {
  const where = useLocation();
  return (
    <>
      {sections.map((section) => (
        <Sidebar.Group key={section.id}>
          <Sidebar.GroupLabel>{section.label}</Sidebar.GroupLabel>
          <Sidebar.Menu aria-label={section.label} showGuideLines={false}>
            {section.items.map((item) => (
              <Sidebar.MenuItem key={item.id} id={`${section.id}:${item.id}`} href={item.href} textValue={item.label} isCurrent={isCurrent(item, where.path, where.search)}>
                <Sidebar.MenuIcon>
                  <Icon name={item.icon} size={20} />
                </Sidebar.MenuIcon>
                <Sidebar.MenuLabel>{item.label}</Sidebar.MenuLabel>
                <NavDot item={item} />
              </Sidebar.MenuItem>
            ))}
          </Sidebar.Menu>
        </Sidebar.Group>
      ))}
    </>
  );
}

function SidebarBrand() {
  const { session } = usePanelSession();
  return (
    <a href="/home" className="flex items-center gap-2.5 rounded-lg px-1 py-2 outline-none focus-visible:ring-2 focus-visible:ring-focus">
      <BrandMark logoUrl={session.brand.logo_url} name={session.brand.name} size={34} />
      <span className="flex min-w-0 flex-col" data-sidebar="label">
        <bdi className="truncate text-base font-semibold text-foreground">{session.brand.name}</bdi>
        {session.version ? (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span aria-hidden className={`size-1.5 rounded-full ${session.version.update_available ? "bg-warning" : "bg-success"}`} />
            <bdi className="ltr num">v{session.version.version}</bdi>
            {session.version.channel_label ? <span>· {session.version.channel_label}</span> : null}
          </span>
        ) : null}
      </span>
    </a>
  );
}

function SidebarUser() {
  const { session } = usePanelSession();
  const name = session.staff.username || "—";
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
      <Avatar size="sm" color="accent" variant="soft">
        <Avatar.Fallback className="text-xs font-semibold">{name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
      </Avatar>
      <div className="flex min-w-0 flex-col" data-sidebar="label">
        <bdi className="truncate text-sm font-medium text-foreground">{name}</bdi>
        <span className="truncate text-xs text-muted">{session.staff.label || session.staff.role}</span>
      </div>
    </div>
  );
}

async function logout() {
  try {
    await panelAction("/logout");
  } finally {
    window.location.assign("/login");
  }
}

function TopBar({ title }: { title: ReactNode }) {
  const { session } = usePanelSession();
  return (
    // The navbar is width:100% by default; auto width lets the side margins come out of the column instead of overflowing it.
    <Navbar maxWidth="full" className="glass !mx-3 !mt-3 !h-[64px] !w-auto !rounded-xl md:!mx-4 md:!mt-4">
      <Navbar.Header className="gap-2 px-3">
        <AppLayout.MenuToggle aria-label="منو" />
        <Sidebar.Trigger aria-label="جمع و باز کردن منو" />
        <h1 className="min-w-0 truncate text-base font-semibold text-foreground">{title}</h1>
        <Navbar.Spacer />
        <Navbar.Content className="gap-1">
          <Tooltip delay={600}>
            <Button isIconOnly variant="ghost" aria-label="راهنما" onPress={() => window.open("/help/", "_blank", "noopener")}>
              <Icon name="solar:question-circle-linear" size={22} />
            </Button>
            <Tooltip.Content>
              <p>راهنما</p>
            </Tooltip.Content>
          </Tooltip>
          <ThemeToggle />
          <Separator orientation="vertical" className="mx-1 h-7" />
          <Dropdown>
            <Button variant="ghost" className="!h-10 gap-2 px-2" aria-label="حساب کاربری">
              <Avatar size="sm" color="accent" variant="soft">
                <Avatar.Fallback className="text-xs font-semibold">{(session.staff.username || "?").slice(0, 2).toUpperCase()}</Avatar.Fallback>
              </Avatar>
            </Button>
            <Dropdown.Popover placement="bottom end" className="min-w-[200px]">
              <Dropdown.Menu
                aria-label="حساب کاربری"
                onAction={(key) => {
                  if (key === "security") window.location.assign("/security");
                  if (key === "logout") void logout();
                }}
              >
                <Dropdown.Item id="security" textValue="امنیت و رمز ورود">
                  <Icon name="solar:shield-keyhole-linear" size={18} className="text-muted" />
                  <Label>امنیت و رمز ورود</Label>
                </Dropdown.Item>
                <Dropdown.Item id="logout" textValue="خروج">
                  <Icon name="solar:logout-2-linear" size={18} className="text-danger" />
                  <Label className="text-danger">خروج</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </Navbar.Content>
      </Navbar.Header>
    </Navbar>
  );
}

function SidebarBody() {
  const { session } = usePanelSession();
  return (
    <>
      <Sidebar.Header>
        <SidebarBrand />
      </Sidebar.Header>
      <Sidebar.Content>
        <NavMenu sections={session.nav} />
      </Sidebar.Content>
      <Sidebar.Footer>
        <SidebarUser />
      </Sidebar.Footer>
    </>
  );
}

function ShellFrame({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <AppLayout
      // Physical right edge (the mobile drawer and edge rules are physical); see .app-shell RTL rule in globals.css.
      sidebarSide="right"
      sidebarVariant="floating"
      sidebarCollapsible="icon"
      toggleShortcut={false}
      navbar={<TopBar title={title} />}
      sidebar={
        <>
          <Sidebar className="panel-sidebar">
            <SidebarBody />
            <Sidebar.Rail />
          </Sidebar>
          <Sidebar.Mobile>
            <SidebarBody />
          </Sidebar.Mobile>
        </>
      }
    >
      <div className="mx-auto w-full max-w-[1280px] px-3 pt-6 pb-10 md:px-6 md:pt-8">{children}</div>
    </AppLayout>
  );
}

function SessionFallback({ state }: { state: SessionState }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="glass flex w-full max-w-sm flex-col items-center gap-3 rounded-xl p-8 text-center">
        {state.status === "error" ? (
          <>
            <Icon name="solar:danger-triangle-bold" size={32} className="text-danger" />
            <p className="text-sm text-foreground/80">{state.message}</p>
            <Button variant="secondary" onPress={() => window.location.reload()}>
              تلاش دوباره
            </Button>
          </>
        ) : (
          <>
            <Spinner size="lg" />
            <p className="text-sm text-muted">در حال بارگذاری…</p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The web panel frame: crystal backdrop, glass floating sidebar on the right (RTL), glass top
 * bar with help, theme switch and account menu, and the page content column.
 */
export function PanelShell({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <>
      <CrystalBackdrop />
      <AppToastProvider />
      <ConfirmHost register={setConfirmPresenter} />
      <PanelSessionProvider fallback={(state) => <SessionFallback state={state} />}>
        <ShellFrame title={title}>{children}</ShellFrame>
      </PanelSessionProvider>
    </>
  );
}
