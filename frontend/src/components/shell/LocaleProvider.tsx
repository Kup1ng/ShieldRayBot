"use client";

import type { ReactNode } from "react";
import { I18nProvider } from "react-aria-components";

/**
 * React Aria takes the text direction from its locale, not from `<html dir>`; without this it
 * follows the browser's language and builds overlays (drawers, menus, popovers) left-to-right.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  return <I18nProvider locale="fa-IR">{children}</I18nProvider>;
}
