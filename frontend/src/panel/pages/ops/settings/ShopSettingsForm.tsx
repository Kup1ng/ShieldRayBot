"use client";

/** Shop adapter around the shared settings form: its `sections` payload and the shop's own save handlers. */

import { useMemo, type ReactNode } from "react";

import { SettingsForm, type SettingsFormProps } from "../../../settings-ui/SettingsForm";
import type { GuidesExtra, SettingSection, StyleOption } from "../types";
import { sectionsToGroups } from "./adapter";

type Props = Omit<SettingsFormProps, "groups" | "saved" | "guides" | "styleOptions" | "before"> & {
  sections: SettingSection[];
  shopTitle?: string;
  styleOptions?: StyleOption[];
  guides?: GuidesExtra;
  before?: ReactNode;
};

export function ShopSettingsForm({ sections, shopTitle = "", styleOptions, guides, before, ...rest }: Props) {
  const groups = useMemo(() => sectionsToGroups(sections, styleOptions), [sections, styleOptions]);
  const saved = useMemo(() => ({ shop_title: shopTitle }), [shopTitle]);
  return <SettingsForm {...rest} groups={groups} saved={saved} guides={guides} styleOptions={styleOptions} before={before} menuKnown={false} />;
}
