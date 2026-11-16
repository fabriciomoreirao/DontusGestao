import test from "node:test";
import assert from "node:assert/strict";
import { dashboardMessage, businessMessages } from "../lib/dashboard-message.ts";
import { pendingStrategicUnits, strategicTracking, strategicUnitJourney, lastStrategicInteraction } from "../lib/enterprise-tracking.ts";
import { enterpriseUnitScore, enterpriseHealthScore } from "../lib/enterprise-score.ts";

test("a frase permanece no mesmo dia e muda à meia-noite de Brasília", () => {
  const before = new Date("2026-11-17T02:59:59Z");
  const after = new Date("2026-11-17T03:00:00Z");
  assert.equal(dashboardMessage(before), dashboardMessage(new Date("2026-11-16T03:00:00Z")));
  assert.notEqual(dashboardMessage(before), dashboardMessage(after));
  assert.equal(new Set(businessMessages).size, businessMessages.length);
});

const unit = { id: "unit-1", customerId: "customer-1", externalId: "123456", features: [] };
const record = (id, detail, at = "2026-11-16T14:30:00Z") => ({ id, customer_id: "customer-1", updated_at: at, description: JSON.stringify({ kind: "csJourney", track: "activation", clientId: "123456", ...detail }) });

test("utilização segue o acompanhamento da unidade, inclusive zero e plus", () => {
  const journey = record("journey-1", { strategicNetworkId: "network-1", strategicUnitId: "unit-1", featuresBase: ["Agenda", "Caixa"], featuresActive: ["Agenda"], featuresPlus: ["Estoque"], usage: "Utilizando" });
  const tracking = strategicTracking(unit, "network-1", [journey]);
  assert.equal(tracking.trackingScore, 100);
  assert.equal(tracking.usageStatus, "Utilizando");
  assert.equal(enterpriseHealthScore([{ ...unit, ...tracking }]), 100);
  assert.equal(enterpriseUnitScore({ ...unit, trackingScore: 0 }), 0);
  assert.deepEqual(strategicTracking(unit, "network-1", []), {});
});

test("prioriza o vínculo explícito e não mistura unidades ou IDs vazios", () => {
  const linked = record("linked", { strategicNetworkId: "network-1", strategicUnitId: "unit-1" });
  const other = record("other", { strategicNetworkId: "network-2", strategicUnitId: "unit-2" }, "2026-11-17T15:00:00Z");
  const legacy = record("legacy", {}, "2026-11-17T15:00:00Z");
  assert.equal(strategicUnitJourney(unit, "network-1", [legacy, other, linked]).record.id, "linked");
  assert.equal(strategicUnitJourney(unit, "network-1", [other]), undefined);
  assert.equal(strategicUnitJourney({ id: "empty", externalId: "" }, "network-1", [legacy]), undefined);
});

test("conta apenas novas unidades e não trata edições internas como interação", () => {
  assert.equal(pendingStrategicUnits([{ pendingFollowUp: true }, {}, { pendingFollowUp: false }, { pendingFollowUp: true }]), 2);
  const history = [{ type: "Reunião", unitId: "unit-1", createdAt: "2026-11-15T10:00:00Z" }, { type: "Atualização interna", createdAt: "2026-11-16T15:00:00Z" }, { type: "Mensagem", unitId: "unit-2", createdAt: "2026-11-16T10:00:00Z" }];
  assert.equal(lastStrategicInteraction(history), "2026-11-16T10:00:00Z");
  assert.equal(lastStrategicInteraction(history, "unit-1"), "2026-11-15T10:00:00Z");
});
