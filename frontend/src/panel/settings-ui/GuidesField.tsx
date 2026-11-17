"use client";

import { Button } from "@heroui/react";
import { useMemo, useState, type ReactNode } from "react";

import { Icon } from "@/icons/Icon";

import { confirm } from "../core/confirm";
import { usePanelSession } from "../core/session";
import { SelectInput, SwitchInput, TextAreaInput, TextInput } from "../ui/Fields";
import { answerError, postForm } from "./rawPost";
import { blankGuide, GUIDE_LINK_SLOTS, parseGuides, serializeGuides, type GuideLink, type GuideRow } from "./logic";
import type { GuideMediaItem, GuidesExtra, StyleOption } from "./types";

const MAX_MEDIA = 10;
const AUDIENCES = [
  { id: "user", label: "کاربران" },
  { id: "reseller", label: "نمایندگان" },
];
/** Telegram's four button colors; a page whose payload carries its own list passes it instead. */
export const DEFAULT_STYLE_OPTIONS: StyleOption[] = [
  { value: "", label: "سفید", tone: "default" },
  { value: "primary", label: "آبی", tone: "primary" },
  { value: "success", label: "سبز", tone: "success" },
  { value: "danger", label: "قرمز", tone: "danger" },
];

type MediaAnswer = { ok?: boolean; media?: GuideMediaItem[]; error?: string };

/** Photos and videos of one saved guide: upload, order and remove, each through its own endpoint. */
function GuideMedia({ guideId, base, items, saved, onItems }: { guideId: string; base: string; items: GuideMediaItem[]; saved: boolean; onItems: (items: GuideMediaItem[]) => void }) {
  const { session } = usePanelSession();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (action: "upload" | "delete" | "move", fields: Record<string, string | Blob>) => {
    setBusy(true);
    setStatus(action === "upload" ? "در حال آپلود…" : "");
    const answer = await postForm<MediaAnswer>(`${base}/${action}`, { guide_id: guideId, ...fields }, session.csrf_token);
    setBusy(false);
    if (answer.body?.ok && answer.body.media) {
      onItems(answer.body.media);
      setStatus(action === "upload" ? "فایل اضافه شد." : "");
    } else {
      setStatus(answerError(answer));
    }
  };
  const remove = async (item: GuideMediaItem) => {
    const sure = await confirm("این فایل از آموزش حذف شود؟", { description: "این کار برگشت ندارد.", confirmLabel: "حذف فایل", tone: "danger" });
    if (sure) await send("delete", { media_id: item.id });
  };
  const label = (item: GuideMediaItem, index: number) => `${item.kind === "video" ? "ویدیو" : "عکس"} ${index + 1}`;

  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium text-foreground">{`عکس و ویدیو (حداکثر ${MAX_MEDIA} فایل)`}</legend>
      {items.length ? (
        <ul className="flex flex-col gap-1.5">
          {items.map((item, index) => (
            <li key={item.id} className="inset-tile flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2">
              <span className="flex items-center gap-2 text-sm">
                <Icon name={item.kind === "video" ? "solar:videocamera-record-linear" : "solar:gallery-linear"} size={18} />
                {item.preview ? (
                  <a href={item.preview} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">
                    {label(item, index)}
                  </a>
                ) : (
                  label(item, index)
                )}
                {item.missing ? <span className="text-xs text-danger">فایل ندارد، دوباره آپلود کنید</span> : null}
                {item.from_bot ? <span className="text-xs text-muted">از ربات</span> : null}
              </span>
              <span className="flex items-center gap-1">
                <Button isIconOnly size="sm" variant="ghost" isDisabled={busy || index === 0} aria-label="جابه‌جایی به قبل" onPress={() => void send("move", { media_id: item.id, direction: "up" })}>
                  <Icon name="solar:alt-arrow-up-linear" size={18} />
                </Button>
                <Button isIconOnly size="sm" variant="ghost" isDisabled={busy || index === items.length - 1} aria-label="جابه‌جایی به بعد" onPress={() => void send("move", { media_id: item.id, direction: "down" })}>
                  <Icon name="solar:alt-arrow-down-linear" size={18} />
                </Button>
                <Button isIconOnly size="sm" variant="ghost" isDisabled={busy} aria-label={`حذف ${label(item, index)}`} onPress={() => void remove(item)}>
                  <Icon name="solar:trash-bin-minimalistic-linear" size={18} />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">هنوز فایلی اضافه نشده است.</p>
      )}
      {items.length < MAX_MEDIA ? (
        <label className="inset-tile flex w-fit cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-focus">
          <Icon name="solar:upload-linear" size={18} />
          افزودن عکس یا ویدیو
          <input
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,image/webp,video/mp4"
            disabled={busy || !saved}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void send("upload", { file });
            }}
          />
        </label>
      ) : null}
      <p className="text-xs text-muted">عکس تا ۱۰ مگابایت، ویدیوی MP4 تا ۵۰ مگابایت. {saved ? "JPG، PNG، WEBP یا MP4." : "برای آموزش تازه، اول تنظیمات را ذخیره کنید."}</p>
      {status ? (
        <p role="status" className="text-xs text-muted">
          {status}
        </p>
      ) : null}
    </fieldset>
  );
}

function LinkRows({ links, onChange }: { links: GuideLink[]; onChange: (links: GuideLink[]) => void }) {
  const rows = links.length ? links : [{ label: "", url: "" }];
  const patch = (index: number, change: Partial<GuideLink>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">لینک ویدیو (یوتیوب یا تلگرام، اختیاری)</legend>
      {rows.map((row, index) => (
        <div key={index} className="flex items-end gap-2">
          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
            <TextInput label="متن دکمه" value={row.label} onChange={(label) => patch(index, { label })} maxLength={48} placeholder="▶️ دیدن ویدیو" />
            <TextInput label="لینک" value={row.url} onChange={(url) => patch(index, { url })} maxLength={512} ltr placeholder="https://youtu.be/…" />
          </div>
          <Button isIconOnly size="sm" variant="ghost" aria-label="حذف این لینک" onPress={() => onChange(rows.length > 1 ? rows.filter((_, i) => i !== index) : [])}>
            <Icon name="solar:close-circle-linear" size={20} />
          </Button>
        </div>
      ))}
      {rows.length < GUIDE_LINK_SLOTS ? (
        <div>
          <Button size="sm" variant="outline" onPress={() => onChange([...rows, { label: "", url: "" }])}>
            <Icon name="solar:add-circle-linear" size={18} />
            افزودن لینک
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

function GuideCard({ guide, styles, onChange, onRemove, media }: { guide: GuideRow; styles: Array<{ id: string; label: string }>; onChange: (change: Partial<GuideRow>) => void; onRemove: () => void; media: ReactNode }) {
  return (
    <div className="inset-tile flex flex-col gap-4 rounded-lg p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextInput label="عنوان دکمه" value={guide.title} onChange={(title) => onChange({ title })} maxLength={64} placeholder="مثلاً V2Box" />
        <SelectInput label="مخاطب" value={guide.audience} options={AUDIENCES} onChange={(audience) => onChange({ audience: audience === "reseller" ? "reseller" : "user" })} />
        <TextInput label="ترتیب" type="number" value={guide.sort} onChange={(sort) => onChange({ sort })} />
        <SelectInput label="رنگ دکمه" value={guide.style} options={styles} onChange={(style) => onChange({ style })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SwitchInput label="فعال" checked={guide.enabled} onChange={(enabled) => onChange({ enabled })} />
        <SwitchInput label="دکمه لینک اشتراک" checked={guide.deep_link} onChange={(deep_link) => onChange({ deep_link })} />
      </div>
      <TextAreaInput label="متن آموزش" rows={4} value={guide.body} onChange={(body) => onChange({ body })} />
      <LinkRows links={guide.links} onChange={(links) => onChange({ links })} />
      {media}
      <div>
        <Button size="sm" variant="danger-soft" onPress={onRemove}>
          <Icon name="solar:trash-bin-minimalistic-linear" size={18} />
          حذف آموزش
        </Button>
      </div>
    </div>
  );
}

/**
 * The connection guides editor; the form carries the guides as the JSON the handler stores. Photos
 * and videos attach only to guides the server already holds and exist only where the page sends
 * `guides` (their endpoint and current files).
 */
export function GuidesField({
  label,
  help,
  value,
  onChange,
  guides,
  styleOptions = DEFAULT_STYLE_OPTIONS,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (value: string) => void;
  guides?: GuidesExtra;
  styleOptions?: StyleOption[];
}) {
  const [rows, setRows] = useState<GuideRow[]>(() => {
    const parsed = parseGuides(value);
    return parsed.length ? parsed : [blankGuide()];
  });
  const [media, setMedia] = useState(guides?.media ?? {});
  // `value` is the saved one while the field mounts; a save re-mounts the form from the server's data.
  const [savedIds] = useState(() => new Set(parseGuides(value).map((guide) => guide.id)));
  const styles = useMemo(() => styleOptions.map((option) => ({ id: option.value, label: option.label })), [styleOptions]);
  const commit = (next: GuideRow[]) => {
    setRows(next);
    onChange(serializeGuides(next));
  };
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {help ? <p className="text-xs text-muted">{help}</p> : null}
      {rows.map((guide, index) => (
        <GuideCard
          key={guide.id}
          guide={guide}
          styles={styles}
          onChange={(change) => commit(rows.map((row, i) => (i === index ? { ...row, ...change } : row)))}
          onRemove={() => commit(rows.length > 1 ? rows.filter((_, i) => i !== index) : [blankGuide()])}
          media={
            guides ? (
              <GuideMedia
                guideId={guide.id}
                base={guides.media_base}
                items={media[guide.id] ?? []}
                saved={savedIds.has(guide.id)}
                onItems={(items) => setMedia((prev) => ({ ...prev, [guide.id]: items }))}
              />
            ) : null
          }
        />
      ))}
      <div>
        <Button size="sm" variant="outline" onPress={() => commit([...rows, blankGuide(rows.length)])}>
          <Icon name="solar:add-circle-linear" size={18} />
          افزودن آموزش
        </Button>
      </div>
    </fieldset>
  );
}
