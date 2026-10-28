import assert from "node:assert/strict";
import test from "node:test";
import { availableCommercialSlots, commercialDateKey, commercialSlotStartsAt, COMMERCIAL_SLOT_TIMES } from "../lib/commercial-scheduling.ts";

const now = Date.parse("2026-10-27T12:00:00Z"); // 09h em Brasília.
const slot = (fields = {}) => ({ agendaId: "cs", title: "Kick off", statusName: "Reservado", startsAt: "2026-10-27T12:30:00Z", endsAt: "2026-10-27T13:30:00Z", ...fields });
const slots = (fields = {}) => availableCommercialSlots({ date: "2026-10-27", agendaId: "cs", commitments: [], now, ...fields });

test("datas antigas não oferecem horários e hoje permite somente horários que ainda não passaram", () => {
  assert.deepEqual(slots({ date: "2026-10-21" }), []);
  assert.deepEqual(slots(), COMMERCIAL_SLOT_TIMES);
  assert.deepEqual(slots({ now: Date.parse("2026-10-27T14:16:00Z") }), ["14:00", "16:00"]);
  assert.deepEqual(slots({ now: Date.parse("2026-10-27T19:00:00Z") }), []);
  assert.deepEqual(slots({ date: "2026-10-28" }), COMMERCIAL_SLOT_TIMES);
});

test("disponibiliza com zero, um ou dois compromissos e bloqueia a partir do terceiro", () => {
  for (let count = 0; count <= 4; count++) {
    const commitments = Array.from({ length: count }, () => slot());
    assert.equal(slots({ commitments }).includes("09:30"), count < 3, `ocupação ${count}`);
    assert.equal(slots({ commitments }).includes("11:00"), true);
  }
});

test("conta apenas a agenda, data e minuto selecionados, ignorando cancelados", () => {
  const commitments = [slot(), slot(), ...Array.from({ length: 3 }, () => slot({ statusName: "Cancelado" })), slot({ agendaId: "diretoria" }), slot({ startsAt: "2026-10-28T12:30:00Z" }), slot({ startsAt: "2026-10-27T14:00:00Z" })];
  assert.equal(slots({ commitments }).includes("09:30"), true);
  commitments.push(slot({ startsAt: "2026-10-27T12:30:20Z" }));
  assert.equal(slots({ commitments }).includes("09:30"), false);
});

test("bloqueios por período ocultam o horário e bloqueios cancelados liberam a vaga", () => {
  const blocked = slot({ title: "[BLOQUEIO COMERCIAL] Reunião", startsAt: "2026-10-27T12:45:00Z", endsAt: "2026-10-27T13:00:00Z" });
  assert.equal(slots({ commitments: [blocked] }).includes("09:30"), false);
  assert.equal(slots({ commitments: [{ ...blocked, statusName: "Cancelado" }] }).includes("09:30"), true);
  assert.equal(slots({ commitments: [{ ...blocked, agendaId: "outra" }] }).includes("09:30"), true);
});

test("não oferece finais de semana, feriados, datas inválidas ou agenda ausente", () => {
  for (const date of ["", "inválida", "2026-10-31", "2026-11-01", "2027-02-31"]) assert.deepEqual(slots({ date }), []);
  assert.deepEqual(slots({ date: "2026-11-02", holiday: true }), []);
  assert.deepEqual(slots({ agendaId: undefined }), []);
});

test("usa Brasília na virada do dia e ao converter o horário selecionado", () => {
  assert.equal(commercialDateKey(Date.parse("2026-10-28T02:59:00Z")), "2026-10-27");
  assert.equal(commercialDateKey(Date.parse("2026-10-28T03:00:00Z")), "2026-10-28");
  assert.equal(commercialSlotStartsAt("2026-10-27", "09:30"), "2026-10-27T12:30:00.000Z");
  assert.equal(slots({ now: Date.parse("2026-10-27T12:30:00Z") }).includes("09:30"), false);
});
