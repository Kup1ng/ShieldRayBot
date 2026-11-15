import type { RiskTag } from "./types";
import { TAG_DOT } from "./format";

/** The staff risk tag: its colour dot and Persian title. */
export function RiskTagChip({ tag }: { tag: RiskTag }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-2 py-0.5 text-xs text-foreground" title="تگ ریسک">
      <span aria-hidden className={`size-2 rounded-full ${TAG_DOT[tag.key]}`} />
      {tag.title}
    </span>
  );
}

/** Radio-style picker over the four fixed levels (the old colour-tag picker). */
export function RiskTagPicker({ tags, value, onChange, label = "تگ ریسک" }: { tags: RiskTag[]; value: string; onChange: (key: string) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const selected = tag.key === value;
        return (
          <button
            key={tag.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(tag.key)}
            className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              selected ? "border-foreground bg-surface font-semibold text-foreground" : "border-border bg-transparent text-muted hover:bg-surface/60"
            }`}
          >
            <span aria-hidden className={`size-3 rounded-full ${TAG_DOT[tag.key]}`} />
            {tag.title}
          </button>
        );
      })}
    </div>
  );
}
