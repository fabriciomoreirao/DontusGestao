import assert from "node:assert/strict";
import test from "node:test";
import { enterpriseUnitScore, enterpriseHealthScore } from "../lib/enterprise-score.ts";

const feature = (name, status = "Contratada", category = "Base") => ({name,status,category});
test("conta adoção por funcionalidade e usa o mesmo percentual no painel e no BI", () => {
  const unit = {features:[feature("Agenda","Configurada"), feature("Financeiro"), feature("Estoque"), feature("Prontuário")]};
  assert.equal(enterpriseUnitScore(unit), 25);
  assert.equal(enterpriseHealthScore([unit]), 25);
});
test("considera funcionalidades ativas e nomes sem acento sem contar duplicidades", () => {
  assert.equal(enterpriseUnitScore({features:[feature("Agenda","Em utilização"),feature("AGENDA","Configurada"), feature("Caixa","Contratada","Ativa")]}, ["agenda","caixa","estoque","prontuário"]),50);
  assert.equal(enterpriseUnitScore({features:[feature("Fora da base","Em utilização")]},["Agenda"]),0);
});
test("média exclui unidades inativas e trata listas vazias", () => {
  assert.equal(enterpriseHealthScore([{active:true,features:[feature("Agenda","Configurada")]},{active:false,features:[feature("Agenda")]}]),100);
  assert.equal(enterpriseHealthScore([]),0); assert.equal(enterpriseUnitScore({features:[]}),0);
});
