import assert from "node:assert/strict";
import test from "node:test";
import { indicatorFields, indicatorValues, matchesIndicatorFilters, groupIndicatorRecords, isCriticalIndicatorRecord, isOverdueIndicatorRecord } from "../lib/field-indicators.ts";
const record = (id, fields = {}, detail = {}) => ({ id, record_type: "Tarefa", owner: "Ana", team: "Suporte", priority: "Alta", status: "Em andamento", amount_cents: 10000, created_at: "2026-11-05", updated_at: "2026-11-05", ...fields, description: JSON.stringify(detail) });

test("filtros de prioridade, setor, responsável e SLA se combinam sobre o mesmo conjunto", () => {
  const rows = [record("1", {}, { slaState: "Vencido" }), record("2", { owner: "Bia" }, { slaState: "Vencido" }), record("3", { priority: "Baixa", team: "CS" }, { slaState: "No prazo" })];
  const filters = [{ field: "priority", value: "Alta" }, { field: "team", value: "Suporte" }, { field: "owner", value: "Ana" }, { field: "sla", value: "Vencido" }];
  const scoped = rows.filter(row => matchesIndicatorFilters(row, filters));
  assert.deepEqual(scoped.map(row => row.id), ["1"]);
  assert.deepEqual(groupIndicatorRecords(scoped, "priority", "owner"), [{ label: "Alta · Ana", count: 1, amountCents: 10000 }]);
  assert.ok(indicatorFields(rows).some(field => field.key === "sla"));
});
test("utilização e marcações preenchidas são agrupadas sem duplicar o mesmo cliente na mesma opção", () => {
  const rows = [record("1", {}, { retentionMarks: ["Utilizando", "Utilizando", "Primeiro contato"], usage: "Alto", featuresActive: ["Agenda", "Financeiro"] }), record("2", {}, { retentionMarks: ["Utilizando"], usage: "Baixo" })];
  assert.ok(indicatorFields(rows).some(field => field.label === "Utilização do cliente"));
  assert.deepEqual(groupIndicatorRecords(rows, "detail.retentionMarks"), [{ label: "Utilizando", count: 2, amountCents: 20000 }, { label: "Primeiro contato", count: 1, amountCents: 10000 }]);
  assert.deepEqual(rows.filter(row => matchesIndicatorFilters(row, [{ field: "detail.usage", value: "Alto" }])).map(row => row.id), ["1"]);
});
test("não preenchido, falso e zero têm significados distintos e campos técnicos ficam fora das opções", () => {
  const item = record("1", {}, { score: 0, active: false, sourceItemId: "private-id", notes: "Contexto livre", products: [{ product: "LIA", plan: "Plus" }] });
  assert.deepEqual(indicatorValues(item, "detail.score"), ["0"]);
  assert.deepEqual(indicatorValues(item, "detail.active"), ["Não"]);
  assert.deepEqual(indicatorValues(item, "detail.usage"), ["Não informado"]);
  assert.deepEqual(indicatorValues(item, "products.product"), ["LIA"]);
  assert.ok(!indicatorFields([item]).some(field => /sourceItemId|notes/.test(field.key)));
});
test("o SLA vencido e a prioridade usam os campos reais, sem inferir risco pelo texto da tarefa", () => {
  assert.equal(isOverdueIndicatorRecord(record("1", {}, { slaState: "Vencido" })), true);
  assert.equal(isOverdueIndicatorRecord(record("1", {}, { slaState: "Concluída" })), false);
  assert.equal(isOverdueIndicatorRecord(record("1", { status: "Cancelada" }, { slaState: "Vencido", cancelled: true })), false);
  assert.equal(isCriticalIndicatorRecord(record("1", { priority: "Urgente" })), true);
  assert.equal(isCriticalIndicatorRecord(record("1", { priority: "Emergencial" }, { prioritySeverityOrder: 50 })), true);
  assert.equal(isCriticalIndicatorRecord(record("1", { priority: "Baixa" }, { notes: "Cliente solicita prioridade alta" })), false);
});
