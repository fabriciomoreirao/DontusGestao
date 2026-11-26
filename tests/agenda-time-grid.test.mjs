import assert from "node:assert/strict";
import test from "node:test";
import {
  agendaTimeSlots,
  agendaWeekdays,
  positionAgendaEntries,
  AGENDA_START_MINUTE,
  AGENDA_END_MINUTE,
} from "../lib/agenda-time-grid.ts";

const event = (id, start, end) => ({
  id,
  startsAt: `2026-11-02T${start}:00-03:00`,
  endsAt: `2026-11-02T${end}:00-03:00`,
});
test("a agenda oferece marcações de meia em meia hora entre 07h e 21h", () => {
  assert.equal(agendaTimeSlots.length, 28);
  assert.equal(agendaTimeSlots[0].label, "07:00");
  assert.equal(agendaTimeSlots[4].label, "09:00");
  assert.equal(agendaTimeSlots[5].label, "09:30");
  assert.equal(agendaTimeSlots.at(-1).label, "20:30");
  assert.equal(AGENDA_END_MINUTE, 1260);
});
test("a semana exibe segunda a sexta inclusive quando a data selecionada é domingo", () => {
  for (const anchor of [
    new Date(2026, 10, 16),
    new Date(2026, 10, 21),
    new Date(2026, 10, 22),
  ]) {
    const days = agendaWeekdays(anchor);
    assert.deepEqual(
      days.map((day) => day.getDay()),
      [1, 2, 3, 4, 5],
    );
    assert.deepEqual(
      days.map((day) => day.getDate()),
      [16, 17, 18, 19, 20],
    );
  }
});
test("a grade recorta compromissos nas bordas de 07h e 21h e omite os externos", () => {
  const entries = [
    event("early", "06:00", "08:00"),
    event("late", "20:00", "22:00"),
    event("outside", "05:00", "07:00"),
  ];
  assert.deepEqual(
    positionAgendaEntries(entries, "2026-11-02", {
      startMinute: AGENDA_START_MINUTE,
      endMinute: AGENDA_END_MINUTE,
    }).map((row) => [row.entry.id, row.startMinute, row.endMinute]),
    [
      ["early", 420, 480],
      ["late", 1200, 1260],
    ],
  );
});
test("sobreposições compartilham a largura sem deslocar o horário e eventos adjacentes usam a largura inteira", () => {
  const rows = positionAgendaEntries(
    [
      event("a", "09:00", "10:00"),
      event("b", "09:30", "10:30"),
      event("c", "10:30", "11:00"),
    ],
    "2026-11-02",
  );
  assert.deepEqual(
    rows.map((row) => [
      row.startMinute,
      row.endMinute,
      row.column,
      row.columns,
    ]),
    [
      [540, 600, 0, 2],
      [570, 630, 1, 2],
      [630, 660, 0, 1],
    ],
  );
});
test("compromissos que cruzam a meia-noite aparecem nos dois dias em Brasília", () => {
  const events = [
    {
      id: "overnight",
      startsAt: "2026-11-03T02:30:00Z",
      endsAt: "2026-11-03T03:30:00Z",
    },
  ];
  assert.deepEqual(
    positionAgendaEntries(events, "2026-11-02").map((row) => [
      row.startMinute,
      row.endMinute,
    ]),
    [[1410, 1440]],
  );
  assert.deepEqual(
    positionAgendaEntries(events, "2026-11-03").map((row) => [
      row.startMinute,
      row.endMinute,
    ]),
    [[0, 30]],
  );
  assert.deepEqual(positionAgendaEntries(events, "2026-11-04"), []);
});
test("a grade ignora intervalos inválidos e preserva os registros recebidos", () => {
  const entries = [
    event("valid", "11:00", "12:00"),
    event("reversed", "11:00", "10:00"),
    { id: "invalid", startsAt: "invalid", endsAt: "invalid" },
  ];
  const before = structuredClone(entries);
  assert.equal(positionAgendaEntries(entries, "2026-11-02").length, 1);
  assert.deepEqual(entries, before);
});
