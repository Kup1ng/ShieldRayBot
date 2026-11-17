/** Pure logic shared by the Owner and shop settings forms: field state, list/channel/guide editors, template tokens. */

import { digitsOnly } from "../core/format";
import type { SettingField, SettingGroup } from "./types";

/** Current value of every field of a settings form: switches are booleans, the rest text. */
export type FormState = Record<string, string | boolean>;
/** A chosen upload per image field, and the image fields whose saved file is to be removed. */
export type ImageChanges = { files: Record<string, File>; cleared: Record<string, boolean> };

export const NO_IMAGE_CHANGES: ImageChanges = { files: {}, cleared: {} };

/** A secret is never sent to the page: its field starts empty and `has_value` says whether one is saved. */
function isSecret(field: SettingField): boolean {
  return field.kind === "password" || Boolean(field.has_value);
}

export function fieldsOf(groups: SettingGroup[]): SettingField[] {
  return groups.flatMap((group) => group.fields);
}

export function initialState(groups: SettingGroup[]): FormState {
  const state: FormState = {};
  for (const field of fieldsOf(groups)) state[field.key] = isSecret(field) ? "" : field.value;
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
  const control = controlValue(state, field.show_when.key);
  return field.show_when.values.includes(control) || field.show_when.values.includes(control.toLowerCase());
}

/** Fields that need the whole row width in the two-column grid. */
const WIDE_KINDS = new Set(["textarea", "toggle", "btn_color", "force_channels", "connection_guides", "image", "list"]);

export function isWideField(field: SettingField): boolean {
  return WIDE_KINDS.has(field.kind);
}

export type PostedValue = string | File;

/**
 * The fields `POST /settings?tab=` reads: every field is sent, hidden ones included, so a saved
 * value survives a hidden section. A switch that is off is left out, like an unchecked box; a
 * secret left blank keeps the saved one; an image is a file or a clear flag.
 */
export function formFields(groups: SettingGroup[], state: FormState, images: ImageChanges = NO_IMAGE_CHANGES): Record<string, PostedValue> {
  const out: Record<string, PostedValue> = {};
  for (const field of fieldsOf(groups)) {
    const value = state[field.key];
    if (field.kind === "toggle") {
      if (value === true) out[`s_${field.key}`] = "1";
    } else if (field.kind === "image") {
      const file = images.files[field.key];
      if (file) out[`s_${field.key}`] = file;
      else if (images.cleared[field.key]) out[`s_${field.key}_clear`] = "1";
    } else {
      out[`s_${field.key}`] = String(value ?? "");
    }
  }
  return out;
}

/** Whether any field differs from what the server sent. */
export function isDirty(groups: SettingGroup[], state: FormState, images: ImageChanges = NO_IMAGE_CHANGES): boolean {
  if (Object.keys(images.files).length || Object.values(images.cleared).some(Boolean)) return true;
  return fieldsOf(groups).some((field) => (isSecret(field) ? state[field.key] !== "" : state[field.key] !== field.value));
}

/* ---------- list editor (comma-separated values with a kind) ---------- */

export type ListKind = "money" | "text" | "telegram";

const LIST_SEPARATORS = /[,،;؛\r\n]+/;
const LIST_LIMITS: Record<string, [bigint, bigint]> = {
  telegram: [BigInt(1), BigInt("9223372036854775807")],
  money: [BigInt(1000), BigInt(2147483647)],
};
export const LIST_MESSAGES = {
  empty: "مقدار را وارد کنید.",
  duplicate: "این مقدار قبلاً در فهرست وجود دارد.",
  single: "هر بار یک مقدار وارد کنید.",
  telegram: "آیدی باید یک عدد صحیح مثبت و در محدودهٔ مجاز باشد.",
  money: "مبلغ باید عدد صحیح و بین ۱٬۰۰۰ تا ۲٬۱۴۷٬۴۸۳٬۶۴۷ تومان باشد.",
} as const;

function normalizeListItem(raw: string, kind: ListKind): string {
  const value = raw.trim();
  if (kind === "telegram" && /\s/.test(value)) return value;
  if (kind === "text") return value;
  return digitsOnly(value).replace(/^0+(?=\d)/, "");
}

export function parseListItems(raw: string, kind: ListKind): string[] {
  return raw
    .split(LIST_SEPARATORS)
    .map((part) => normalizeListItem(part, kind))
    .filter(Boolean);
}

export function serializeListItems(items: string[]): string {
  return items.join(",");
}

/** The normalized value to store, or the Persian reason it is refused. */
export function checkListItem(raw: string, kind: ListKind, items: string[], index = -1): { value: string; error: "" } | { value: ""; error: string } {
  const text = raw.trim();
  if (!text) return { value: "", error: LIST_MESSAGES.empty };
  // A comma in a money entry is digit grouping, never another preset.
  if (kind !== "money" && LIST_SEPARATORS.test(text)) return { value: "", error: LIST_MESSAGES.single };
  const value = normalizeListItem(text, kind);
  const limits = LIST_LIMITS[kind];
  if (limits) {
    if (!/^\d+$/.test(value)) return { value: "", error: LIST_MESSAGES[kind as "telegram" | "money"] };
    const number = BigInt(value);
    if (number < limits[0] || number > limits[1]) return { value: "", error: LIST_MESSAGES[kind as "telegram" | "money"] };
  }
  if (items.some((item, position) => position !== index && item === value)) return { value: "", error: LIST_MESSAGES.duplicate };
  return { value, error: "" };
}

/* ---------- forced-join channels ---------- */

export type ChannelRow = { id: string; required: boolean; link: string; title: string };

export function parseChannels(raw: string): ChannelRow[] {
  const text = raw.trim();
  const seen = new Set<string>();
  const rows: ChannelRow[] = [];
  const add = (row: ChannelRow) => {
    const id = row.id || row.link;
    if (!id) return;
    const key = id.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ ...row, id });
  };
  if (text.startsWith("[")) {
    try {
      const data: unknown = JSON.parse(text);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (typeof item === "string") add({ id: item.trim(), required: true, link: "", title: "" });
          else if (item && typeof item === "object") {
            const entry = item as Record<string, unknown>;
            const required = entry.required;
            add({
              id: String(entry.id ?? entry.channel ?? "").trim(),
              required: required !== false && required !== 0 && required !== "0",
              link: String(entry.link ?? entry.invite_link ?? entry.url ?? "").trim(),
              title: String(entry.title ?? entry.name ?? entry.label ?? "").trim(),
            });
          }
        }
        return rows;
      }
    } catch {
      // Not JSON after all: fall through to the plain list.
    }
  }
  for (const part of text.replace(/,/g, "\n").split("\n")) add({ id: part.trim(), required: true, link: "", title: "" });
  return rows;
}

export function serializeChannels(rows: ChannelRow[]): string {
  const seen = new Set<string>();
  const entries: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const id = row.id.trim() || row.link.trim();
    if (!id || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());
    const entry: Record<string, unknown> = { id, required: row.required };
    if (row.link.trim()) entry.link = row.link.trim();
    if (row.title.trim()) entry.title = row.title.trim();
    entries.push(entry);
  }
  return JSON.stringify(entries);
}

/* ---------- connection guides ---------- */

export type GuideLink = { label: string; url: string };
export type GuideRow = {
  id: string;
  title: string;
  body: string;
  audience: "user" | "reseller";
  sort: string;
  enabled: boolean;
  deep_link: boolean;
  style: string;
  links: GuideLink[];
};

/** Same cap as MAX_LINKS_PER_GUIDE on the server. */
export const GUIDE_LINK_SLOTS = 3;

export function newGuideId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A new guide sorts after the ones already there. */
export function blankGuide(sort = 0): GuideRow {
  return { id: newGuideId(), title: "", body: "", audience: "user", sort: String(sort), enabled: true, deep_link: false, style: "primary", links: [] };
}

export function parseGuides(raw: string): GuideRow[] {
  let data: unknown = [];
  try {
    data = JSON.parse(raw || "[]");
  } catch {
    data = [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const links = Array.isArray(item.links) ? item.links : [];
      const style = item.style ?? item.button_style;
      return {
        id: String(item.id || newGuideId()),
        title: String(item.title ?? ""),
        body: String(item.body ?? item.text ?? ""),
        audience: item.audience === "reseller" ? "reseller" : "user",
        sort: String(item.sort ?? 0),
        enabled: item.enabled === undefined || item.enabled === null ? true : Boolean(item.enabled),
        deep_link: Boolean(item.deep_link),
        style: style === undefined || style === null ? "primary" : String(style),
        links: links
          .filter((link): link is Record<string, unknown> => Boolean(link) && typeof link === "object")
          .map((link) => ({ label: String(link.label ?? ""), url: String(link.url ?? "") }))
          .slice(0, GUIDE_LINK_SLOTS),
      };
    });
}

/** The JSON the form posts: guides with no title and no text are dropped, media stays on the server. */
export function serializeGuides(rows: GuideRow[]): string {
  const entries = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.title.trim() || row.body.trim())
    .map(({ row, index }) => {
      const sort = Number.parseInt(row.sort, 10);
      return {
        id: row.id,
        title: row.title.trim(),
        body: row.body.trim(),
        audience: row.audience,
        sort: Number.isNaN(sort) ? index : sort,
        enabled: row.enabled,
        deep_link: row.deep_link,
        style: row.style,
        links: row.links.filter((link) => link.url.trim()).map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
      };
    });
  return JSON.stringify(entries);
}

/* ---------- template tokens ---------- */

export type TokenInfo = { token: string; valid: boolean; used: boolean; malformed: boolean; title: string };

/**
 * The `{name}` tokens a text uses (nested or unclosed braces stay together so they can never look
 * valid), followed by the allowed ones it does not use yet.
 */
export function tokensIn(text: string, allowed: Record<string, string>): TokenInfo[] {
  const tokens = new Map<string, TokenInfo>();
  const add = (token: string) => {
    const match = /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(token);
    const valid = Boolean(match) && Object.prototype.hasOwnProperty.call(allowed, match![1]);
    tokens.set(token, { token, valid, used: true, malformed: !match, title: match && valid ? allowed[match[1]] : "" });
  };
  let start = -1;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (text[i] === "}") {
      if (depth === 0) add("}");
      else {
        depth -= 1;
        if (depth === 0) add(text.slice(start, i + 1));
      }
    }
  }
  if (depth > 0) add(text.slice(start));
  for (const [name, title] of Object.entries(allowed)) {
    const token = `{${name}}`;
    if (!tokens.has(token)) tokens.set(token, { token, valid: true, used: false, malformed: false, title });
  }
  return Array.from(tokens.values());
}

/** The Persian line under a text that uses a token this section does not support, or "". */
export function tokenProblem(tokens: TokenInfo[]): string {
  const unsupported = tokens.filter((item) => !item.valid && !item.malformed);
  const messages: string[] = [];
  if (unsupported.length) {
    const list = unsupported.map((item) => item.token).join("، ");
    messages.push(unsupported.length === 1 ? `متغیر ${list} در این بخش پشتیبانی نمی‌شود.` : `متغیرهای ${list} در این بخش پشتیبانی نمی‌شوند.`);
  }
  if (tokens.some((item) => !item.valid && item.malformed)) messages.push("قالب متغیر نادرست است؛ از قالب {name} بدون فاصله استفاده کنید.");
  return messages.join(" ");
}

/* ---------- bot menu order ---------- */

/** Move the entry at `from` to the place of the entry at `to`; out-of-range indexes leave the list as it was. */
export function moveTo<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
