"use client";

import { Button } from "@heroui/react";
import { useState, type FormEvent } from "react";

import { Icon } from "@/icons/Icon";

import { run, usePending } from "../../core/actions";
import { TextAreaInput, TextInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { Notice } from "../../ui/States";
import { SaveBar } from "../../settings-ui/GroupSections";
import { ProfilePreviewCard, PREVIEW_LAYOUT } from "../../settings-ui/TelegramPreview";
import { useFilePreview } from "../../settings-ui/useFilePreview";
import type { TabProps } from "./GenericTab";
import type { AppearanceExtra } from "./types";

const PATH = "/settings?tab=appearance";
const NAME_MAX = 64;
const SHORT_MAX = 120;
const DESCRIPTION_MAX = 512;

/** The bot's Telegram profile (name, about text, first-chat text, photo), applied through the Bot API on save. */
export function AppearanceTab({ data, reload }: TabProps<AppearanceExtra>) {
  const extra = data.extra as AppearanceExtra;
  const [name, setName] = useState(extra.name);
  const [about, setAbout] = useState(extra.short_description);
  const [middle, setMiddle] = useState(extra.description);
  const [photo, setPhoto] = useState<File | undefined>();
  const { pending, track } = usePending();
  const photoUrl = useFilePreview(photo);

  const fields = () => ({
    bot_tg_name: name,
    bot_tg_short_description: about,
    bot_tg_description: middle,
    ...(photo ? { bot_tg_photo: photo } : {}),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    void track(async () => {
      const result = await run(PATH, fields(), { success: "هویت ربات در تلگرام اعمال شد" });
      if (!result || result.ok) reload();
    });
  };
  const removePhoto = () =>
    track(async () => {
      const result = await run(PATH, { ...fields(), bot_tg_photo_clear: "1" }, { ask: { title: "عکس پروفایل ربات از تلگرام حذف شود؟", confirmLabel: "تأیید", tone: "danger" }, success: "هویت ربات در تلگرام اعمال شد" });
      if (result?.ok) reload();
    });

  return (
    <div className={PREVIEW_LAYOUT}>
      <form onSubmit={submit} className="flex min-w-0 flex-col gap-6">
        <GlassSection
          title="هویت در تلگرام"
          description={
            <>
              این مقادیر مستقیم با Bot API روی پروفایل ربات اعمال می‌شوند (<bdi dir="ltr">setMyName</bdi>، <bdi dir="ltr">setMyShortDescription</bdi>، <bdi dir="ltr">setMyDescription</bdi>، <bdi dir="ltr">setMyProfilePhoto</bdi>).
              {extra.username ? (
                <>
                  {" "}
                  ربات فعلی: <bdi dir="ltr">{`@${extra.username}`}</bdi>
                </>
              ) : null}
            </>
          }
        >
          {extra.sync_error ? (
            <Notice tone="danger" title="خواندن از تلگرام ناموفق بود">
              {extra.sync_error}
            </Notice>
          ) : extra.sync_ok ? (
            <Notice tone="success">مقادیر فعلی از تلگرام خوانده شد.</Notice>
          ) : null}
          <TextInput label="نام نمایشی ربات" value={name} onChange={setName} required maxLength={NAME_MAX} help={`حداکثر ${NAME_MAX} کاراکتر — در هدر چت و پروفایل دیده می‌شود`} />
          <TextAreaInput label="کپشن / درباره ربات" rows={3} value={about} onChange={(value) => setAbout(value.slice(0, SHORT_MAX))} help={`حداکثر ${SHORT_MAX} کاراکتر — متن About در صفحه پروفایل و هنگام اشتراک‌گذاری ربات`} />
          <TextAreaInput label="متن وسط صفحه (اولین نمایش)" rows={4} value={middle} onChange={(value) => setMiddle(value.slice(0, DESCRIPTION_MAX))} help={`حداکثر ${DESCRIPTION_MAX} کاراکتر — همان متنی که وسط چت خالی قبل از /start دیده می‌شود`} />
          <div className="flex flex-col gap-2">
            <strong className="text-sm font-medium text-foreground">عکس پروفایل</strong>
            {extra.photo_url && !photo ? (
              <div className="flex items-center gap-3">
                <img src={extra.photo_url} alt="عکس فعلی" className="size-16 rounded-full border border-border object-cover" />
                <Button size="sm" variant="danger-soft" isPending={pending} onPress={() => void removePhoto()}>
                  حذف فایل آپلودشده
                </Button>
              </div>
            ) : null}
            <label className="inset-tile flex w-fit cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-focus">
              <Icon name="solar:upload-linear" size={18} />
              {photo ? photo.name : "انتخاب عکس پروفایل"}
              <input
                type="file"
                className="sr-only"
                accept=".jpg,.jpeg,image/jpeg"
                onChange={(event) => {
                  setPhoto(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <p className="text-xs text-muted">فقط JPG — از API تلگرام روی پروفایل ربات ست می‌شود</p>
          </div>
        </GlassSection>
        <SaveBar label="ذخیره و اعمال در تلگرام" pending={pending} />
      </form>
      <ProfilePreviewCard model={{ name, username: extra.username, about, middle, photo: photoUrl || extra.photo_url }} />
    </div>
  );
}
