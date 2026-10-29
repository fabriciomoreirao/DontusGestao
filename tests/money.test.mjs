import assert from "node:assert/strict";
import test from "node:test";
import { formatMoney, moneyInputValue, parseMoneyInput } from "../lib/money.ts";

test("exibe os centavos sem arredondar para reais inteiros", () => {
  for (const [cents, expected] of [[12990, "R$ 129,90"], [1, "R$ 0,01"], [12900, "R$ 129,00"], [0, "R$ 0,00"], [123456, "R$ 1.234,56"]])
    assert.equal(formatMoney(cents).replaceAll("\u00a0", " "), expected);
});

test("aceita reais com vírgula, ponto, agrupamento e símbolo sem perder centavos", () => {
  for (const [input, cents] of [["129,90", 12990], ["129.90", 12990], ["R$ 129,90", 12990], ["1.234,56", 123456], ["R$ 1.234,56", 123456], ["0,01", 1], ["129,9", 12990], ["129.9", 12990], ["129,", 12900], ["1.234", 123400], ["0", 0], ["", 0]])
    assert.equal(parseMoneyInput(input), cents, input);
});

test("preserva os centavos ao editar, multiplicar e reabrir um valor", () => {
  for (const cents of [0, 1, 29, 199, 12990, 123456, 99999999]) {
    assert.equal(parseMoneyInput(moneyInputValue(cents / 100)), cents);
  }
  assert.equal(parseMoneyInput("129,90") * 3, 38970);
});

test("recusa valores negativos, inválidos e frações menores que um centavo", () => {
  for (const input of ["-129,90", "129,999", "12,34,56", "1.23,45", "abc", "NaN", "Infinity", "900719925474099,99"])
    assert.equal(parseMoneyInput(input), null, input);
});
