import assert from "node:assert/strict";
import test from "node:test";
import { agendaTimeSlots, positionAgendaEntries } from "../lib/agenda-time-grid.ts";

const event = (id, start, end) => ({ id, startsAt: `2026-11-02T${start}:00-03:00`, endsAt: `2026-11-02T${end}:00-03:00` });
test("a agenda oferece marcações de meia em meia hora durante o dia inteiro", () => {
  assert.equal(agendaTimeSlots.length, 48);
  assert.equal(agendaTimeSlots[18].label, "09:00");
  assert.equal(agendaTimeSlots[19].label, "09:30");
  assert.equal(agendaTimeSlots.at(-1).label, "23:30");
});
test("sobreposições compartilham a largura sem deslocar o horário e eventos adjacentes usam a largura inteira", () => {
  const rows = positionAgendaEntries([event("a", "09:00", "10:00"), event("b", "09:30", "10:30"), event("c", "10:30", "11:00")], "2026-11-02");
  assert.deepEqual(rows.map(row => [row.startMinute, row.endMinute, row.column, row.columns]), [[540,600,0,2], [570,630,1,2], [630,660,0,1]]);
});
test("compromissos que cruzam a meia-noite aparecem nos dois dias em Brasília", () => {
  const events = [{ id:"overnight", startsAt:"2026-11-03T02:30:00Z", endsAt:"2026-11-03T03:30:00Z" }];
  assert.deepEqual(positionAgendaEntries(events, "2026-11-02").map(row => [row.startMinute,row.endMinute]), [[1410,1440]]);
  assert.deepEqual(positionAgendaEntries(events, "2026-11-03").map(row => [row.startMinute,row.endMinute]), [[0,30]]);
  assert.deepEqual(positionAgendaEntries(events, "2026-11-04"), []);
});
test("a grade ignora intervalos inválidos e preserva os registros recebidos", () => {
  const entries = [event("valid", "11:00", "12:00"), event("reversed", "11:00", "10:00"), { id:"invalid", startsAt:"invalid", endsAt:"invalid" }];
  const before = structuredClone(entries);
  assert.equal(positionAgendaEntries(entries, "2026-11-02").length, 1);
  assert.deepEqual(entries, before);
});
