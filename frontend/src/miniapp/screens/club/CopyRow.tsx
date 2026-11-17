"use client";

import { Button, Tooltip } from "@heroui/react";

import { Icon } from "@/icons/Icon";

import { copyText } from "../../core/format";
import { useMini } from "../../state/store";

/** A labelled value (link, code) with a copy button; the value stays left-to-right. */
export function CopyRow({ label, value }: { label: string; value: string }) {
  const { notify } = useMini();
  const copy = async () => {
    const ok = await copyText(value);
    notify(ok ? "کپی شد" : "کپی انجام نشد", ok ? "ok" : "err");
  };
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface/70 p-2 ps-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs text-muted">{label}</span>
        <bdi className="ltr truncate text-sm font-semibold text-foreground">{value}</bdi>
      </div>
      <Tooltip delay={600}>
        <Button isIconOnly size="sm" variant="ghost" aria-label={`کپی ${label}`} onPress={() => void copy()}>
          <Icon name="solar:copy-linear" size={22} />
        </Button>
        <Tooltip.Content>
          <p>کپی</p>
        </Tooltip.Content>
      </Tooltip>
    </div>
  );
}
