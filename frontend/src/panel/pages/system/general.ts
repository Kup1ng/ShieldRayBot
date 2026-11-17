/** Rules of the general tab. */

export const PORT_MIN = 1;
export const PORT_MAX = 65535;
const RESTART_WORD = "ری‌استارت";

/** The port as the handler would accept it, or null when it is not a valid TCP port. */
export function validPort(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{1,5}$/.test(text)) return null;
  const port = Number(text);
  return port >= PORT_MIN && port <= PORT_MAX ? port : null;
}

/** A handler answer that says the service is restarting to apply the change. */
export function restartRequested(message: string): boolean {
  return message.includes(RESTART_WORD);
}
