import test from "node:test";
import assert from "node:assert/strict";
import {
  commercialAnalyticsEntries,
  commercialAnalyticsPeriod,
  previousCommercialPeriod,
  summarizeCommercialPeriod,
} from "../lib/commercial-analytics.ts";
const item = (id, detail = {}, patch = {}) => ({
  id,
  module: "commercial",
  record_type: "Lead comercial",
  title: id,
  owner: "Ana",
  team: "Comercial",
  status: "NovoLead",
  amount_cents: 10000,
  created_at: "2026-10-10T15:00:00Z",
  updated_at: "2026-11-16T15:00:00Z",
  description: JSON.stringify({
    kind: "commercialLead",
    stage: "Proposta",
    ...detail,
  }),
  ...patch,
});
test("vendas são contadas na data do ganho mesmo quando o lead entrou em outro mês", () => {
  const rows = commercialAnalyticsEntries(
    [
      item("ganho", {
        stage: "Ganho",
        wonAt: "2026-11-16T15:00:00Z",
        entryDate: "2026-10-10",
      }),
      item("aberto", { entryDate: "2026-11-16" }),
    ],
    "commercial:crm",
  );
  const report = summarizeCommercialPeriod(
    rows,
    commercialAnalyticsPeriod("month", "2026-11"),
  );
  assert.equal(report.sales.length, 1);
  assert.equal(report.revenue, 10000);
  assert.equal(report.cohort.length, 1);
  assert.equal(report.open.length, 1);
  assert.equal(report.conversion, 0);
});
test("a configuração da etapa decide o ganho; wonAt antigo e status divergente não criam vendas", () => {
  const catalogs = [
    {
      catalog: "funnelStage",
      name: "CRM",
      description: JSON.stringify({
        s: [
          ["Aceite", "#fff", true],
          ["Ganho antigo", "#fff", false],
        ],
      }),
    },
  ];
  const rows = commercialAnalyticsEntries(
    [
      item("a", { funnel: "CRM", stage: "Aceite", wonAt: "2026-11-16" }),
      item("b", { funnel: "CRM", stage: "Ganho antigo", wonAt: "2026-11-16" }),
      item(
        "c",
        { stage: "Proposta", wonAt: "2026-11-16" },
        { status: "Ganho" },
      ),
    ],
    "commercial:crm",
    catalogs,
  );
  assert.deepEqual(
    rows.map((row) => row.won),
    [true, false, false],
  );
});
test("receita mantém centavos, recupera produtos legados e preserva valor zero explícito", () => {
  const product = { product: "Sistema", value: 119.9, quantity: 2 };
  const rows = commercialAnalyticsEntries(
    [
      item(
        "products",
        { stage: "Ganho", products: [product] },
        { amount_cents: 0 },
      ),
      item(
        "zero",
        { stage: "Ganho", totalCents: 0, products: [product] },
        { amount_cents: 0 },
      ),
      item("cents", { stage: "Ganho" }, { amount_cents: 12345 }),
    ],
    "commercial:crm",
  );
  assert.deepEqual(
    rows.map((row) => row.amount),
    [23980, 0, 12345],
  );
});
test("totais reúnem CRM e venda direta uma vez e excluem qualificação, retenção e configuração", () => {
  const crm = item("crm", { stage: "Ganho" }),
    direct = item(
      "direct",
      { kind: "directSale", saleDate: "2026-11-16", totalCents: 20000 },
      { record_type: "Venda direta comercial" },
    );
  const rows = commercialAnalyticsEntries(
    [
      crm,
      crm,
      direct,
      item(
        "qualified",
        { stage: "Ganho" },
        { record_type: "Lead de qualificação" },
      ),
      item(
        "retention",
        { stage: "Ganho" },
        { record_type: "Lead de retenção" },
      ),
      item(
        "config",
        { kind: "commercialSettings" },
        { record_type: "Configuração comercial" },
      ),
    ],
    "commercial:combined",
  );
  assert.deepEqual(
    rows.map((row) => row.item.id),
    ["crm", "direct"],
  );
  assert.equal(
    summarizeCommercialPeriod(
      rows,
      commercialAnalyticsPeriod("month", "2026-11"),
    ).revenue,
    30000,
  );
});
test("semanas vão de segunda a domingo e comparam sete dias inclusive na virada do ano", () => {
  const period = commercialAnalyticsPeriod("week", "2027-01-01");
  assert.equal(period.start, "2026-12-28");
  assert.equal(period.end, "2027-01-03");
  assert.equal(previousCommercialPeriod(period, "week").start, "2026-12-21");
  assert.equal(
    previousCommercialPeriod(
      commercialAnalyticsPeriod("month", "2027-01"),
      "month",
    ).start,
    "2026-12-01",
  );
});
test("ganhos respeitam o dia de Brasília e não a data UTC ou a última edição", () => {
  const rows = commercialAnalyticsEntries(
    [
      item("before", { stage: "Ganho", wonAt: "2026-11-16T02:59:59Z" }),
      item("inside", { stage: "Ganho", wonAt: "2026-11-16T03:00:00Z" }),
    ],
    "commercial:crm",
  );
  assert.deepEqual(
    summarizeCommercialPeriod(
      rows,
      commercialAnalyticsPeriod("week", "2026-11-16"),
    ).sales.map((row) => row.item.id),
    ["inside"],
  );
});
test("conversão de uma semana não usa ganhos que só ocorreram em semanas posteriores", () => {
  const rows = commercialAnalyticsEntries(
    [
      item("late", {
        stage: "Ganho",
        entryDate: "2026-10-20",
        wonAt: "2026-11-05",
      }),
    ],
    "commercial:crm",
  );
  const report = summarizeCommercialPeriod(
    rows,
    commercialAnalyticsPeriod("week", "2026-10-20"),
  );
  assert.equal(report.cohort.length, 1);
  assert.equal(report.conversion, 0);
  assert.equal(report.sales.length, 0);
});

test("cada CRM contabiliza todos os ganhos pelo responsável atual e usa o valor persistido do card", () => {
  const catalogs = ["Sistema", "LIA"].map((name) => ({
    catalog: "funnelStage",
    name,
    description: JSON.stringify({ f: "c", s: [["Aceite", "#fff", 1]] }),
  }));
  const rows = commercialAnalyticsEntries(
    [
      item(
        "sistema",
        {
          funnel: "Sistema",
          stage: "Aceite",
          seller: "Maria",
          totalCents: 1,
          wonAt: "2026-11-16",
        },
        { owner: "Responsável legado", amount_cents: 25990 },
      ),
      item(
        "lia",
        {
          funnel: "LIA",
          stage: "Aceite",
          seller: "Maria",
          wonAt: "2026-11-16",
        },
        { owner: "Responsável legado", amount_cents: 10000 },
      ),
      item(
        "outro",
        { funnel: "Sistema", stage: "Aceite", wonAt: "2026-11-16" },
        { owner: "João", amount_cents: 30000 },
      ),
    ],
    "commercial:combined",
    catalogs,
  );
  const report = summarizeCommercialPeriod(
    rows.filter((row) => row.seller === "Maria"),
    commercialAnalyticsPeriod("month", "2026-11"),
  );
  assert.equal(report.sales.length, 2);
  assert.equal(report.revenue, 35990);
  assert.deepEqual(
    report.sales.map((row) => row.funnel),
    ["Sistema", "LIA"],
  );
});
test("total por vendedor reúne comercial e módulos por ID do CRM e normaliza variações do nome", () => {
  const catalogs = [
    {
      id: "comercial",
      catalog: "funnelStage",
      name: "CRM Comercial",
      description: JSON.stringify({
        f: "c",
        s: [["Venda confirmada", "#fff", 1]],
      }),
    },
    {
      id: "modulos",
      catalog: "funnelStage",
      name: "CRM Módulos",
      description: JSON.stringify({
        f: "c",
        s: [["Módulo contratado", "#fff", 1]],
      }),
    },
  ];
  const rows = commercialAnalyticsEntries(
    [
      item(
        "comercial",
        {
          funnelId: "comercial",
          funnel: "Nome antigo",
          stage: "Venda confirmada",
          seller: "Márcia Silva",
          wonAt: "2026-11-17",
        },
        { amount_cents: 21990 },
      ),
      item(
        "modulos",
        {
          funnelId: "modulos",
          funnel: "CRM Módulos",
          stage: "módulo contratado ",
          seller: "  MARCIA   SILVA ",
          wonAt: "2026-11-17",
        },
        { amount_cents: 6990 },
      ),
      item(
        "outro",
        {
          funnelId: "modulos",
          stage: "Módulo contratado",
          seller: "Outra pessoa",
          wonAt: "2026-11-17",
        },
        { amount_cents: 9990 },
      ),
    ],
    "commercial:combined",
    catalogs,
  );
  const report = summarizeCommercialPeriod(
    rows.filter((row) => row.seller === "Márcia Silva"),
    commercialAnalyticsPeriod("month", "2026-11"),
  );
  assert.equal(report.revenue, 28980);
  assert.equal(report.sales.length, 2);
  assert.deepEqual(
    report.sales.map((row) => row.funnel),
    ["CRM Comercial", "CRM Módulos"],
  );
});

test("totais incluem todos os cards de todos os CRMs, além do limite visual de mil registros", () => {
  const records = Array.from({ length: 1205 }, (_, index) =>
    item(
      String(index),
      {
        funnel: index % 2 ? "CRM Módulos" : "CRM Comercial",
        stage: "Ganho",
        seller: "Ana",
        wonAt: "2026-11-17",
      },
      { amount_cents: 101 },
    ),
  );
  const report = summarizeCommercialPeriod(
    commercialAnalyticsEntries([...records, records[0]], "commercial:combined"),
    commercialAnalyticsPeriod("month", "2026-11"),
  );
  assert.equal(report.sales.length, 1205);
  assert.equal(report.revenue, 121705);
});
