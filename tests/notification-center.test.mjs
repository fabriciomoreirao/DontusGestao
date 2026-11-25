import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { taskNotificationDisplay } from "../lib/notifications.ts";

const task = {
  protocol: "T260079",
  title: "Validação de pagamento com nota",
  customerName: "Clínica Aurora",
  customerCode: "240414",
};

test("o painel mostra quem fez, a ação, o assunto, o protocolo, o cliente e o status da tarefa", () => {
  assert.deepEqual(
    taskNotificationDisplay(
      {
        eventType: "task_completed",
        message: "Tarefa concluída",
        actorName: "Marina Costa",
      },
      task,
    ),
    {
      actor: "Marina Costa",
      action: "concluiu a tarefa",
      subject: "Validação de pagamento com nota",
      reference: "T260079 · Clínica Aurora",
      status: { label: "Concluída", tone: "success" },
    },
  );
  const approval = taskNotificationDisplay(
    {
      eventType: "approval_requested",
      message: "x",
      actorName: "Rafael Silva",
    },
    task,
  );
  assert.equal(approval.action, "enviou para sua aprovação");
  assert.deepEqual(approval.status, {
    label: "Aguardando aprovação",
    tone: "warning",
  });
  const assigned = taskNotificationDisplay(
    { eventType: "assigned", message: "x", actorName: "Ana Lima" },
    task,
  );
  assert.equal(assigned.action, "atribuiu uma tarefa a você");
  assert.deepEqual(assigned.status, {
    label: "Atribuída a você",
    tone: "info",
  });
});

test("sem cliente usa o código, sem tarefa usa a mensagem do servidor e sem autor não inventa nome", () => {
  assert.equal(
    taskNotificationDisplay(
      { eventType: "assigned", message: "x" },
      { ...task, customerName: "" },
    ).reference,
    "T260079 · 240414",
  );
  const unknown = taskNotificationDisplay({
    eventType: "evento_novo",
    message: "Mensagem gravada",
  });
  assert.equal(unknown.subject, "Mensagem gravada");
  assert.equal(unknown.action, "atualizou a tarefa");
  assert.equal(unknown.actor, undefined);
  assert.equal(unknown.reference, undefined);
  assert.equal(unknown.status, undefined);
});

test("a leitura automática espera 3 s, nunca marca chat e mantém o que foi lido na lista até fechar", async () => {
  const source = await readFile(
    new URL("../app/NotificationCenter.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /AUTO_READ_DELAY_MS = 3000/);
  assert.match(source, /entry\.category !== "chat"/);
  assert.match(source, /IntersectionObserver/);
  const app = await readFile(
    new URL("../app/OperationsApp.tsx", import.meta.url),
    "utf8",
  );
  assert.match(app, /<NotificationCenter/);
  assert.match(
    app,
    /readable = selected\.filter\(\(entry\) => entry\.category !== "chat"\)/,
  );
});

// ---- Histórico: as últimas notificações já lidas continuam disponíveis no painel ----
import { buildNotifications } from "../lib/notifications.ts";

const baseData = () => ({
  user: {
    email: "ana@test.local",
    displayName: "Ana",
    department: "Suporte",
    permissions: ["tasks", "notices", "reminders", "internalChat"].map(
      (screen) => ({ screen, canView: true }),
    ),
  },
  items: [],
  internalChatModule: { currentUserId: "ana-id", rooms: [] },
  access: {
    employees: [
      {
        id: "ana-id",
        email: "ana@test.local",
        displayName: "Ana",
        departmentName: "Suporte",
        departmentNames: ["Suporte"],
      },
    ],
  },
  taskModule: {
    tasks: [
      {
        id: "t1",
        assigneeUserId: "ana-id",
        assigneeName: "Ana",
        protocol: "T1",
        title: "Tarefa 1",
      },
    ],
    collaborators: [{ id: "ana-id", email: "ana@test.local" }],
    notifications: [
      {
        id: "n-lida",
        taskId: "t1",
        eventType: "task_completed",
        message: "m",
        read: true,
        createdAt: "2026-10-22T10:00:00Z",
        actorName: "Marina",
      },
      {
        id: "n-nova",
        taskId: "t1",
        eventType: "assigned",
        message: "m",
        read: false,
        createdAt: "2026-10-22T11:00:00Z",
        actorName: "Bia",
      },
    ],
  },
  noticesModule: {
    notices: [
      {
        id: "a-lido",
        title: "Aviso lido",
        kind: "Aviso",
        authorUserId: "outro",
        active: true,
        visibleToCurrentUser: true,
        isRead: true,
        publishedAt: "2026-10-22T09:00:00Z",
      },
      {
        id: "a-novo",
        title: "Aviso novo",
        kind: "Aviso",
        authorUserId: "outro",
        active: true,
        visibleToCurrentUser: true,
        isRead: false,
        publishedAt: "2026-10-22T12:00:00Z",
      },
    ],
  },
});
const clock = Date.parse("2026-10-22T15:00:00Z");

test("sem includeRead, só as não lidas viram notificação (comportamento de antes)", () => {
  const ids = buildNotifications(baseData(), clock).map((entry) => entry.id);
  assert.deepEqual(ids.sort(), ["notice-a-novo", "task-n-nova"]);
});

test("com includeRead, as lidas também vêm marcadas como lidas, para o histórico do painel", () => {
  const entries = buildNotifications(baseData(), clock, { includeRead: true });
  const byId = Object.fromEntries(entries.map((entry) => [entry.id, entry]));
  assert.equal(entries.length, 4);
  assert.equal(byId["task-n-lida"].read, true);
  assert.equal(byId["notice-a-lido"].read, true);
  assert.equal(byId["task-n-nova"].read, false);
  assert.equal(byId["notice-a-novo"].read, false);
  assert.equal(byId["task-n-lida"].display.action, "concluiu a tarefa");
});

test("o painel completa a lista com as últimas lidas até 10 e mostra todas as não lidas", async () => {
  const source = await readFile(
    new URL("../app/NotificationCenter.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /NOTIFICATION_HISTORY_LIMIT = 10/);
  assert.match(
    source,
    /Math\.max\(0, NOTIFICATION_HISTORY_LIMIT - current\.length\)/,
  );
  const app = await readFile(
    new URL("../app/OperationsApp.tsx", import.meta.url),
    "utf8",
  );
  assert.match(app, /history=\{notificationHistory\}/);
  assert.match(app, /\{ includeRead: true \}/);
});
