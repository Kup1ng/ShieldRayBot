import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { CheckInput, SelectInput, SwitchInput, TextInput } from "../../ui/Fields";

afterEach(cleanup);

it("form widgets expose real controls", () => {
  render(
    <>
      <CheckInput label="چک" checked={false} onChange={() => undefined} />
      <SwitchInput label="سوئیچ" checked={false} onChange={() => undefined} />
      <TextInput label="متن" value="" onChange={() => undefined} />
      <SelectInput label="انتخاب" value="a" onChange={() => undefined} options={[{ id: "a", label: "الف" }]} />
    </>,
  );
  expect(screen.getByRole("checkbox", { name: "چک" })).toBeTruthy();
  expect(screen.getByRole("switch", { name: "سوئیچ" })).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "متن" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /انتخاب/ })).toBeTruthy();
});
