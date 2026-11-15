import { render, screen } from "@testing-library/react";
import { useLocale } from "react-aria";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "./LocaleProvider";

function Direction() {
  const { locale, direction } = useLocale();
  return <p>{`${locale} ${direction}`}</p>;
}

describe("LocaleProvider", () => {
  it("gives every React Aria component the Persian right-to-left locale, whatever the browser language", () => {
    render(
      <LocaleProvider>
        <Direction />
      </LocaleProvider>,
    );
    expect(screen.getByText("fa-IR rtl")).toBeTruthy();
  });
});
