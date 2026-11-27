import test from "node:test";
import assert from "node:assert/strict";
import {
  retentionEntries,
  retentionOnboardingLeadIds,
  summarizeRetention,
  matchesRetentionPeriod,
} from "../lib/retention-indicators.ts";
const item = (id, detail = {}, patch = {}) => ({
  id,
  module: "commercial",
  record_type: "Lead de retenção",
  title: id,
  owner: "Ana",
  team: "CS",
  status: "NovoLead",
  amount_cents: 0,
  created_at: "2026-11-01",
  updated_at: "2026-11-17",
  description: JSON.stringify({
    kind: "commercialLead",
    funnel: "Retenção",
    stage: "Entrada",
    ...detail,
  }),
  ...patch,
});
test("totais e agrupamentos preservam encaminhamentos reais e priorizam resultados sem sucesso", () => {
  const items = [
    item("new", { version: "Maxi" }),
    item("forwarded", { version: "Maxi" }),
    item("old", { onboarding: { sentAt: "2026-11-17" } }),
    item("failed", {
      stage: "Sem sucesso",
      onboarding: { sentAt: "2026-11-17" },
    }),
    item("final-label", { stage: "Finalizado" }),
    item("cycle"),
    item(
      "journey",
      {
        kind: "csJourney",
        track: "retention",
        sourceLeadId: "forwarded",
        cycles: [{ sourceRetentionLeadId: "cycle" }],
      },
      { module: "cs" },
    ),
  ];
  const rows = retentionEntries(items, "commercial:retention"),
    report = summarizeRetention(rows);
  assert.equal(report.total, 6);
  assert.equal(report.success, 3);
  assert.equal(report.failure, 1);
  assert.equal(report.process, 2);
  assert.equal(report.conversion, 50);
  assert.equal(
    report.versionRows.reduce((sum, row) => sum + row.total, 0),
    report.total,
  );
  assert.equal(report.ownerRows[0].success, 3);
  assert.equal(rows.filter((row) => row.version === "Sem versão").length, 4);
});
test("o cálculo não lê anexos de outros módulos e percorre vínculos uma única vez", () => {
  const unrelated = Array.from({ length: 200 }, (_, id) => ({
    id: `hr-${id}`,
    module: "hr",
    get description() {
      throw Error("Anexo de outro módulo não pode ser lido");
    },
  }));
  let reads = 0;
  const raw = JSON.stringify({
    kind: "csJourney",
    track: "retention",
    sourceLeadId: "lead-1",
  });
  const journey = {
    id: "journey",
    module: "cs",
    get description() {
      reads++;
      return raw;
    },
  };
  const leads = Array.from({ length: 1000 }, (_, id) => item(`lead-${id}`));
  const rows = retentionEntries(
    [...unrelated, journey, ...leads],
    "commercial:retention",
  );
  assert.equal(rows.length, 1000);
  assert.equal(summarizeRetention(rows).success, 1);
  assert.ok(reads <= 3, `Vínculo lido ${reads} vezes`);
});
test("vínculos de ativação e descrições legadas inválidas não viram sucesso de retenção", () => {
  const ids = retentionOnboardingLeadIds([
    item(
      "active",
      { kind: "csJourney", track: "activation", sourceLeadId: "lead" },
      { module: "cs" },
    ),
    { id: "broken", module: "cs", description: "invalid" },
  ]);
  assert.equal(ids.size, 0);
  assert.equal(
    retentionEntries([item("lead")], "commercial:retention")[0].outcome,
    "process",
  );
});

test("os 18 cards enviados ao onboarding contam antes da paginação, mesmo com apenas 10 vínculos", () => {
  const cards = Array.from({ length: 18 }, (_, i) =>
    item(`sent-${i}`, {
      stage: "Enviado para onboarding",
      seller: i < 11 ? "Ana" : "Bia",
      ...(i < 10 ? { onboarding: { sentAt: "2026-11-17" } } : {}),
    }),
  );
  const rows = retentionEntries(
    [...cards, item("waiting")],
    "commercial:retention",
  );
  const report = summarizeRetention(rows);
  assert.equal(report.success, 18);
  assert.equal(report.total, 19);
  assert.equal(report.process, 1);
  assert.equal(report.ownerRows.find((row) => row.name === "Ana").success, 11);
  assert.equal(report.ownerRows.find((row) => row.name === "Bia").success, 7);
});

test("etapas configuradas e seus resultados respeitam o funil e a etapa atual", () => {
  const catalogs = [
    {
      catalog: "funnelStage",
      name: "Retenção",
      description: JSON.stringify({
        s: [
          ["Entregue", "", true, false],
          ["Sem aderência", "", false, true],
        ],
      }),
    },
    {
      catalog: "funnelStage",
      name: "Outro",
      description: JSON.stringify({
        stages: [{ name: "Entregue", won: false, lost: true }],
      }),
    },
  ];
  const rows = retentionEntries(
    [
      item("won", { stage: "Entregue" }),
      item("lost", {
        stage: "Sem aderência",
        onboarding: { sentAt: "2026-11-17" },
      }),
      item("other", { stage: "Entregue", funnel: "Outro" }),
      item(
        "stale-status",
        { stage: "Enviado para onboarding" },
        { status: "Perdido" },
      ),
      item("closed", { stage: "Finalizado" }),
    ],
    "commercial:retention",
    catalogs,
  );
  assert.deepEqual(
    rows.map((row) => row.outcome),
    ["success", "failure", "failure", "success", "process"],
  );
});

test("o período usa criação ou atualização do card como no kanban e respeita Brasília", () => {
  const rows = retentionEntries(
    [
      item(
        "created",
        {},
        { created_at: "2026-11-10", updated_at: "2026-12-01" },
      ),
      item(
        "updated",
        { entryDate: "2026-01-01" },
        { created_at: "2026-01-01", updated_at: "2026-11-10T23:59:59-03:00" },
      ),
      item(
        "before",
        {},
        { created_at: "2026-01-01", updated_at: "2026-11-10T01:00:00Z" },
      ),
    ],
    "commercial:retention",
  );
  assert.deepEqual(
    rows
      .filter((row) => matchesRetentionPeriod(row, "2026-11-10..2026-11-10"))
      .map((row) => row.item.id),
    ["created", "updated"],
  );
  assert.equal(rows.filter((row) => matchesRetentionPeriod(row, "")).length, 3);
});
