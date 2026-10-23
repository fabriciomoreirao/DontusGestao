import assert from "node:assert/strict";
import test from "node:test";
import { canResumeCsJourney, isClosedCsJourney, resumeCsJourney, csOutcome } from "../lib/cs-journey.ts";

for (const phase of ["unsuccessful", "cancelled", "cancelledWithoutTraining"]) {
  test(`retoma ${phase} em validação e preserva o ciclo anterior`, () => {
    const before = { kind: "csJourney", phase, status: "Finalizado por falta de retorno", clientId: "123456", owner: "Ana", track: "retention", featuresActive: ["Agenda"], follows: [{text: "Contato anterior"}], firstMeetingCommitmentId: "agenda-1", firstMeetingCompletedAt: "2026-10-01", trainingCompletedAt: "2026-10-02", trackingStartedAt: "2026-10-02", checkedBy: "Gestor", cancellationPendingApproval: true, cancellationTaskId: "cancel-1", finalReason: "Sem contato", usageByDay: { "1": "Utilizando" } };
    const result = resumeCsJourney(before, "2026-10-22T12:00:00Z", "Ana");
    assert.equal(result.phase, "validation"); assert.equal(result.status, "Pendente");
    assert.equal(result.clientId, before.clientId); assert.equal(result.track, before.track); assert.deepEqual(result.follows, before.follows);
    assert.equal(result.trainingCompletedAt, undefined); assert.equal(result.checkedBy, undefined); assert.equal(result.cancellationPendingApproval, undefined); assert.equal(result.firstMeetingCommitmentId, undefined);
    assert.deepEqual(result.usageByDay, {}); assert.deepEqual(result.featuresActive, before.featuresActive);
    assert.equal(result.previousCycles[0].firstMeetingCommitmentId, "agenda-1"); assert.equal(result.previousCycles[0].finalReason, "Sem contato");
    assert.equal(before.phase, phase); assert.equal(before.cancellationPendingApproval, true);
  });
}

test("não retoma jornadas ativas nem finalizadas com sucesso", () => {
  for (const phase of ["validation", "tracking", "finished"]) {
    assert.equal(canResumeCsJourney(phase), false);
    assert.throws(() => resumeCsJourney({phase}, "2026-10-22", "Ana"));
  }
  assert.equal(isClosedCsJourney("unsuccessful"), true);
  assert.equal(isClosedCsJourney("finished"), true);
  assert.equal(isClosedCsJourney("conference"), false);
});

test("indicadores distinguem sucesso, falta de retorno e cancelamento", () => {
  assert.equal(csOutcome("unsuccessful", "Finalizado por falta de retorno"), "failure");
  assert.equal(csOutcome("", "Finalizado sem sucesso"), "failure");
  assert.equal(csOutcome("cancelledWithoutTraining", "Cancelado sem treinamento"), "failure");
  assert.equal(csOutcome("finished", "Finalizado"), "success");
  assert.equal(csOutcome("tracking", "Em acompanhamento"), "active");
});

test("retomadas sucessivas mantêm cada ciclo sem duplicar o histórico", () => {
  const first = resumeCsJourney({ phase:"cancelled", follows:[{text:"Primeiro contato"}], firstMeetingCommitmentId:"antigo" }, "2026-10-22", "Ana");
  const second = resumeCsJourney({...first, phase:"unsuccessful", firstMeetingCommitmentId:"novo"}, "2026-10-23", "Ana");
  assert.equal(second.previousCycles.length, 2);
  assert.equal(second.previousCycles[1].firstMeetingCommitmentId, "novo");
  assert.equal(second.follows.length, 1);
});
