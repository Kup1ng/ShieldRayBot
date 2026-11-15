import { Icon } from "@/icons/Icon";

export type TileTone = "blue" | "yellow" | "green" | "purple" | "red" | "teal" | "pink" | "orange" | "gray";

const TONE_BG: Record<TileTone, string> = {
  blue: "bg-[var(--tile-blue)]",
  yellow: "bg-[var(--tile-yellow)]",
  green: "bg-[var(--tile-green)]",
  purple: "bg-[var(--tile-purple)]",
  red: "bg-[var(--tile-red)]",
  teal: "bg-[var(--tile-teal)]",
  pink: "bg-[var(--tile-pink)]",
  orange: "bg-[var(--tile-orange)]",
  gray: "bg-[var(--tile-gray)]",
};

type IconTileProps = {
  icon: string;
  tone?: TileTone;
  /** 32px row tile (Figma "Main icon") or 40px section badge tile. */
  size?: "md" | "lg";
  className?: string;
};

/** Solid tone square with a white glyph — the identity mark on rows, badges and shortcuts. */
export function IconTile({ icon, tone = "purple", size = "md", className = "" }: IconTileProps) {
  const box = size === "lg" ? "size-10 rounded-[10px]" : "size-8 rounded-[8px]";
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center text-white ${box} ${TONE_BG[tone]} ${className}`}>
      <Icon name={icon} size={size === "lg" ? 26 : 24} />
    </span>
  );
}
