/* ---------- service naming sample ---------- */

const NAMING_SAMPLES: Array<[string, string]> = [
  ["{id}", "42"],
  ["{plan_volume}", "30"],
  ["{plan_unit}", "GB"],
  ["{username}", "ali_user"],
];

/**
 * An example panel username for the naming pattern, as the bot would build it: an empty prefix means
 * «no prefix», and the separator an empty prefix or suffix leaves at either end is dropped.
 */
export function namingSample(prefix: string, suffix: string, pattern: string, random: string): string {
  let out = pattern || "{prefix}_{random}{suffix}";
  out = out.replaceAll("{prefix}", prefix.trim()).replaceAll("{suffix}", suffix).replaceAll("{random}", random);
  for (const [token, sample] of NAMING_SAMPLES) out = out.replaceAll(token, sample);
  return out.replace(/^_+|_+$/g, "");
}

/* ---------- Mini App brand colour preview ---------- */

export const DEFAULT_ACCENT = "#f97316";
const INK_DARK = "#1c1007";
const INK_LIGHT = "#ffffff";

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const v = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Dark ink or white, whichever reads better on `hex` (the same rule the Mini App applies). */
export function inkFor(hex: string): string {
  const l = luminance(hex);
  return (l + 0.05) / (luminance(INK_DARK) + 0.05) >= 1.05 / (l + 0.05) ? INK_DARK : INK_LIGHT;
}

/* ---------- bot connection ---------- */

export const DEFAULT_WEBHOOK_PATH = "/telegram/webhook";

/** The webhook address the bot would register: the base (or the public address) plus the cleaned path. */
export function webhookPreview(base: string, publicBase: string, rawPath: string): string {
  const root = (base || publicBase || "").trim().replace(/\/+$/, "");
  let path = (rawPath || DEFAULT_WEBHOOK_PATH).trim() || DEFAULT_WEBHOOK_PATH;
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return root ? `${root}${path}` : "";
}
