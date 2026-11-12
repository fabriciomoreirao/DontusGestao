import test from "node:test";
import assert from "node:assert/strict";
import { LIA_STAGES, activeLiaStages, liaStageForStatus, liaContractedPlan, liaPlanOptions, liaClientRowError, liaClientPayload } from "../lib/lia-journey.ts";
import { directSaleFollowup } from "../lib/direct-sale-routing.ts";

test("o seletor usa apenas as abas atuais, sem reproduzir status internos ou etapas inativas", () => {
  const stages = activeLiaStages([{ id: "off", catalog: "liaWorkflowStage", name: "Antiga", active: false }, { id: "on", catalog: "liaWorkflowStage", name: "Entrega especial", active: true }]);
  assert.equal(stages[0].key, "validation");
  assert.equal(stages.length, LIA_STAGES.length + 1);
  assert.equal(stages.some(stage => stage.label === "Antiga"), false);
  for (const status of ["AguardandoAprovacao", "GoLiveAgendado", "EmProducaoAssistida", "ImplantacaoPrincipalConcluida", "ConfigurandoCRC"]) assert.equal(liaStageForStatus(status, stages).key, "release");
  assert.equal(liaStageForStatus("Entrega especial", stages).key, "custom:on");
  assert.equal(liaStageForStatus("Antiga", stages).key, "validation");
});

test("o plano explícito prevalece e registros antigos recuperam o plano dos produtos LIA", () => {
  const products = [{ product: "Dontus", plan: "Essencial" }, { product: "LIA", plan: "Performance" }, { product: "LIA CRC", plan: "Performance" }];
  assert.equal(liaContractedPlan({ products }), "Performance");
  assert.equal(liaContractedPlan({ products, liaPlan: " Growth " }), "Growth");
  assert.equal(liaContractedPlan({ products: [products[0]] }), "");
});

test("seleciona planos LIA ativos dos cadastros e produtos, sem planos de outros produtos", () => {
  const catalogs = [
    { id: "a", catalog: "liaPlan", name: "Growth", active: true },
    { id: "b", catalog: "liaPlan", name: "Antigo", active: false },
    { id: "c", catalog: "commercialProduct", name: "LIA", active: true, description: JSON.stringify({ plans: [{ name: "Performance", active: true }, { name: "Growth", active: true }, { name: "Legado", active: false }] }) },
    { id: "d", catalog: "commercialProduct", name: "Dontus", active: true, description: JSON.stringify({ plans: [{ name: "Completo", active: true }] }) },
    { id: "e", catalog: "commercialProduct", name: "LIA CRC", active: true, description: "invalid" },
  ];
  assert.deepEqual(liaPlanOptions(catalogs), ["Growth", "Performance"]);
});

const row = { key: "row", name: "Clínica", clientId: "123456", liaPlan: "Performance", value: "149.90", whatsapp: "55999999999", owner: "Ana", requestType: "Manual", origin: "Operação", startDate: "2026-10-01" };

test("a importação exige dados completos, IDs únicos, valores e datas válidas", () => {
  assert.equal(liaClientRowError(row, [], "2026-11-12"), "");
  for (const patch of [{ clientId: "123" }, { liaPlan: " " }, { owner: "" }, { name: "" }, { value: "-1" }, { value: "invalid" }, { value: "1000000001" }, { startDate: "2026-11-13" }, { startDate: "2026-02-31" }]) assert.notEqual(liaClientRowError({ ...row, ...patch }, [], "2026-11-12"), "");
  assert.match(liaClientRowError(row, ["123456"], "2026-11-12"), /já está/);
});

test("o cliente manual entra em validação, preservando plano, valor e início informado", () => {
  const payload = liaClientPayload(row, "Gestora", false, "2026-11-12T12:00:00Z", "history");
  const detail = JSON.parse(payload.description);
  assert.equal(payload.status, "Validacao"); assert.equal(payload.amountCents, 14990); assert.equal(payload.owner, "Ana");
  assert.equal(detail.startDate, "2026-10-01"); assert.equal(detail.liaPlan, "Performance"); assert.equal(detail.importedCompleted, undefined);
});

test("a inserção em concluídos registra importação e não inventa o período de acompanhamento final", () => {
  const payload = liaClientPayload(row, "Gestora", true, "2026-11-12T12:00:00Z", "history");
  const detail = JSON.parse(payload.description);
  assert.equal(payload.status, "Concluida"); assert.equal(detail.importedCompleted, true);
  assert.equal(detail.startDate, row.startDate); assert.equal(detail.finalFollowupStartedAt, undefined);
  assert.equal(detail.history[0].author, "Gestora"); assert.match(detail.history[0].text, /importado/);
});

test("vendas diretas propagam o plano selecionado para a LIA", () => {
  const sale = { clientId: "123456", saleId: "260001", saleDate: "2026-11-12", name: "Clínica", seller: "Ana", followUpTrack: "lia", liaPlan: "Growth", version: "Completo", origin: "Indicação", totalCents: 20000, products: [{ product: "Dontus", plan: "Completo", unitValue: 200, quantity: 1 }] };
  const detail = directSaleFollowup(sale, "lead-id", "2026-11-12T12:00:00Z", "history");
  assert.equal(detail.liaPlan, "Growth"); assert.equal(detail.sourceLeadId, "lead-id"); assert.equal(detail.clientId, "123456");
});
