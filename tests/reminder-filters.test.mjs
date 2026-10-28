import assert from "node:assert/strict";
import test from "node:test";
import { matchesReminderFilter, pendingReminders } from "../lib/reminder-links.ts";

const now = Date.parse("2026-10-26T15:00:00Z");
const record = (id, fields = {}, status = "Pendente") => ({ id, status, description: JSON.stringify({ kind: "systemReminder", title: "Retornar contato", remindAt: "2026-10-26T19:00:00Z", ...fields }) });

test("os quatro filtros funcionam em todas as funcionalidades com lembretes", () => {
  for (const module of ["tasks", "suggestions", "support", "serviceRequests", "serviceFollowup", "waitingQueue", "internalChat", "commercial", "cs", "cancellations", "marketing", "ti", "lia", "hr", "admin", "commissions", "goals", "referrals"]) {
    const context = { module, entityId: `${module}:card` };
    const reminders = pendingReminders([record("r1", { sourceModule: module, sourceEntityId: context.entityId })]);
    assert.equal(matchesReminderFilter(reminders, context, "all", now), true, module);
    assert.equal(matchesReminderFilter(reminders, context, "today", now), true, module);
    assert.equal(matchesReminderFilter(reminders, context, "scheduled", now), true, module);
    assert.equal(matchesReminderFilter(reminders, context, "none", now), false, module);
    const other = { ...context, entityId: "outro-card" };
    assert.equal(matchesReminderFilter(reminders, other, "all", now), true, module);
    assert.equal(matchesReminderFilter(reminders, other, "today", now), false, module);
    assert.equal(matchesReminderFilter(reminders, other, "scheduled", now), false, module);
    assert.equal(matchesReminderFilter(reminders, other, "none", now), true, module);
  }
});

test("lembretes encerrados, vistos, confirmados e datas inválidas não entram na busca pendente", () => {
  const context = { module: "tasks", entityId: "t1" };
  const source = { sourceModule: context.module, sourceEntityId: context.entityId };
  const reminders = pendingReminders([
    record("visto", { ...source, seenAt: new Date(now).toISOString() }),
    record("confirmado", { ...source, confirmedAt: new Date(now).toISOString() }),
    record("cancelado", source, "Cancelado"), record("concluido", source, "Concluído"),
    record("invalido", { ...source, remindAt: "invalido" }),
    { id: "outro-tipo", description: '{"kind":"commercialLead"}' }, { id: "malformado", description: "{" },
  ]);
  assert.deepEqual(reminders, []);
  assert.equal(matchesReminderFilter(reminders, context, "none", now), true);
});

test("para hoje usa a data de Brasília e o novo horário de lembretes adiados", () => {
  const context = { module: "lia", entityId: "lia1" };
  const source = { sourceModule: context.module, sourceEntityId: context.entityId };
  const beforeMidnight = pendingReminders([record("r1", { ...source, remindAt: "2026-10-27T02:59:00Z" })]);
  assert.equal(matchesReminderFilter(beforeMidnight, context, "today", now), true);
  const afterMidnight = pendingReminders([record("r1", { ...source, nextAlertAt: "2026-10-27T03:00:00Z" })]);
  assert.equal(matchesReminderFilter(afterMidnight, context, "today", now), false);
  assert.equal(matchesReminderFilter(afterMidnight, context, "scheduled", now), true);
  const overdue = pendingReminders([record("r1", { ...source, remindAt: "2026-10-25T15:00:00Z" })]);
  assert.equal(matchesReminderFilter(overdue, context, "today", now), false);
  assert.equal(matchesReminderFilter(overdue, context, "scheduled", now), true);
});

test("vínculos antigos por cliente ou título continuam pesquisáveis sem misturar módulos ou cards", () => {
  const context = { module: "support", entityId: "a1", clientId: "123", title: "Clínica Sol" };
  const reminders = pendingReminders([
    record("cliente", { sourceModule: "support", sourceClientId: "123" }),
    record("titulo", { sourceModule: "support", sourceTitle: " clínica sol " }),
  ]);
  assert.equal(matchesReminderFilter(reminders, context, "scheduled", now), true);
  assert.equal(matchesReminderFilter(reminders, { ...context, module: "cs" }, "scheduled", now), false);
  const explicitOtherCard = pendingReminders([record("outro", { sourceModule: "support", sourceEntityId: "a2", sourceClientId: "123", sourceTitle: "Clínica Sol" })]);
  assert.equal(matchesReminderFilter(explicitOtherCard, context, "scheduled", now), false);
  const chat = pendingReminders([record("chat", { sourceModule: "internalChat", sourceTitle: "Enviar mensagem: Maria" })]);
  assert.equal(matchesReminderFilter(chat, { module: "internalChat", entityId: "user:maria", title: "Enviar mensagem: Maria" }, "today", now), true);
});
