"use client";

/** «پشتیبان‌ها»: the Telegram support contacts and the support texts of the shop's bot. */

import { Button, Tabs } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { run, usePending } from "../../../core/actions";
import { useJson } from "../../../core/data";
import { FormModal, SelectInput, SubmitButton, SwitchInput, TextInput } from "../../../ui/Fields";
import { GlassSection } from "../../../ui/Page";
import { ErrorBlock, LoadingBlock } from "../../../ui/States";
import { newGuideId } from "../../../settings-ui/logic";
import { INHERIT_STYLE, serializeContacts, type Contact } from "../settings/contacts";
import { ShopSettingsForm } from "../settings/ShopSettingsForm";
import type { StyleOption, SupportsPayload } from "../types";

const NEXT_AFTER_TEXT_SAVE = "/tickets?supports=1&stab=text";
const TITLE_MAX = 80;

function blankContact(sort: number): Contact {
  return { id: newGuideId(), title: "", telegram: "", sort, enabled: true, style: INHERIT_STYLE };
}

function ContactsForm({ payload, reload }: { payload: SupportsPayload; reload: () => void }) {
  const [rows, setRows] = useState<Contact[]>(() =>
    payload.contacts.length
      ? payload.contacts.map((contact) => ({ id: contact.id, title: contact.title, telegram: contact.telegram, sort: contact.sort, enabled: contact.enabled, style: contact.button_style === null ? INHERIT_STYLE : contact.button_style }))
      : [blankContact(0)],
  );
  const { pending, track } = usePending();
  const patch = (index: number, change: Partial<Contact>) => setRows((current) => current.map((row, position) => (position === index ? { ...row, ...change } : row)));
  const options = (styles: StyleOption[]) => styles.map((style) => ({ id: style.value, label: style.label }));
  const save = () =>
    track(async () => {
      const result = await run(payload.save_action, { support_contacts: serializeContacts(rows) }, { success: "پشتیبان‌ها ذخیره شد." });
      if (!result || result.ok) reload();
    });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <GlassSection
        title="پشتیبان‌های تلگرام"
        description="اگر فقط یک پشتیبان فعال باشد، دکمه پشتیبانی در بات مستقیم به چت او می‌رود. اگر چند پشتیبان فعال باشد، لیست برای انتخاب کاربر باز می‌شود. بدون پشتیبان، همان سیستم تیکت قبلی نمایش داده می‌شود. چند پشتیبان را اضافه یا حذف کنید و در پایان یک‌بار ذخیره کنید."
      >
        {rows.map((row, index) => (
          <div key={row.id} className="inset-tile flex flex-col gap-3 rounded-lg p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput label="عنوان" value={row.title} onChange={(title) => patch(index, { title })} maxLength={TITLE_MAX} placeholder="مثلاً پشتیبان ربات" />
              <TextInput label="آیدی / یوزرنیم تلگرام" value={row.telegram} onChange={(telegram) => patch(index, { telegram })} ltr placeholder="@username یا 123456789" />
              <TextInput label="ترتیب" value={String(row.sort)} onChange={(sort) => patch(index, { sort: Number.parseInt(sort, 10) || 0 })} type="number" />
              <SelectInput label="رنگ دکمه در ربات" value={row.style} onChange={(style) => patch(index, { style })} options={options(payload.style_options)} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SwitchInput label="فعال" checked={row.enabled} onChange={(enabled) => patch(index, { enabled })} />
              <Button size="sm" variant="ghost" className="text-danger" onPress={() => setRows((current) => (current.length > 1 ? current.filter((_, position) => position !== index) : [blankContact(0)]))}>
                <Icon name="solar:trash-bin-minimalistic-linear" size={18} />
                حذف
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button size="sm" variant="outline" onPress={() => setRows((current) => [...current, blankContact(current.length)])}>
            <Icon name="solar:add-circle-linear" size={18} />
            افزودن
          </Button>
        </div>
      </GlassSection>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>ذخیره پشتیبان‌ها</SubmitButton>
      </div>
    </form>
  );
}

function Body({ tab, onTab }: { tab: string; onTab: (tab: string) => void }) {
  const state = useJson<SupportsPayload>("/api/panel/tickets/supports");
  const data = state.data;
  if (!data) return state.status === "error" ? <ErrorBlock message={state.message} onRetry={state.reload} /> : <LoadingBlock rows={4} />;
  const signature = JSON.stringify(data.contacts);
  const textAction = `${data.text_action}&next=${encodeURIComponent(NEXT_AFTER_TEXT_SAVE)}`;
  return (
    <div className="flex flex-col gap-4">
      <Tabs selectedKey={tab} onSelectionChange={(key) => onTab(String(key))}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="تب‌های پشتیبانی">
            <Tabs.Tab id="contacts">
              پشتیبان‌های تلگرام
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="text">
              متن پشتیبانی
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
      {tab === "text" ? (
        data.sections.length ? (
          <ShopSettingsForm key={JSON.stringify(data.sections)} tab="text" sections={data.sections} action={textAction} reload={state.reload} />
        ) : (
          <p className="text-sm text-muted">متنی برای ویرایش تعریف نشده است.</p>
        )
      ) : (
        <ContactsForm key={signature} payload={data} reload={state.reload} />
      )}
    </div>
  );
}

export function SupportsDialog({ open, tab, onTab, onClose }: { open: boolean; tab: string; onTab: (tab: string) => void; onClose: () => void }) {
  return (
    <FormModal isOpen={open} onOpenChange={(next) => !next && onClose()} title="پشتیبان‌ها" description="مخاطبین و متن پشتیبانی ربات" size="lg">
      {open ? <Body tab={tab === "text" ? "text" : "contacts"} onTab={onTab} /> : null}
    </FormModal>
  );
}
