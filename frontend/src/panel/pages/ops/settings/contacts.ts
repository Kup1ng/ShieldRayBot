/** Support contacts of a shop: the rows the contacts editor posts as one JSON value. */

export type Contact = { id: string; title: string; telegram: string; sort: number; enabled: boolean; style: string };

/** «inherit» means no own colour; an empty style is the explicit white button. */
export const INHERIT_STYLE = "inherit";

export function serializeContacts(contacts: Contact[]): string {
  const entries = contacts
    .filter((contact) => contact.title.trim() || contact.telegram.trim())
    .map((contact, index) => ({
      id: contact.id,
      title: contact.title.trim(),
      telegram: contact.telegram.trim(),
      sort: Number.isFinite(contact.sort) ? contact.sort : index,
      enabled: contact.enabled,
      ...(contact.style === INHERIT_STYLE ? {} : { button_style: contact.style }),
    }));
  return JSON.stringify(entries);
}
