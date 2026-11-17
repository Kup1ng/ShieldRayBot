import type { SettingField, SettingGroup } from "../types";
import { FIELD_KIND_TO_DEST, parseRows, serializeRows } from "./payDest";

/** Current value of every field of a settings form: switches are booleans, the rest text. */
export type FormState = Record<string, string | boolean>;

export function initialState(groups: SettingGroup[]): FormState {
  const state: FormState = {};
  for (const group of groups) {
    for (const field of group.fields) state[field.key] = field.kind === "password" ? "" : field.value;
  }
  return state;
}

/** What a controlling field currently reads as: a switch is «1»/«0», a choice its value. */
function controlValue(state: FormState, key: string): string {
  const value = state[key];
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value ?? "");
}

/** A field tied to another field's value is hidden (not removed) while that value does not show it. */
export function fieldVisible(field: SettingField, state: FormState): boolean {
  if (!field.show_when) return true;
  return field.show_when.values.includes(controlValue(state, field.show_when.key));
}

/** A payment method's card is shown only while its own switch is on. */
export function groupVisible(group: SettingGroup, state: FormState): boolean {
  return group.gate ? state[group.gate] === true : true;
}

/**
 * The fields the settings handler reads: every field is sent, hidden ones included, so a saved
 * value survives a hidden section. A switch that is off is left out, like an unchecked box; a
 * secret left blank keeps the saved one.
 */
export function formFields(groups: SettingGroup[], state: FormState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const group of groups) {
    for (const field of group.fields) {
      const value = state[field.key];
      if (field.kind === "toggle") {
        if (value === true) out[`s_${field.key}`] = "1";
      } else if (field.kind in FIELD_KIND_TO_DEST) {
        // Same normal form the editor writes, so an untouched list posts exactly what an edited one would.
        const kind = FIELD_KIND_TO_DEST[field.kind];
        out[`s_${field.key}`] = serializeRows(kind, parseRows(kind, String(value ?? "")));
      } else {
        out[`s_${field.key}`] = String(value ?? "");
      }
    }
  }
  return out;
}

/** Whether any field differs from what the server sent. */
export function isDirty(groups: SettingGroup[], state: FormState): boolean {
  return groups.some((group) => group.fields.some((field) => (field.kind === "password" ? state[field.key] !== "" : state[field.key] !== field.value)));
}
