import test from "node:test";
import assert from "node:assert/strict";
import { chatDayKey, chatDayLabel } from "../lib/chat-days.ts";
import { kanbanScrollSpeed } from "../lib/kanban-autoscroll.ts";
import { strategicTracking } from "../lib/enterprise-tracking.ts";
import { canMoveTask } from "../lib/task-movement.ts";
import { canInteractWithTask } from "../lib/task-interaction.ts";

test("dias das conversas usam Brasília inclusive na virada da meia-noite", () => {
  const now = Date.parse("2026-11-17T03:10:00Z");
  assert.equal(chatDayKey("2026-11-17T02:59:00Z"), "2026-11-16");
  assert.equal(chatDayLabel("2026-11-17T02:59:00Z", now), "Ontem");
  assert.equal(chatDayLabel("2026-11-17T03:00:00Z", now), "Hoje");
  assert.match(
    chatDayLabel("2026-11-13T12:00:00Z", now),
    /sexta-feira.*13.*novembro.*2026/,
  );
});
test("rolagem do Kanban acelera nas duas bordas e para no centro e fora do quadro", () => {
  assert.equal(kanbanScrollSpeed(500, 100, 900), 0);
  assert.equal(kanbanScrollSpeed(100, 100, 900), -20);
  assert.equal(kanbanScrollSpeed(900, 100, 900), 20);
  assert.ok(kanbanScrollSpeed(850, 100, 900) > 0);
  assert.equal(kanbanScrollSpeed(1100, 100, 900), 0);
});
test("unidades manuais sem jornada não possuem treinamento pendente e o comercial novo possui", () => {
  assert.equal(
    strategicTracking({ id: "manual", externalId: "123456" }, "network", [])
      .trainingPending,
    false,
  );
  assert.equal(
    strategicTracking(
      { id: "new", externalId: "123456", trainingRequired: true },
      "network",
      [],
    ).trainingPending,
    true,
  );
  const records = [
    {
      id: "journey",
      module: "cs",
      updated_at: "2026-11-17",
      description: JSON.stringify({
        kind: "csJourney",
        track: "activation",
        phase: "tracking",
        strategicNetworkId: "network",
        strategicUnitId: "new",
      }),
    },
  ];
  assert.equal(
    strategicTracking(
      { id: "new", externalId: "123456", trainingRequired: true },
      "network",
      records,
    ).trainingPending,
    false,
  );
});
test("aprovação e conclusão são ações do fluxo mesmo com status final sem movimento manual ou vínculo ao tipo", () => {
  const task = {
    assigneeUserId: "owner",
    currentDepartmentId: "support",
    sourceDepartmentId: "sales",
    typeId: "type",
    statusName: "Aguardando aprovação",
    creatorUserId: "creator",
    participantUserIds: [],
    approverUserId: "approver",
  };
  const final = {
    id: "final",
    name: "Resolvida",
    departmentId: null,
    manualMovement: false,
    active: true,
    isFinal: true,
  };
  const access = {
    userId: "approver",
    canEdit: false,
    canManage: false,
    canApprove: true,
    changeStatus: false,
    cancel: false,
  };
  assert.equal(canMoveTask(task, final, [], access), true);
  assert.equal(
    canMoveTask(task, final, [], { ...access, canApprove: false }),
    false,
  );
  assert.equal(
    canMoveTask(task, { ...final, departmentId: "finance" }, [], access),
    false,
  );
  assert.equal(
    canInteractWithTask(task, {
      id: "approver",
      active: true,
      departmentIds: [],
      coordinatorDepartmentIds: [],
    }),
    true,
  );
});
