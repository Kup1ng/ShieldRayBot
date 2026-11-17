"use client";

import { useCallback, useState } from "react";

import { initialState, isDirty, NO_IMAGE_CHANGES, type FormState, type ImageChanges } from "./logic";
import type { SettingGroup } from "./types";

export type FormModel = {
  state: FormState;
  images: ImageChanges;
  dirty: boolean;
  set: (key: string, value: string | boolean) => void;
  pickImage: (key: string, file: File | null) => void;
  clearImage: (key: string, cleared: boolean) => void;
  /** Read a setting for the previews: the form's value when this tab has the field. */
  read: (name: string, fallback?: string) => string;
};

/** The values of one settings form; the server data it started from is replaced after a save by re-mounting. */
export function useSettingsForm(groups: SettingGroup[], saved: Record<string, string> = {}): FormModel {
  const [state, setState] = useState<FormState>(() => initialState(groups));
  const [images, setImages] = useState<ImageChanges>(NO_IMAGE_CHANGES);
  const set = useCallback((key: string, value: string | boolean) => setState((prev) => ({ ...prev, [key]: value })), []);
  const pickImage = useCallback((key: string, file: File | null) => {
    setImages((prev) => {
      const files = { ...prev.files };
      if (file) files[key] = file;
      else delete files[key];
      return { files, cleared: { ...prev.cleared, [key]: false } };
    });
  }, []);
  const clearImage = useCallback((key: string, cleared: boolean) => {
    setImages((prev) => {
      const files = { ...prev.files };
      if (cleared) delete files[key];
      return { files, cleared: { ...prev.cleared, [key]: cleared } };
    });
  }, []);
  const read = useCallback(
    (name: string, fallback = "") => {
      const value = state[name];
      if (typeof value === "boolean") return value ? "1" : "0";
      if (typeof value === "string") return value;
      // An empty saved value counts: an empty button color is «white», not «unset».
      return Object.prototype.hasOwnProperty.call(saved, name) ? saved[name] : fallback;
    },
    [state, saved],
  );
  return { state, images, dirty: isDirty(groups, state, images), set, pickImage, clearImage, read };
}
