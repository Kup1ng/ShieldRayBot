"use client";

import { Button, Tooltip } from "@heroui/react";
import { useSyncExternalStore } from "react";

import { Icon } from "@/icons/Icon";
import { applyTheme, currentTheme, saveTheme, type ThemeMode } from "@/lib/theme";

type Listener = () => void;
const listeners = new Set<Listener>();

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Switch light/dark everywhere on the page and remember it on this device. */
export function setTheme(mode: ThemeMode, onChange?: (mode: ThemeMode) => void) {
  applyTheme(mode);
  saveTheme(mode);
  listeners.forEach((listener) => listener());
  onChange?.(mode);
}

export function useTheme(): ThemeMode {
  return useSyncExternalStore(subscribe, currentTheme, () => "light");
}

type ThemeToggleProps = {
  /** Extra work after a switch, e.g. repainting Telegram's header. */
  onChange?: (mode: ThemeMode) => void;
  className?: string;
};

export function ThemeToggle({ onChange, className }: ThemeToggleProps) {
  const mode = useTheme();
  const next: ThemeMode = mode === "dark" ? "light" : "dark";
  const label = next === "dark" ? "حالت تیره" : "حالت روشن";
  return (
    <Tooltip delay={600}>
      <Button
        isIconOnly
        variant="ghost"
        aria-label={label}
        className={className}
        onPress={() => setTheme(next, onChange)}
      >
        <Icon name={mode === "dark" ? "solar:moon-linear" : "solar:sun-2-linear"} size={24} className="!size-6" />
      </Button>
      <Tooltip.Content>
        <p>{label}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
