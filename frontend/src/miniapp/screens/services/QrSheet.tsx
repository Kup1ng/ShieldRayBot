"use client";

import { api } from "../../core/api";
import { ErrorState } from "../../ui/ScreenState";
import { SheetLoad } from "./SheetStates";
import { useLoad } from "./useLoad";

const BASE64 = /^[A-Za-z0-9+/]+=*$/;

/** The subscription QR (server-rendered PNG). The image never leaves the page as a link. */
export function QrSheet({ serviceId }: { serviceId: number }) {
  const { state, reload } = useLoad(async () => (await api<{ png_base64?: string }>(`/api/mini/service/${serviceId}/qr`)).png_base64 ?? "");
  return (
    <SheetLoad state={state} rows={1} onRetry={() => reload()}>
      {(png) =>
        BASE64.test(png) ? (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-xl bg-white p-3 shadow-[var(--raised-shadow)]">
              <img alt="QR کد لینک اشتراک" src={`data:image/png;base64,${png}`} className="size-64 max-w-full" />
            </div>
            <p className="text-center text-sm text-muted">برای افزودن اشتراک، این کد را در برنامهٔ اتصال اسکن کنید.</p>
          </div>
        ) : (
          <ErrorState message="ساخت QR ناموفق بود." />
        )
      }
    </SheetLoad>
  );
}
