"use client";

import { Button } from "@heroui/react";
import { useState, type ReactNode } from "react";

import { Icon } from "@/icons/Icon";

import { GlassSection } from "../ui/Page";
import type { ChatPreview } from "./previewLogic";

/** The form beside its preview card (the card stacks below on narrow screens). */
export const PREVIEW_LAYOUT = "grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]";

const TONE_CLASS: Record<string, string> = {
  default: "bg-surface-secondary text-foreground",
  primary: "bg-accent/20 text-foreground",
  success: "bg-success/20 text-foreground",
  danger: "bg-danger/20 text-foreground",
};

/** A closed card with the way to open the preview: it is drawn only when asked for, like the old page. */
function PreviewGate({ title, children }: { title: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <GlassSection title={title} className="xl:sticky xl:top-4">
      {open ? (
        <>
          {children(() => setOpen(false))}
          <Button size="sm" variant="ghost" onPress={() => setOpen(false)} className="self-start">
            بستن پیش‌نمایش
          </Button>
        </>
      ) : (
        <Button variant="outline" onPress={() => setOpen(true)} className="self-start">
          <Icon name="solar:eye-linear" size={18} />
          نمایش پیش‌نمایش
        </Button>
      )}
    </GlassSection>
  );
}

function Phone({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="mx-auto flex w-full max-w-[340px] flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      {children}
    </div>
  );
}

function Avatar({ letter, src }: { letter: string; src?: string }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-sm font-bold text-accent-foreground">
      {src ? <img src={src} alt="" className="size-full object-cover" /> : letter}
    </span>
  );
}

function ReplyKeyboard({ keys, compact }: { keys: ChatPreview["keys"]; compact: boolean }) {
  if (!keys.length) return null;
  const rows: ChatPreview["keys"][] = [];
  const size = compact ? 2 : 1;
  for (let i = 0; i < keys.length; i += size) rows.push(keys.slice(i, i + size));
  return (
    <div className="flex flex-col gap-1 border-t border-border bg-surface-secondary/60 p-2" aria-label="کیبورد پایین تلگرام">
      {rows.map((row, index) => (
        <div key={index} className="flex gap-1">
          {row.map((key) => (
            <span key={key.styleId} className={`flex-1 truncate rounded-md px-2 py-1.5 text-center text-xs ${TONE_CLASS[key.tone] ?? TONE_CLASS.default}`}>
              {key.label}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The bot's chat as it would look with the values in the form (a closed card until the staff member opens it). */
export function ChatPreviewCard({ model, compact, qrBackground }: { model: ChatPreview; compact: boolean; qrBackground?: string }) {
  return (
    <PreviewGate title="پیش‌نمایش تلگرام">
      {() => (
        <div className="flex flex-col gap-2">
          <Phone label="پیش‌نمایش گفتگوی ربات در تلگرام">
            <div className="flex items-center gap-3 border-b border-border p-3">
              <Avatar letter="ک" />
              <div className="flex min-w-0 flex-col">
                <strong className="truncate text-sm">{model.title}</strong>
                <small className="text-xs text-muted">ربات · آنلاین</small>
              </div>
            </div>
            <div className="flex min-h-48 flex-col gap-2 p-3">
              {model.text ? <div className="max-w-[90%] self-start whitespace-pre-line rounded-xl rounded-ss-sm bg-surface-secondary p-3 text-sm leading-6">{model.text}</div> : null}
              {model.showQr ? (
                <div className="flex max-w-[90%] flex-col gap-2 self-start rounded-xl bg-surface-secondary p-3">
                  <div className="flex size-32 items-center justify-center overflow-hidden rounded-lg border border-border bg-background text-lg font-bold text-muted">
                    {qrBackground ? <img src={qrBackground} alt="" className="size-full object-cover" /> : "QR"}
                  </div>
                  <p className="whitespace-pre-line text-xs leading-5">{model.qrCaption}</p>
                </div>
              ) : null}
            </div>
            <ReplyKeyboard keys={model.keys} compact={compact} />
            <div className="border-t border-border p-3 text-xs text-muted">پیام…</div>
          </Phone>
          {model.hint ? <p className="text-xs text-muted">{model.hint}</p> : null}
        </div>
      )}
    </PreviewGate>
  );
}

export type ProfilePreview = { name: string; username: string; about: string; middle: string; photo: string };

/** The bot's Telegram profile and empty chat as it would look with the identity form's values. */
export function ProfilePreviewCard({ model }: { model: ProfilePreview }) {
  const name = model.name || "نام ربات";
  return (
    <PreviewGate title="پیش‌نمایش هویت ربات">
      {() => (
        <Phone label="پیش‌نمایش پروفایل ربات در تلگرام">
          <div className="flex flex-col items-center gap-1 border-b border-border p-4">
            <Avatar letter={name.slice(0, 1)} src={model.photo} />
            <strong className="text-sm">{name}</strong>
            <small dir="ltr" className="text-xs text-muted">{`@${model.username || "bot"}`}</small>
            <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs">ربات</span>
          </div>
          <div className="border-b border-border p-3">
            <div className="text-xs text-muted">درباره</div>
            <div className="whitespace-pre-line text-sm">{model.about || "کپشن / درباره ربات…"}</div>
          </div>
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 p-4 text-center">
            <Avatar letter={name.slice(0, 1)} src={model.photo} />
            <strong className="text-sm">{name}</strong>
            <p className="whitespace-pre-line text-xs text-muted">{model.middle || "متن وسط صفحه…"}</p>
          </div>
        </Phone>
      )}
    </PreviewGate>
  );
}
