import assert from "node:assert/strict";
import test from "node:test";
import {
  csFeatureEvolution,
  filterCsFeatureEvolution,
} from "../lib/cs-feature-evolution.ts";

const snapshot = (patch = {}) => ({
  createdAt: "2026-11-10T14:00:00Z",
  score: 80,
  previousScore: 50,
  featuresActive: ["Agenda"],
  actor: "Coordenador",
  responsible: "Ana",
  ...patch,
});
const item = (id, entries, patch = {}) => ({
  id,
  title: `Cliente ${id}`,
  owner: "Bia",
  description: JSON.stringify({
    kind: "csJourney",
    clientId: id,
    track: "activation",
    scoreEvolution: entries,
  }),
  ...patch,
});

test("o histórico mantém o responsável original após transferência e identifica o autor", () => {
  const rows = csFeatureEvolution([item("one", [snapshot()])]);
  assert.equal(rows[0].responsible, "Ana");
  assert.equal(rows[0].actor, "Coordenador");
  assert.equal(rows[0].inferredResponsible, false);
  assert.equal(rows[0].delta, 30);
  assert.equal(filterCsFeatureEvolution(rows, "", "Ana").length, 1);
  assert.equal(filterCsFeatureEvolution(rows, "", "Bia").length, 0);
});
test("registros antigos usam o responsável atual sem inventar autoria", () => {
  const [row] = csFeatureEvolution([
    item("one", [snapshot({ responsible: undefined, actor: undefined })]),
  ]);
  assert.equal(row.responsible, "Bia");
  assert.equal(row.inferredResponsible, true);
  assert.equal(row.actor, "Não informado");
});
test("filtra pela data da evolução em Brasília e preserva várias evoluções do mesmo cliente", () => {
  const rows = csFeatureEvolution([
    item(
      "old",
      [
        snapshot({ createdAt: "2026-11-11T01:00:00Z" }),
        snapshot({ createdAt: "2026-11-11T04:00:00Z", score: 40 }),
      ],
      { created_at: "2025-01-01" },
    ),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].delta, -10);
  const filtered = filterCsFeatureEvolution(
    rows,
    "2026-11-10..2026-11-10",
    "Ana",
    "Coordenador",
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].date, "2026-11-10");
  assert.equal(
    filterCsFeatureEvolution(rows, "", "all", "cliente old").length,
    2,
  );
});
test("descarta dados inválidos e jornadas sem histórico sem criar evolução artificial", () => {
  const rows = csFeatureEvolution([
    item("empty", []),
    item("bad", [
      null,
      {},
      snapshot({ score: "80" }),
      snapshot({ createdAt: "inválido" }),
    ]),
    item("text", [], { description: "legado" }),
    item("other", [], {
      description: JSON.stringify({
        kind: "enterpriseNetwork",
        scoreEvolution: [snapshot()],
      }),
    }),
  ]);
  assert.deepEqual(rows, []);
});
test("considera o histórico completo antes de paginar e inclui clientes encerrados", () => {
  const rows = csFeatureEvolution([
    item(
      "closed",
      Array.from({ length: 25 }, (_, i) =>
        snapshot({ responsible: i < 18 ? "Ana" : "Bia" }),
      ),
    ),
  ]);
  assert.equal(rows.length, 25);
  assert.equal(filterCsFeatureEvolution(rows, "2026-11", "Ana").length, 18);
});
