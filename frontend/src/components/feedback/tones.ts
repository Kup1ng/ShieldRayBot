/** Figma alert tones: a solid icon tile, a tinted title and a soft wash from the start edge. */
export type FeedbackTone = "info" | "accent" | "success" | "warning" | "danger";

export const TONE_TILE: Record<FeedbackTone, string> = {
  info: "bg-surface-secondary text-foreground border border-border",
  accent: "bg-accent text-accent-foreground",
  success: "bg-[var(--tile-green)] text-white",
  warning: "bg-[var(--tile-yellow)] text-white",
  danger: "bg-danger text-white",
};

export const TONE_TITLE: Record<FeedbackTone, string> = {
  info: "text-foreground",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

/** The soft colour wash behind the card (start edge = right in RTL). */
export const TONE_WASH: Record<FeedbackTone, string> = {
  info: "",
  accent: "bg-gradient-to-l from-accent/12 to-transparent",
  success: "bg-gradient-to-l from-success/14 to-transparent",
  warning: "bg-gradient-to-l from-warning/16 to-transparent",
  danger: "bg-gradient-to-l from-danger/12 to-transparent",
};
