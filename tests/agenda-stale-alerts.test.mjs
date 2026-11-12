import assert from "node:assert/strict";
import test from "node:test";
import { agendaNeedsStatusUpdate, agendaStatusAlerts } from "../lib/agenda-stale-alerts.ts";

const now = Date.parse("2026-11-12T12:00:00-03:00");
const pending = (overrides = {}) => ({
  id: "appointment", title: "Reunião", startsAt: "2026-11-09T23:30:00-03:00",
  statusChangedAt: "2026-11-01T10:00:00-03:00", responsibleUserId: "me", statusName: "Agendado",
  ...overrides,
});

test("o alerta começa na terceira data anterior, sem incluir hoje, futuro ou os dois dias anteriores", () => {
  for (const day of [10, 11, 12, 13, 30]) {
    assert.equal(agendaNeedsStatusUpdate(pending({ startsAt: `2026-11-${day}T00:00:00-03:00` }), now), false, `dia ${day}`);
  }
  assert.equal(agendaNeedsStatusUpdate(pending(), now), true);
  assert.equal(agendaNeedsStatusUpdate(pending({ startsAt: "2026-10-31T10:00:00-03:00" }), now), true);
});

test("uma mudança de status recente reinicia a contagem mesmo com compromisso antigo", () => {
  const entry = pending({ startsAt: "2026-11-01T10:00:00-03:00" });
  assert.equal(agendaNeedsStatusUpdate({ ...entry, statusChangedAt: "2026-11-10T00:00:00-03:00" }, now), false);
  assert.equal(agendaNeedsStatusUpdate({ ...entry, statusChangedAt: "2026-11-09T23:59:59-03:00" }, now), true);
});

test("a virada do dia segue Brasília, inclusive quando UTC já está na data seguinte", () => {
  const entry = pending({ startsAt: "2026-11-10T02:30:00Z" }); // dia 9 em Brasília
  assert.equal(agendaNeedsStatusUpdate(entry, Date.parse("2026-11-12T02:59:59Z")), false);
  assert.equal(agendaNeedsStatusUpdate(entry, Date.parse("2026-11-12T03:00:00Z")), true);
  assert.equal(agendaNeedsStatusUpdate(pending({ startsAt: "2026-11-10T03:00:00Z" }), now), false);
});

test("conta datas anteriores corretamente na virada do mês e do ano", () => {
  const entry = pending({ startsAt: "2026-12-30T20:00:00-03:00", statusChangedAt: "2026-12-29T20:00:00-03:00" });
  assert.equal(agendaNeedsStatusUpdate(entry, Date.parse("2027-01-01T23:59:59-03:00")), false);
  assert.equal(agendaNeedsStatusUpdate(entry, Date.parse("2027-01-02T00:00:00-03:00")), true);
});

test("ignora datas inválidas ou ausência da última atualização", () => {
  for (const overrides of [{ startsAt: "invalid" }, { statusChangedAt: "invalid" }, { statusChangedAt: null }, { statusChangedAt: undefined }]) {
    assert.equal(agendaNeedsStatusUpdate(pending(overrides), now), false);
  }
  assert.equal(agendaNeedsStatusUpdate(pending(), NaN), false);
});

test("exibe somente compromissos agendados do responsável atual", () => {
  const commitments = [pending(), pending({ id: "other", responsibleUserId: "someone" }), pending({ id: "done", statusName: "Concluído" })];
  assert.deepEqual(agendaStatusAlerts({ commitments, currentUserId: "me", now }).map(entry => entry.id), ["appointment"]);
  assert.deepEqual(agendaStatusAlerts({ commitments, now }), []);
});

test("alertas antigos do servidor não reaparecem após reagendar, atualizar ou remover compromissos", () => {
  const alerts = [pending()];
  for (const commitments of [[], [pending({ startsAt: "2026-11-20T10:00:00-03:00" })], [pending({ statusName: "Concluído" })], [pending({ statusChangedAt: "2026-11-12T10:00:00-03:00" })]]) {
    assert.deepEqual(agendaStatusAlerts({ alerts, commitments, currentUserId: "me", now }), []);
  }
});

test("quando apenas os alertas do servidor estão disponíveis, ainda exige três datas retroativas", () => {
  const alerts = [pending(), pending({ id: "future", startsAt: "2026-11-20T10:00:00-03:00" }), pending({ id: "today", startsAt: "2026-11-12T10:00:00-03:00" })];
  assert.deepEqual(agendaStatusAlerts({ alerts, now }).map(entry => entry.id), ["appointment"]);
});
