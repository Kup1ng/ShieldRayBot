"use client";

/** «Open» beside the bot in Telegram search (BotFather's «Main Mini App»): Telegram offers no API for it, so this card only guides. */

import { Button, Chip, Input, Label, TextField, toast } from "@heroui/react";

import { Icon } from "@/icons/Icon";

import { Ltr } from "../ui/Data";
import { GlassSection } from "../ui/Page";
import { Notice } from "../ui/States";
import type { MainAppGuide } from "./types";

const SHOP_WARNING = "آدرس مینی‌اپ پلتفرم را در ربات فروشگاه وارد نکنید؛ ورود مشتری‌ها با امضای همین ربات بررسی می‌شود و با آدرس دیگری رد می‌شود.";

async function copyUrl(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("آدرس کپی شد.");
  } catch {
    toast.danger("کپی انجام نشد؛ آدرس را دستی انتخاب کنید.");
  }
}

function TelegramStatus({ enabled }: { enabled: boolean | null }) {
  if (enabled === null) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Chip size="sm" color="default" variant="soft">
          <Chip.Label>نامشخص</Chip.Label>
        </Chip>
        <span className="text-muted">پاسخ تلگرام دریافت نشد؛ صفحه را کمی بعد دوباره باز کنید.</span>
      </span>
    );
  }
  return (
    <Chip size="sm" color={enabled ? "success" : "warning"} variant="soft">
      <Chip.Label>{enabled ? "روشن" : "خاموش"}</Chip.Label>
    </Chip>
  );
}

function Steps({ guide }: { guide: MainAppGuide }) {
  return (
    <ol className="flex list-decimal flex-col gap-1 ps-5 text-sm leading-7">
      <li>
        در تلگرام <Ltr>@BotFather</Ltr> را باز کنید و <Ltr>/mybots</Ltr> را بفرستید.
      </li>
      <li>ربات {guide.bot_username ? <Ltr>{`@${guide.bot_username}`}</Ltr> : "خودتان"} را انتخاب کنید.</li>
      <li>
        به ترتیب <Ltr>Bot Settings</Ltr> ← <Ltr>Configure Mini App</Ltr> ← <Ltr>Enable Mini App</Ltr> را بزنید.
      </li>
      <li>آدرس بالا را دقیقاً همان‌طور بفرستید (با https و / آخر). در نسخهٔ جدید BotFather همین گزینه در تنظیمات ربات، بخش Mini App است.</li>
    </ol>
  );
}

function Instructions({ guide, shop }: { guide: MainAppGuide; shop: boolean }) {
  return (
    <>
      <div className="flex items-end gap-2">
        <TextField className="min-w-0 flex-1" value={guide.url} isReadOnly>
          <Label>آدرس مینی‌اپ برای BotFather</Label>
          <Input dir="ltr" className="text-start" />
        </TextField>
        <Button variant="outline" className="!h-10" aria-label="کپی آدرس مینی‌اپ" onPress={() => void copyUrl(guide.url)}>
          <Icon name="solar:copy-linear" size={18} />
          کپی
        </Button>
      </div>
      <Steps guide={guide} />
      {shop ? <p className="text-sm text-muted">{SHOP_WARNING}</p> : null}
      {guide.open_link ? (
        <p className="text-sm text-muted">
          برای امتحان:{" "}
          <a className="text-accent underline-offset-2 hover:underline" href={guide.open_link} target="_blank" rel="noopener noreferrer" dir="ltr">
            {guide.open_link}
          </a>{" "}
          — این لینک را می‌توانید در کانال یا بیو هم بگذارید.
        </p>
      ) : null}
    </>
  );
}

/** Nothing without a guide (a shop's Mini App that is off has none). */
export function MainAppGuideCard({ guide, shop = false }: { guide: MainAppGuide | null | undefined; shop?: boolean }) {
  if (!guide) return null;
  return (
    <GlassSection
      title="دکمهٔ «Open» در جستجوی تلگرام"
      description="با روشن کردن «Main Mini App» در BotFather، کنار نام ربات در نتایج جستجو و در پروفایل ربات دکمهٔ «Open» می‌آید و کاربر بدون استارت ربات، مینی‌اپ را باز می‌کند؛ گزینهٔ «Add to Home Screen» هم در منوی مینی‌اپ ظاهر می‌شود. این تنظیم فقط از BotFather انجام می‌شود و پنل آن را تغییر نمی‌دهد."
    >
      <p className="flex flex-wrap items-center gap-2 text-sm">
        وضعیت در تلگرام: <TelegramStatus enabled={guide.enabled} />
      </p>
      {guide.url ? <Instructions guide={guide} shop={shop} /> : <Notice tone="warning">هنوز آدرس HTTPS مینی‌اپ آماده نیست؛ اول دامنه و گواهی را در تنظیمات سیستم فعال کنید.</Notice>}
    </GlassSection>
  );
}
