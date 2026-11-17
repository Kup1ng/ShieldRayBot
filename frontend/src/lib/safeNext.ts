/**
 * The address to open after signing in: a path on this site, never another host.
 *
 * Browsers drop tabs and newlines while parsing a URL, so "/\t/evil.example" would turn into
 * "//evil.example"; such characters are refused, and the result is checked against the origin.
 */
export function safeNext(raw: string | null, origin: string): string {
  const value = String(raw || "");
  if (!value.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(value)) return "";
  let url: URL;
  try {
    url = new URL(value, origin);
  } catch {
    return "";
  }
  if (url.origin !== origin || url.pathname.startsWith("/login")) return "";
  return `${url.pathname}${url.search}${url.hash}`;
}
