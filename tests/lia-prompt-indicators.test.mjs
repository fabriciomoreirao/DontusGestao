import test from "node:test";
import assert from "node:assert/strict";
import { liaPromptEntries, filterLiaPrompts, liaPromptMetrics, liaPromptDistribution, liaPromptMonthlyVolume } from "../lib/lia-prompt-indicators.ts";
import { liaCanReassign, LIA_STAGES } from "../lib/lia-journey.ts";
import { allowedNextStatuses } from "../lib/domain.ts";
const item = (id, patch = {}) => ({ id, module: "lia", record_type: "Ajuste de Prompt", title: id, owner: "Ana", created_at: "2026-11-01T02:30:00Z", description: JSON.stringify({ kind: "liaPromptAdjustment", clientId: "123456", date: "2026-11-02", adjustmentType: "Regra", responsible: "Ana", reviewer: "Bia", reviewStatus: "adjustments", tested: false, ...patch }) });

test("o fluxo final passa por conferência e permite devolução sem alterar os demais passos", () => {
  assert.deepEqual(LIA_STAGES.slice(-3).map(stage => stage.key), ["finalFollowup", "conference", "completed"]);
  assert.ok(allowedNextStatuses("lia", "AcompanhamentoFinal").includes("ConferenciaFinal"));
  assert.equal(allowedNextStatuses("lia", "AcompanhamentoFinal").includes("Concluida"), false);
  assert.ok(allowedNextStatuses("lia", "ConferenciaFinal").includes("AcompanhamentoFinal"));
  assert.ok(allowedNextStatuses("lia", "ConferenciaFinal").includes("Concluida"));
});
test("somente o responsável atual tem controle de transferência na tela", () => {
  assert.equal(liaCanReassign("Ana", " ana "), true);
  assert.equal(liaCanReassign("Ana", "Bia"), false);
  assert.equal(liaCanReassign("", ""), false);
});
test("indicadores ignoram outros módulos, clientes LIA e descrições inválidas", () => {
  const source = [item("ok"), { ...item("other"), module: "cs" }, { ...item("client"), record_type: "Projeto LIA" }, { ...item("invalid"), description: "invalid" }, { ...item("null"), description: "null" }];
  assert.deepEqual(liaPromptEntries(source).map(entry => entry.item.id), ["ok"]);
});
test("todos os filtros dos prompts são combinados, com datas inclusivas", () => {
  const entries = liaPromptEntries([item("target", { reviewStatus: "approved", tested: true }), item("other", { responsible: "Carlos", date: "2026-11-03" })]);
  assert.deepEqual(filterLiaPrompts(entries, { from: "2026-11-02", to: "2026-11-02", responsible: "Ana", reviewer: "Bia", type: "Regra", status: "approved", tested: "yes" }).map(entry => entry.item.id), ["target"]);
  assert.equal(filterLiaPrompts(entries, { from: "2026-11-03", to: "2026-11-02" }).length, 0);
  assert.deepEqual(filterLiaPrompts(entries, { tested: "no" }).map(entry => entry.item.id), ["other"]);
});
test("cards calculam volumes, clientes únicos e aprovação apenas sobre decisões", () => {
  const entries = liaPromptEntries([item("a", { reviewStatus: "approved", tested: true, sentAt: "2026-11-02T12:00:00Z", decisionAt: "2026-11-02T14:00:00Z" }), item("b", { reviewStatus: "rejected", sentAt: "2026-11-02T12:00:00Z", decisionAt: "2026-11-02T16:00:00Z" }), item("c", { reviewStatus: "conference", clientId: "654321" }), item("d")]);
  const metrics = liaPromptMetrics(entries);
  assert.deepEqual(metrics, { total: 4, approved: 1, rejected: 1, conference: 1, pending: 1, tested: 1, clients: 2, approvalRate: 50, averageReviewHours: 3 });
  assert.equal(liaPromptDistribution(entries, "status").reduce((sum, entry) => sum + entry.count, 0), metrics.total);
  assert.equal(liaPromptDistribution(entries, "responsible")[0].count, 4);
  assert.equal(liaPromptDistribution(entries, "tested").find(entry => entry.label === "Testado").count, 1);
});
test("datas inválidas usam o cadastro em Brasília e durações negativas ficam fora da média", () => {
  const entries = liaPromptEntries([item("a", { date: "2026-02-31", reviewStatus: "approved", sentAt: "2026-11-02T14:00:00Z", decisionAt: "2026-11-02T12:00:00Z" }), item("b", { date: "2026-11-02T02:30:00Z", tested: "false" })]);
  assert.deepEqual(entries.map(entry => entry.date), ["2026-10-31", "2026-11-01"]);
  assert.equal(liaPromptMetrics(entries).averageReviewHours, null);
  assert.equal(liaPromptMetrics(entries).tested, 0);
  assert.deepEqual(liaPromptMonthlyVolume(entries), [{ label: "10/2026", value: 1 }, { label: "11/2026", value: 1 }]);
  assert.equal(liaPromptMetrics([]).total, 0); assert.equal(liaPromptMetrics([]).approvalRate, 0);
});
