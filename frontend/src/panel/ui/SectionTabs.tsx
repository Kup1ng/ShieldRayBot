"use client";

/** The tab strip that links sibling pages of one area (marketing, PasarGuard, settings groups). */

export type SectionLink = { key: string; href: string; label: string };

/**
 * One strip of links between sibling pages. The server sends only the links this staff member may
 * open, so a tab never leads to a refusal; a single link needs no strip. Scrolls sideways on a phone.
 */
export function SectionTabs({ label, items, active }: { label: string; items: SectionLink[]; active: string }) {
  if (items.length < 2) return null;
  return (
    <nav aria-label={label} className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface/70 p-1">
      {items.map((item) => {
        const current = item.key === active;
        return (
          <a
            key={item.key}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              current ? "bg-accent text-accent-foreground" : "text-foreground/75 hover:bg-surface-secondary"
            }`}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
