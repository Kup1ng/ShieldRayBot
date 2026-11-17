"use client";

import { Button, Input, Label, TextField, toast } from "@heroui/react";

import { Icon } from "@/icons/Icon";

import { GlassSection } from "../../ui/Page";
import { Notice } from "../../ui/States";
import type { TabProps } from "./GenericTab";
import type { LinksExtra } from "./types";

const LINKS: Array<[string, string]> = [
  ["renew", "تمدید"],
  ["wallet", "کیف پول"],
  ["support", "پشتیبانی"],
  ["config", "دریافت مجدد کانفیگ"],
  ["gift", "کد هدیه"],
];

async function copyLink(link: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(link);
    toast.success("لینک کپی شد.");
  } catch {
    toast.danger("کپی انجام نشد؛ لینک را دستی انتخاب کنید.");
  }
}

/** Deep links into the bot (renew, wallet, support, …) to hand to a customer. Read-only. */
export function LinksTab({ data }: TabProps<LinksExtra>) {
  const extra = data.extra as LinksExtra;
  return (
    <GlassSection
      title="لینک‌های سریع ربات"
      description={extra.bot_username ? <>ربات: <bdi dir="ltr">{`@${extra.bot_username}`}</bdi> — لینک را برای کاربر بفرستید تا مستقیم وارد همان بخش شود.</> : undefined}
    >
      {extra.bot_username ? null : <Notice tone="warning">یوزرنیم ربات مشخص نیست — اول اتصال ربات را در تب «ربات و اتصال» درست کنید.</Notice>}
      <div className="flex flex-col gap-4">
        {LINKS.map(([key, label]) => {
          const link = extra.links[key];
          return (
            <div key={key} className="flex items-end gap-2">
              <TextField className="min-w-0 flex-1" value={link || "—"} isReadOnly aria-label={`لینک ${label}`}>
                <Label>{label}</Label>
                <Input dir="ltr" className="text-start" />
              </TextField>
              {link ? (
                <Button variant="outline" className="!h-10" aria-label={`کپی لینک ${label}`} onPress={() => void copyLink(link)}>
                  <Icon name="solar:copy-linear" size={18} />
                  کپی
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </GlassSection>
  );
}
