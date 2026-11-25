import assert from "node:assert/strict";
import test from "node:test";
import { selectableAgendaTypes } from "../lib/agenda-context.ts";

test("agendamento oferece todo o catálogo ativo sem exigir Reunião ou Treinamento", () => {
  const types = [
    { id: "custom", name: "Visita à clínica", active: true },
    { id: "disabled", name: "Antigo", active: false },
    { id: "alignment", name: "Alinhamento de implantação", active: true },
    { id: "kickoff", name: "Kick off", active: true },
  ];
  assert.deepEqual(
    selectableAgendaTypes(types).map((type) => type.id),
    ["alignment", "kickoff", "custom"],
  );
  assert.deepEqual(
    types.map((type) => type.id),
    ["custom", "disabled", "alignment", "kickoff"],
  );
});

test("mantém IDs distintos com nomes iguais e retorna vazio somente sem tipos ativos", () => {
  const types = [
    { id: "one", name: "Atendimento", active: true },
    { id: "two", name: "Atendimento", active: true },
  ];
  assert.deepEqual(
    selectableAgendaTypes(types).map((type) => type.id),
    ["one", "two"],
  );
  assert.deepEqual(
    selectableAgendaTypes([{ id: "old", name: "Reunião", active: false }]),
    [],
  );
});
