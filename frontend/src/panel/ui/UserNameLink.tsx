"use client";

import { Button } from "@heroui/react";
import { useState, type SyntheticEvent } from "react";

import { usePanelSession } from "../core/session";
import { UserCardHost } from "../pages/users/UserCardHost";
import type { UserCardPage } from "../pages/users/types";

/** The nav entries that exist only for staff who hold the users right (the card's own permission). */
const USERS_NAV_IDS = new Set(["users", "customers"]);
const NAME_CLASS = "truncate font-medium text-foreground";

/** Whether this staff member may open a customer's card; the server checks it again on every card request. */
export function useCanOpenUserCard(): boolean {
  let nav: { items: { id: string }[] }[] | undefined;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- the hook reads its context first, so the call order never changes; it only throws when there is no provider
    nav = usePanelSession().session?.nav;
  } catch {
    // Rendered outside the panel shell (a table on its own): no session to ask, so the name stays text.
    nav = undefined;
  }
  return Boolean(nav?.some((section) => section.items.some((item) => USERS_NAV_IDS.has(item.id))));
}

/** The card's dialogs live in the React tree of the table cell; keep their events away from the table. */
function stopAtHost(event: SyntheticEvent): void {
  event.stopPropagation();
}

type Props = {
  userId: number | null | undefined;
  name: string;
  /** The table the name is in: the card shows that row's actions and a message returns there. */
  page: UserCardPage;
};

/**
 * A customer's name in a panel table. For staff who may open the card it is a button that opens the card in place;
 * otherwise (or for a row without a customer) it is plain text.
 */
export function UserNameLink({ userId, name, page }: Props) {
  const allowed = useCanOpenUserCard();
  const [opened, setOpened] = useState(false);
  const [mounted, setMounted] = useState(false);
  if (!userId || !allowed) {
    return (
      <span dir="auto" className={NAME_CLASS}>
        {name}
      </span>
    );
  }
  return (
    <>
      {/* A HeroUI button, not a plain one: its press events stop here instead of toggling the table row's selection. */}
      <Button
        variant="ghost"
        aria-haspopup="dialog"
        className="!h-auto !min-w-0 !justify-start !p-0 font-medium text-foreground underline-offset-4 hover:underline"
        onPress={() => {
          setMounted(true);
          setOpened(true);
        }}
      >
        <span className="truncate" dir="auto">
          {name}
        </span>
      </Button>
      {mounted ? (
        <span onKeyDown={stopAtHost} onKeyUp={stopAtHost} onPointerDown={stopAtHost} onClick={stopAtHost}>
          <UserCardHost userId={opened ? userId : null} page={page} onClose={() => setOpened(false)} />
        </span>
      ) : null}
    </>
  );
}
