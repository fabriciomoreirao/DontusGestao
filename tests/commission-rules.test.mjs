import assert from "node:assert/strict";
import test from "node:test";
import { calculateCommission, customerSuccessScore, validScoreTiers } from "../lib/commission-rules.ts";
import { analyticsColor, chartScale, distributionEntries, percentageChange, isCompletedAnalyticsStatus } from "../lib/analytics-charts.ts";

const tiers = [{ min: 0, max: 50, percentage: 5 }, { min: 50, max: 75, percentage: 10 }, { min: 75, max: 100, percentage: 15 }];
const rule = { kind: "commissionRule", scope: "cs", employeeId: "employee", employeeName: "Colaborador", product: "*", type: "percentage", value: 0, scoreTiers: tiers };

test("comissão de CS usa o percentual correto nos limites das faixas e nos scores Plus", () => {
  for (const [score, expected] of [[0, 10000], [49.99, 10000], [50, 20000], [74.99, 20000], [75, 30000], [100, 30000], [200, 30000]]) {
    assert.equal(calculateCommission(rule, 200000, score)?.cents, expected, `score ${score}`);
    assert.match(calculateCommission(rule, 200000, score)?.label ?? "", new RegExp(`score ${score}%`));
  }
});

test("score de Comissões usa a mesma base, utilização e Plus da jornada de CS", () => {
  const base = ["Agenda", "Financeiro", "Estoque", "Prontuário"];
  assert.equal(customerSuccessScore({ featuresBase: base, featuresActive: ["AGENDA", "Financeiro"] }), 50);
  assert.equal(customerSuccessScore({ featuresBase: base, featuresActive: ["Agenda", "Financeiro", "Estoque"] }), 75);
  assert.equal(customerSuccessScore({ featuresBase: ["Agenda"], featuresActive: ["Agenda"], featuresPlus: ["Estoque", "ESTOQUE", "Agenda"] }), 200);
  assert.equal(customerSuccessScore({ featuresBase: base, featuresActive: ["Agenda Plus"] }), 0);
  assert.equal(customerSuccessScore({ featuresBase: [], featuresActive: ["agenda"] }, base), 25);
  assert.equal(customerSuccessScore({ featuresBase: [], featuresActive: ["agenda"] }), 0);
});

test("faixas inválidas ou score ausente impedem um cálculo de CS", () => {
  assert.equal(validScoreTiers(tiers), true);
  for (const invalid of [[], [{ min: 1, max: 100, percentage: 5 }], [{ min: 0, max: 90, percentage: 5 }], [{ min: 0, max: 100, percentage: 101 }], [{ min: 0, max: 100, percentage: -1 }], [{ min: 0, max: 50, percentage: 5 }, { min: 49, max: 100, percentage: 8 }], [{ min: 0, max: 50, percentage: 5 }, { min: 51, max: 100, percentage: 8 }]]) {
    assert.equal(validScoreTiers(invalid), false);
    assert.equal(calculateCommission({ ...rule, scoreTiers: invalid }, 100000, 75), null);
  }
  for (const score of [null, NaN, Infinity, -1]) assert.equal(calculateCommission(rule, 100000, score), null);
});

test("regras anteriores de CS continuam válidas e LIA e Comercial calculam sem score", () => {
  assert.equal(calculateCommission({ ...rule, scoreTiers: undefined, value: 12 }, 100000, 75)?.cents, 12000);
  for (const scope of ["lia", "commercial"]) {
    const ordinary = { ...rule, scope, scoreTiers: undefined, value: 10 };
    assert.equal(calculateCommission(ordinary, 15990, null)?.cents, 1599);
    assert.equal(calculateCommission({ ...ordinary, type: "fixed", value: 19.9 }, 15990, null)?.cents, 1990);
  }
});

test("escalas dos gráficos incluem zero e todos os valores sem exagerar barras vazias", () => {
  for (const values of [[0, 0], [1, 3, 7], [100, 251, 930], [9999999]]) {
    const scale = chartScale(values);
    assert.equal(scale.ticks[0], 0);
    assert.ok(scale.maximum >= Math.max(...values));
    assert.equal(scale.ticks.at(-1), scale.maximum);
    assert.ok(scale.ticks.every((value, index) => index === 0 || value > scale.ticks[index - 1]));
  }
});

test("distribuição mantém o total ao agrupar categorias menores em Outros", () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({ label: `Categoria ${index}`, count: index + 1 }));
  const distribution = distributionEntries(entries, 5);
  assert.equal(distribution.length, 6);
  assert.equal(distribution.at(-1)?.label, "Outros");
  assert.equal(distribution.reduce((sum, entry) => sum + entry.count, 0), entries.reduce((sum, entry) => sum + entry.count, 0));
  assert.deepEqual(distributionEntries([{ label: "Sem registros", count: 0 }]), []);
});

test("comparações não inventam crescimento percentual quando não há base anterior", () => {
  assert.equal(percentageChange(15, 10), 50);
  assert.equal(percentageChange(0, 10), -100);
  assert.equal(percentageChange(10, 0), null);
  assert.equal(percentageChange(0, 0), 0);
});

test("aguardar aprovação não conta como conclusão nem recebe a cor de um resultado aprovado", () => {
  for (const status of ["Aguardando aprovação", "Pendente de aprovação", "Em aprovação", "Finalizado por falta de retorno", "Cancelada"]) assert.equal(isCompletedAnalyticsStatus(status), false);
  for (const status of ["Aprovada", "Resolvida", "Concluída", "Ganho"]) assert.equal(isCompletedAnalyticsStatus(status), true);
  assert.equal(analyticsColor("Aguardando aprovação", 0), "#d97706");
  assert.equal(analyticsColor("Resolvida", 0), "#0d9488");
});
