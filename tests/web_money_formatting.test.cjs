"use strict";

const assert = require("node:assert/strict");
const {groupMoneyDigits, formatMoneyInput, syncMoneyMode, normalizeMoneyFormData} = require("../app/web/static/money-inputs.js");

for (const [raw, expected] of [
  ["", ""], ["0", "0"], ["999", "999"], ["1000", "1,000"],
  ["1234567890", "1,234,567,890"], ["-1250000", "-1,250,000"],
  ["9223372036854775807", "9,223,372,036,854,775,807"],
  ["1234.5", "1,234.5"], ["<img>", "<img>"], ["12abc", "12abc"],
]) assert.equal(groupMoneyDigits(raw), expected);

const normalize = (value) => value.replace(/[۰-۹٠-٩]/g, (digit) => {
  const code = digit.charCodeAt(0);
  return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
}).replace(/[,٬\s]/g, "");
const field = (value, start, end = start) => ({
  value, selectionStart: start, selectionEnd: end,
  setSelectionRange(first, last) {this.selectionStart = first; this.selectionEnd = last;},
});
const typed = field("1250000", 7);
formatMoneyInput(typed, normalize);
assert.equal(typed.value, "1,250,000");
assert.equal(typed.selectionStart, 9);
assert.equal(normalize(typed.value), "1250000");
const edited = field("12,950,000", 4);
formatMoneyInput(edited, normalize);
assert.equal(edited.selectionStart, 4);
const inserted = field("1,2900,000", 4);
formatMoneyInput(inserted, normalize);
assert.equal(inserted.value, "12,900,000");
assert.equal(inserted.selectionStart, 4);
const deleted = field("1,50,000", 3);
formatMoneyInput(deleted, normalize);
assert.equal(deleted.value, "150,000");
assert.equal(deleted.selectionStart, 2);
const pasted = field("۱۲۵۰۰۰۰", 7);
formatMoneyInput(pasted, normalize);
assert.equal(pasted.value, "1,250,000");
assert.equal(pasted.selectionStart, 9);
const arabic = field("١٢٥٬٠٠٠", 7);
formatMoneyInput(arabic, normalize);
assert.equal(arabic.value, "125,000");
const selection = field("1234567", 1, 4);
formatMoneyInput(selection, normalize);
assert.equal(selection.selectionStart, 1);
assert.equal(selection.selectionEnd, 5);
const empty = field("", 0);
formatMoneyInput(empty, normalize);
assert.equal(empty.value, "");

for (const [name, value] of [["reduction_kind", "amount"], ["reward_type", "wallet_credit"], ["prize_type", "wallet_credit"]]) {
  const kind = {value};
  const input = Object.assign(field("1250000", 7), {
    dataset: {moneyKind: name, moneyValue: value},
    form: {elements: {namedItem: (key) => key === name ? kind : null}},
    toggleAttribute(_name, enabled) {this.isMoney = enabled;},
  });
  syncMoneyMode(input, normalize);
  assert.equal(input.value, "1,250,000");
  assert.equal(input.isMoney, true);
  assert.equal(input.selectionStart, 9);
  kind.value = "percent";
  syncMoneyMode(input, normalize);
  assert.equal(input.value, "1250000");
  assert.equal(input.isMoney, false);
  input.value = "۲۰";
  syncMoneyMode(input, normalize);
  assert.equal(input.value, "20");
  kind.value = value;
  syncMoneyMode(input, normalize);
  assert.equal(input.isMoney, true);
  assert.equal(input.value, "20");
  kind.value = "percent";
  input.value = "1250000";
  const changedSelect = {value, tagName: "SELECT", name: "", dataset: {uiSelectName: name}};
  Object.assign(input.form.elements, {0: changedSelect, length: 1});
  syncMoneyMode(input, normalize);
  assert.equal(input.isMoney, true);
  assert.equal(input.value, "1,250,000");
  kind.value = value;
  changedSelect.value = "percent";
  syncMoneyMode(input, normalize);
  assert.equal(input.isMoney, false);
  assert.equal(input.value, "1250000");
}

{
  // Rows of one list share a field name: every row keeps its own normalized price.
  const control = (name, money, disabled = false) => ({name, disabled, hasAttribute: (attr) => attr === "data-money" && money});
  const form = new FormData();
  [["amount", "5"], ["price", "50,000"], ["amount", "10"], ["price", "۹۰,۰۰۰"], ["note", "1,000"]].forEach(([k, v]) => form.append(k, v));
  const controls = [control("amount", false), control("price", true), control("amount", false), control("price", true), control("note", false)];
  normalizeMoneyFormData(form, controls, normalize);
  assert.deepEqual(form.getAll("price"), ["50000", "90000"]);
  assert.deepEqual(form.getAll("amount"), ["5", "10"]);
  assert.deepEqual(form.getAll("note"), ["1,000"]);
}
{
  // A disabled money field is not submitted and does not shift the other values.
  const control = (name, money, disabled = false) => ({name, disabled, hasAttribute: (attr) => attr === "data-money" && money});
  const form = new FormData();
  form.append("price", "1,200");
  normalizeMoneyFormData(form, [control("price", true, true), control("price", true)], normalize);
  assert.deepEqual(form.getAll("price"), ["1200"]);
}
// The Mini App's money formatting is tested in frontend/src/miniapp (Vitest).
console.log("Web monetary inputs passed");
