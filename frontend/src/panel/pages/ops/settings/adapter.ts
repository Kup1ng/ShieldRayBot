/** Shop adapter: the shop-settings payload (`sections`) in the shape the shared settings renderers take (`groups`). */

import type { GroupNotice, SettingField, SettingGroup, StyleOption } from "../../../settings-ui/types";
import type { SettingField as ShopField, SettingSection } from "../types";

/** The warning a shop section carries by name; the payload only says which one. */
const SECTION_NOTICES: Record<NonNullable<SettingSection["notice"]>, GroupNotice> = {
  forcejoin: {
    title: "ربات باید ادمین کانال باشد",
    text: "بدون نقش Admin، تلگرام اجازهٔ بررسی عضویت را نمی‌دهد و کاربر ممکن است پشت صفحهٔ عضویت بماند.",
    items: [
      "ربات را به کانال یا گروه اضافه کنید و نقش Admin بدهید.",
      "شناسه را درست وارد کنید: @username یا -100… یا لینک t.me/c/….",
      "برای کانال خصوصی، لینک دعوت t.me/+… را هم بگذارید.",
      "بعد از ادمین کردن ربات، یک‌بار دکمه «عضو شدم» را در خود ربات تست کنید.",
    ],
  },
  terms: {
    title: "ایموجی پریمیوم تلگرام",
    text: "برای حفظ ایموجی سفارشی، متن قوانین را از داخل ربات (تنظیمات ← دسترسی ← قوانین) بفرستید. ذخیره از وب‌پنل فقط متن ساده نگه می‌دارد.",
    items: [],
  },
};

function fieldOf(field: ShopField, styleOptions: StyleOption[]): SettingField {
  return {
    key: field.key,
    label: field.label,
    kind: field.kind,
    help: field.help,
    // The shop's payload sends the button colors once per tab, not on each color field.
    options: field.kind === "btn_color" && !field.options.length ? styleOptions : field.options,
    value: field.value,
    has_value: field.has_value,
    image_url: field.preview_url,
    list_kind: field.list_kind,
    placeholder: field.placeholder,
    min: field.min,
    max: field.max,
    show_when: field.show_when,
  };
}

export function sectionsToGroups(sections: SettingSection[], styleOptions: StyleOption[] = []): SettingGroup[] {
  return sections.map((section) => ({
    name: section.title,
    caption: section.caption,
    notice: section.notice ? SECTION_NOTICES[section.notice] : null,
    fields: section.fields.map((field) => fieldOf(field, styleOptions)),
  }));
}
