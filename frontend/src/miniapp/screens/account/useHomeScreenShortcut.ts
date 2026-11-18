"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import { addToHomeScreen, canAddToHomeScreen, homeScreenState, onHomeScreenChange } from "../../core/telegram";
import { notify } from "../../state/store";

const UNSUPPORTED = "این نسخهٔ تلگرام افزودن به صفحهٔ اصلی را پشتیبانی نمی‌کند";
const ADDED = "به صفحهٔ اصلی اضافه شد";

/**
 * The «افزودن به صفحهٔ اصلی» row: `available` while Telegram can add a shortcut and the person has
 * none yet. `add` opens Telegram's own prompt; once Telegram reports the shortcut it says so.
 */
export function useHomeScreenShortcut(): { available: boolean; add: () => void } {
  useSyncExternalStore(onHomeScreenChange, homeScreenState, () => "unsupported");
  const asked = useRef(false);
  const status = homeScreenState();

  useEffect(() => {
    if (status === "added" && asked.current) {
      asked.current = false;
      notify(ADDED);
    }
  }, [status]);

  const add = () => {
    asked.current = addToHomeScreen();
    if (!asked.current) notify(UNSUPPORTED, "err");
  };
  return { available: canAddToHomeScreen(), add };
}
