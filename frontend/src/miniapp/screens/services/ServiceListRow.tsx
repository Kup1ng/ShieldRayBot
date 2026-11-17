"use client";

import { Button } from "@heroui/react";

import { ServiceDot } from "./ServiceDot";
import type { ServiceRow } from "./types";

/** Figma "My services": a plain row with the service's name and a small status dot. */
export function ServiceListRow({ service, onOpen }: { service: ServiceRow; onOpen: (id: number) => void }) {
  const id = Number(service.id) || 0;
  return (
    <Button
      variant="ghost"
      onPress={() => onOpen(id)}
      aria-label={`سرویس ${service.username ?? ""}`}
      className="!h-auto min-h-10 !w-full !justify-start !gap-3 !rounded-lg !px-3 !py-2 text-start"
    >
      <ServiceDot service={service} />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span dir="auto" className="w-full min-w-0 truncate text-start text-sm text-foreground/80">
          {service.username || "—"}
        </span>
        {service.error ? <span className="text-xs text-danger">{service.error_message || "دریافت اطلاعات سرویس ناموفق بود؛ دوباره تلاش کنید."}</span> : null}
      </span>
    </Button>
  );
}
