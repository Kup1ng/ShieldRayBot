import { IconTile, type TileTone } from "./IconTile";

type SectionBadgeProps = {
  icon: string;
  tone?: TileTone;
  title: string;
  /** Rendered as the screen's heading so each step has one accessible title. */
  as?: "h1" | "h2";
};

/** The outlined pill that names a flow step in the Figma screens («خرید سرویس», «پرداخت»…). */
export function SectionBadge({ icon, tone = "purple", title, as: Heading = "h1" }: SectionBadgeProps) {
  return (
    <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-surface/70 py-1.5 ps-1.5 pe-4">
      <IconTile icon={icon} tone={tone} size="lg" />
      <Heading className="text-sm font-medium text-foreground">{title}</Heading>
    </div>
  );
}
