import assert from "node:assert/strict";
import test from "node:test";
import { calculateCommission, customerSuccessScore, defaultSalesTiers, validSalesTiers, validScoreTiers, parseCommissionRule, findCommissionRule, journeyCommissionDate, commissionDate } from "../lib/commission-rules.ts";
import { commercialCommissionSource, liaCommissionStages } from "../lib/commission-sources.ts";
import { liaFinalFollowupDays } from "../lib/lia-followup.ts";
import { analyticsColor, chartScale, distributionEntries, percentageChange, isCompletedAnalyticsStatus } from "../lib/analytics-charts.ts";

const tiers = [{ min: 0, max: 50, percentage: 5 }, { min: 50, max: 75, percentage: 10 }, { min: 75, max: 100, percentage: 15 }];
const rule = { kind: "commissionRule", scope: "cs", employeeId: "employee", employeeName: "Colaborador", product: "*", type: "percentage", value: 0, scoreTiers: tiers };

test("Comercial seleciona a faixa pelo total do colaborador e aplica o percentual ao total inteiro", () => {
  const commercial = {...rule, scope:"commercial", scoreTiers:undefined, salesTiers:defaultSalesTiers};
  for (const [total, payout] of [[0,0],[299900,104965],[299999,105000],[300000,120000],[449900,179960],[449999,180000],[450000,225000],[1000000,500000]])
    assert.equal(calculateCommission(commercial,total,null,total)?.cents,payout);
  assert.equal(calculateCommission(commercial,150000,null,450000)?.cents,75000);
  assert.equal(calculateCommission(commercial,150000,null,300000)?.cents,60000);
  assert.equal(validSalesTiers(defaultSalesTiers),true);
  for (const invalid of [[], [{minCents:1,maxCents:null,percentage:35}], [{minCents:0,maxCents:300000,percentage:35}], [{minCents:0,maxCents:null,percentage:101}], [{minCents:0,maxCents:300000,percentage:35},{minCents:299999,maxCents:null,percentage:40}]]) {
    assert.equal(validSalesTiers(invalid),false);
    assert.equal(calculateCommission({...commercial,salesTiers:invalid},100000,null,100000),null);
  }
  const allocations=[0,1,2].map(offset=>calculateCommission(commercial,1,null,3,offset).cents);
  assert.equal(allocations.reduce((sum,n)=>sum+n,0),calculateCommission(commercial,3,null,3).cents);
});

test("vendas comerciais usam o ganho em Brasília e excluem retenção, qualificação e venda direta", () => {
  const item={module:"commercial",record_type:"Lead comercial",status:"Ganho",description:JSON.stringify({kind:"commercialLead",wonAt:"2026-11-01T02:30:00Z",stage:"Ganho",seller:"Ana",products:[{name:"LIA",quantity:2,unitValue:500}]}),amount_cents:100000,updated_at:"2026-11-10T12:00:00Z"};
  assert.equal(commercialCommissionSource(item).day,"2026-10-31");
  assert.equal(commercialCommissionSource(item).valueCents,100000);
  for(const record_type of ["Lead de retenção","Lead de qualificação"])assert.equal(commercialCommissionSource({...item,record_type}),null);
  assert.equal(commercialCommissionSource({...item,description:JSON.stringify({kind:"directSale",stage:"Ganho"})}),null);
  const custom={...item,description:JSON.stringify({kind:"commercialLead",funnel:"Funil",stage:"Contrato aceito",wonAt:"2026-10-15"})};
  const catalogs=[{catalog:"funnelStage",name:"Funil",description:JSON.stringify({f:"c",s:[["Contrato aceito","blue",1]]})}];
  assert.equal(commercialCommissionSource(custom,catalogs).day,"2026-10-15");
  catalogs[0].description=JSON.stringify({f:"c",s:[["Contrato aceito","blue",0]]});
  assert.equal(commercialCommissionSource(custom,catalogs),null);
});

test("LIA entra na competência no onboarding e calcula percentual por cliente, exibindo as etapas", () => {
  assert.equal(journeyCommissionDate("lia",{phase:"onboarding"},"2026-11-01T02:30:00Z"),"2026-10-31");
  assert.equal(calculateCommission({...rule,scope:"lia",scoreTiers:undefined,value:50},50000,null).cents,25000);
  const stages=liaCommissionStages({configurationStartedAt:"2026-10-01T12:00:00Z"},"AcompanhamentoFinal");
  assert.equal(stages.configuration,"2026-10-01T12:00:00Z");assert.equal(stages.tests,"Concluída");assert.equal(stages.release,"Concluída");assert.equal(stages.current,"Acompanhamento");
  assert.equal(liaCommissionStages({},"Concluida").current,"Concluído");
  assert.equal(liaFinalFollowupDays("2026-10-31T23:00:00-03:00",new Date("2026-11-03T00:00:00-03:00")),3);
  assert.equal(liaFinalFollowupDays(undefined),0);
});

test("regras salvas são aplicadas à área e ao colaborador corretos, inclusive cadastros antigos",()=>{
  const saved=parseCommissionRule(JSON.stringify({...rule,kind:undefined,employeeId:"",employeeName:"  Amanda   Pérri "}));
  assert.ok(saved);
  assert.equal(findCommissionRule([saved],{scope:"cs",employeeId:"amanda",employeeName:"Amanda Perri",product:"Acompanhamento de ativação"}),saved);
  assert.equal(findCommissionRule([saved],{scope:"lia",employeeId:"amanda",employeeName:"Amanda Perri",product:"Acompanhamento"}),undefined);
  assert.equal(findCommissionRule([{...rule,employeeId:"old-id"}],{scope:"cs",employeeId:"new-id",employeeName:"Colaborador",product:"*"}),undefined);
  assert.equal(calculateCommission(saved,200000,120)?.cents,30000);
  assert.equal(parseCommissionRule('{"kind":"outro","scope":"cs"}'),null);
});

test("CS gera comissão no mês de início e somente depois de entrar em acompanhamento",()=>{
  const created="2026-11-02T12:00:00Z";
  const manual={phase:"tracking",startDate:"2026-10-15",trackingStartedAt:"2026-10-15T00:00:00-03:00"};
  assert.equal(journeyCommissionDate("cs",manual,created),"2026-10-15");
  assert.equal(journeyCommissionDate("cs",{...manual,phase:"onboarding"},created),null);
  assert.equal(journeyCommissionDate("cs",{phase:"validation",startDate:"2026-10-15"},created),null);
  assert.equal(journeyCommissionDate("cs",{...manual,trackingStartedAt:"2026-11-01T02:30:00Z"},created),"2026-10-31");
  assert.equal(journeyCommissionDate("cs",{...manual,trackingStartedAt:"2026-11-01T03:30:00Z"},created),"2026-11-01");
  assert.equal(journeyCommissionDate("cs",{...manual,phase:"finished"},created),"2026-10-15");
  assert.equal(journeyCommissionDate("cs",{phase:"tracking"},created),null);
  assert.equal(commissionDate("2026-02-30"),null);assert.equal(commissionDate("2026-02-30T12:00:00Z"),null);
  assert.equal(journeyCommissionDate("lia",{startDate:"2026-09-20"},created),"2026-09-20");
  assert.equal(journeyCommissionDate("lia",{startDate:"2026-02-30"},created),null);
  assert.equal(journeyCommissionDate("lia",{},created),"2026-11-02");
  assert.equal(journeyCommissionDate("cs",{...manual,trackingStartedAt:"inválida"},created),null);
});

test("comissão de CS usa o percentual correto nos limites das faixas e nos scores Plus", () => {
  for (const [score, expected] of [[0, 0], [49.99, 0], [50, 10000], [74.99, 10000], [75, 20000], [100, 20000], [100.01, 30000], [200, 30000], [350, 30000]]) {
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

test("quatro faixas preservam os percentuais configurados e a faixa acima de 100 não tem teto",()=>{const bands=[{min:0,max:50,percentage:0},{min:50,max:75,percentage:7},{min:75,max:100,percentage:12},{min:100,max:null,percentage:19}];assert.equal(validScoreTiers(bands),true);for(const [score,cents] of [[49,0],[50,7000],[75,12000],[100,12000],[101,19000],[450,19000]])assert.equal(calculateCommission({...rule,scoreTiers:bands},100000,score)?.cents,cents);});
