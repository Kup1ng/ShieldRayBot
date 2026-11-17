"use client";

import { useState } from "react";

import { MessageDialog } from "./UserDialogs";
import { type MessageTarget, UserCardModal } from "./UserCardModal";
import type { UserCardPage } from "./types";

/** The card of one customer plus the message form its «پیام» button opens, for a table that is not the users list. */
export function UserCardHost({ userId, page, onClose }: { userId: number | null; page: UserCardPage; onClose: () => void }) {
  const [message, setMessage] = useState<MessageTarget | null>(null);
  return (
    <>
      <UserCardModal userId={userId} page={page} onClose={onClose} onMessage={setMessage} />
      <MessageDialog target={message} onClose={() => setMessage(null)} />
    </>
  );
}
