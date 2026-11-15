/** URL of a file in /public: under /static/spa once exported, at the root under `next dev`. */
export function asset(path: string): string {
  return `${process.env.NEXT_PUBLIC_ASSET_PREFIX ?? ""}${path}`;
}
