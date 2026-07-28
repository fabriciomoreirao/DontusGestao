import assert from "node:assert/strict";
import test from "node:test";
import { allowedNextStatuses, canTransition, initialStatus } from "../lib/domain.ts";

test("aplica os estados iniciais por domínio", () => {
  assert.equal(initialStatus("commercial"), "NovoLead");
  assert.equal(initialStatus("cs"), "PendenteAgendamento");
  assert.equal(initialStatus("lia"), "AguardandoKickoff");
  assert.equal(initialStatus("ti"), "Nova");
  assert.equal(initialStatus("finance"), "Rascunho");
});

test("bloqueia saltos arbitrários e estados terminais", () => {
  assert.equal(canTransition("commercial", "NovoLead", "EmContato"), true);
  assert.equal(canTransition("commercial", "NovoLead", "Ganho"), false);
  assert.deepEqual(allowedNextStatuses("commercial", "Ganho"), []);
  assert.equal(canTransition("ti", "Nova", "Concluida"), false);
});

test("permite estados de espera previstos sem duplicação", () => {
  const next = allowedNextStatuses("lia", "EmTesteCliente");
  assert.ok(next.includes("EmAjustes"));
  assert.ok(next.includes("BloqueadaPeloCliente"));
  assert.equal(new Set(next).size, next.length);
});
