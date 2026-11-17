import type { ElementType, ReactNode } from "react";

type GlassProps = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
};

/** Figma "Nav-bar": a 72px frosted bar with the brand at the start and actions at the end. */
export function GlassBar({ start, end, className = "" }: { start: ReactNode; end?: ReactNode; className?: string }) {
  return (
    <header className={`glass flex h-[72px] shrink-0 items-center justify-between gap-3 rounded-xl px-6 ${className}`}>
      <div className="flex min-w-0 items-center gap-3">{start}</div>
      {end ? <div className="flex shrink-0 items-center gap-3">{end}</div> : null}
    </header>
  );
}

/** Figma "Multistep": the frosted content panel every screen sits on. */
export function GlassPanel({ as: Tag = "section", className = "", children }: GlassProps) {
  return <Tag className={`glass flex flex-col rounded-xl p-6 ${className}`}>{children}</Tag>;
}
