import assert from "node:assert/strict";
import test from "node:test";
import {
  taskDeliveryDate,
  taskPriorityRequest,
  canRequestTaskPriority,
} from "../lib/task-details.ts";

test("a entrega acompanha o SLA recalculado em vez de manter o prazo antigo", () => {
  const task = {
    dueAt: "2026-11-23T12:00:00Z",
    slaDueAt: "2026-11-26T16:00:00Z",
  };
  assert.equal(taskDeliveryDate(task), task.slaDueAt);
  task.slaDueAt = "2026-11-24T16:00:00Z";
  assert.equal(taskDeliveryDate(task), "2026-11-24T16:00:00Z");
  assert.equal(taskDeliveryDate({ ...task, slaDueAt: null }), task.dueAt);
  assert.equal(taskDeliveryDate({ slaDueAt: "invalid", dueAt: null }), null);
});

test("solicitações anteriores permanecem visíveis e identificam o colaborador da última solicitação", () => {
  const history = [
    {
      id: "first",
      eventType: "priority_requested",
      actorName: "Ana",
      createdAt: "2026-11-23T12:00:00Z",
    },
    {
      id: "comment",
      eventType: "comment_added",
      actorName: "Carlos",
      createdAt: "2026-11-23T14:00:00Z",
    },
    {
      id: "last",
      eventType: "priority_requested",
      actorName: "Beatriz",
      createdAt: "2026-11-23T13:00:00Z",
    },
  ];
  assert.equal(taskPriorityRequest(history).actorName, "Beatriz");
  assert.deepEqual(
    history.map((entry) => entry.id),
    ["first", "comment", "last"],
  );
  assert.equal(
    taskPriorityRequest(
      history.filter((entry) => entry.eventType === "comment_added"),
    ),
    undefined,
  );
});

test("somente coordenadores ativos com edição podem solicitar prioridade", () => {
  const person = { active: true, coordinatorDepartmentIds: [] };
  assert.equal(canRequestTaskPriority(true, false, person), false);
  assert.equal(canRequestTaskPriority(true, true, person), true);
  assert.equal(
    canRequestTaskPriority(true, false, {
      ...person,
      coordinatorDepartmentIds: ["support"],
    }),
    true,
  );
  assert.equal(canRequestTaskPriority(false, true, person), false);
  assert.equal(
    canRequestTaskPriority(true, true, { ...person, active: false }),
    false,
  );
  assert.equal(canRequestTaskPriority(true, true, undefined), false);
});
