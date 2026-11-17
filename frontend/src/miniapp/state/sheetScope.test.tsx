import { act, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";

import { MiniShell } from "../layout/MiniShell";
import { fakeApi, renderMini } from "../test/harness";
import { useMini, useSheetClose } from "./store";

let releaseLateReply: () => void = () => undefined;

/** A sheet whose action finishes after the person may already have moved on. */
function SlowSheet() {
  const close = useSheetClose();
  useEffect(() => {
    releaseLateReply = close;
  }, [close]);
  return <p>برگه الف</p>;
}

function Opener() {
  const { openSheet, closeSheet } = useMini();
  return (
    <>
      <button onClick={() => openSheet({ title: "الف", render: () => <SlowSheet /> })}>باز کردن الف</button>
      <button onClick={() => closeSheet()}>بستن</button>
      <button onClick={() => openSheet({ title: "ب", render: () => <p>برگه ب</p> })}>باز کردن ب</button>
    </>
  );
}

describe("sheet scope", () => {
  it("a late reply closes only the sheet that started it, never one opened since", async () => {
    fakeApi({});
    renderMini(
      <MiniShell>
        <Opener />
      </MiniShell>,
    );
    act(() => screen.getByText("باز کردن الف").click());
    await screen.findByText("برگه الف");
    const lateClose = releaseLateReply;
    act(() => screen.getByText("بستن").click());
    act(() => screen.getByText("باز کردن ب").click());
    await screen.findByText("برگه ب");

    act(() => lateClose());

    expect(screen.getByText("برگه ب")).toBeTruthy();
  });
});
