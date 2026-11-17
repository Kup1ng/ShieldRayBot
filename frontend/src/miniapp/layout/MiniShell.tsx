"use client";

import { Separator, Sheet, Spinner } from "@heroui/react";
import { useCallback, type ReactNode } from "react";

import { BrandMark } from "@/components/shell/BrandMark";
import { CrystalBackdrop } from "@/components/shell/CrystalBackdrop";
import { GlassBar } from "@/components/shell/Glass";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { Icon } from "@/icons/Icon";

import { safeLogoPath } from "../core/format";
import { paintTelegramChrome } from "../core/telegram";
import { SheetCloseProvider, refreshEverything, useMini } from "../state/store";
import { ARM_PX, usePullToRefresh } from "../state/usePullToRefresh";
import { ActionButton } from "../ui/ActionButton";
import { ConfirmHost } from "../ui/ConfirmHost";

/** Width of the Mini App column; Telegram Desktop and tablets get the phone layout centred. */
export const MINI_MAX_W = "max-w-[480px]";

function PullIndicator({ offset, armed, loading }: { offset: number; armed: boolean; loading: boolean }) {
  if (!offset && !loading) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-[calc(var(--mini-safe-top)+12px)] z-50 flex justify-center"
      style={{ transform: `translateY(${offset - 40}px)`, opacity: Math.min(1, offset / ARM_PX) }}
    >
      <span className={`glass inline-flex size-10 items-center justify-center rounded-full ${armed ? "text-accent" : "text-muted"}`}>
        {loading ? <Spinner size="sm" /> : <Icon name="solar:refresh-linear" size={20} />}
      </span>
    </div>
  );
}

function SheetHost() {
  const { sheet, closeSheet, closeSheetIf } = useMini();
  const sheetId = sheet?.id ?? 0;
  const closeThis = useCallback(() => closeSheetIf(sheetId), [closeSheetIf, sheetId]);
  return (
    <Sheet isOpen={Boolean(sheet)} onOpenChange={(open) => !open && closeSheet()}>
      <Sheet.Backdrop variant="blur">
        <Sheet.Content className={`mx-auto max-h-[92dvh] w-full ${MINI_MAX_W}`}>
          <Sheet.Dialog className="!rounded-t-xl">
            <Sheet.Handle />
            <Sheet.CloseTrigger aria-label="بستن" />
            {sheet ? (
              <>
                <Sheet.Header>
                  <Sheet.Heading className="text-base font-semibold">{sheet.title}</Sheet.Heading>
                </Sheet.Header>
                <Sheet.Body className="pb-[calc(var(--mini-safe-bottom)+16px)]">
                  <SheetCloseProvider value={closeThis}>{sheet.render(closeThis)}</SheetCloseProvider>
                </Sheet.Body>
              </>
            ) : null}
          </Sheet.Dialog>
        </Sheet.Content>
      </Sheet.Backdrop>
    </Sheet>
  );
}

export function MiniShell({ children }: { children: ReactNode }) {
  const mini = useMini();
  const { route, homeView, go, sheet, me, reloadMe, notify } = mini;
  const pull = usePullToRefresh(
    async () => {
      try {
        await refreshEverything(reloadMe);
      } catch (err) {
        notify(err instanceof Error ? err.message : String(err), "err");
      }
    },
    () => !sheet,
  );
  const atHome = route.view === homeView;

  return (
    <>
      <CrystalBackdrop />
      <PullIndicator {...pull} />
      <div
        className={`mx-auto flex min-h-dvh w-full ${MINI_MAX_W} flex-col gap-6 px-4 pt-[calc(var(--mini-safe-top)+24px)] pb-[calc(var(--mini-safe-bottom)+24px)]`}
        style={{ transform: pull.offset ? `translateY(${pull.offset}px)` : undefined }}
      >
        <GlassBar
          start={<BrandMark logoUrl={safeLogoPath(me.brand?.logo_url)} name={mini.brandName || "ShieldRay"} size={30} />}
          end={
            <>
              <ThemeToggle onChange={paintTelegramChrome} />
              {!atHome ? (
                <>
                  <Separator orientation="vertical" className="h-8" />
                  <ActionButton tone="ink" size="md" onPress={() => go(homeView)}>
                    داشبورد
                  </ActionButton>
                </>
              ) : null}
            </>
          }
        />
        <main className="glass flex flex-1 flex-col gap-6 rounded-xl p-6" aria-live="polite">
          {children}
        </main>
      </div>
      <SheetHost />
      <ConfirmHost />
    </>
  );
}
