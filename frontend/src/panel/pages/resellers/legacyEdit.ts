/** Old redirects ended on `/resellers?edit=7&ok=…`; the edit form is a page now, so they continue there. */
export function legacyEditTarget(search: string): string | null {
  const params = new URLSearchParams(search);
  const raw = params.get("edit") ?? "";
  const id = /^\d{1,9}$/.test(raw) ? Number(raw) : 0;
  if (id <= 0) return null;
  params.delete("edit");
  params.delete("detail");
  const rest = params.toString();
  return `/resellers/${id}/edit${rest ? `?${rest}` : ""}`;
}
