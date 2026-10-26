import assert from "node:assert/strict";
import test from "node:test";
import { crmInactivityDays, isClosedCrmLead } from "../lib/crm-activity.ts";
import { brasiliaDateKey, isReminderForToday, pendingLinkedReminders } from "../lib/reminder-links.ts";

const now = Date.parse("2026-10-26T15:00:00Z");
const item = { created_at: "2026-10-01T15:00:00Z", updated_at: "2026-10-26T15:00:00Z", status: "Novo" };
const stages = [{ name: "Entrada" }, { name: "Sucesso", won: true }, { name: "Sem conversão", lost: true }];
const lead = { stage: "Entrada", entryDate: "", follows: [], comments: [] };

test("CRM conta desde o cadastro e alterações gerais não simulam uma interação", () => {
  assert.equal(crmInactivityDays(item, lead, stages, now), 25);
  assert.equal(crmInactivityDays(item, { ...lead, follows: [{ type: "Movimentação", text: "Mudou de etapa", createdAt: new Date(now).toISOString() }] }, stages, now), 25);
});

test("comentário e follow-up válidos reiniciam a contagem mesmo com o histórico fora de ordem", () => {
  const comments = [{ text: "Contato hoje", createdAt: new Date(now).toISOString() }, { text: "Contato antigo", createdAt: item.created_at }];
  assert.equal(crmInactivityDays(item, { ...lead, comments }, stages, now), 0);
  assert.equal(crmInactivityDays(item, { ...lead, follows: [{ type: "Ligação", text: "Cliente contatado", createdAt: "2026-10-24T15:00:00Z" }] }, stages, now), 2);
  assert.equal(crmInactivityDays(item, { ...lead, comments: [{ text: "Comentário corrigido", createdAt: "2026-10-24T15:00:00Z" }] }, stages, now), 2);
});

test("comentários vazios ou com datas inválidas não zeram o CRM", () => {
  assert.equal(crmInactivityDays(item, { ...lead, comments: [null, { text: 123, createdAt: new Date(now).toISOString() }, { text: "  ", createdAt: new Date(now).toISOString() }, { text: "Sem data válida", createdAt: "inválida" }] }, stages, now), 25);
  assert.equal(crmInactivityDays({ ...item, created_at: "inválida" }, lead, stages, now), 0);
});

test("etapas finais de ganho e perda zeram e interrompem a contagem", () => {
  for (const stage of ["Sucesso", "Sem conversão", "Finalizado", "Concluída", "Perdido"]) {
    assert.equal(isClosedCrmLead(item, { ...lead, stage }, stages), true);
    assert.equal(crmInactivityDays(item, { ...lead, stage }, stages, now), 0);
    assert.equal(crmInactivityDays(item, { ...lead, stage }, stages, now + 100 * 86_400_000), 0);
  }
  assert.equal(crmInactivityDays(item, { ...lead, retentionStatus: "Finalizado" }, stages, now), 0);
  assert.equal(crmInactivityDays({ ...item, status: "Cancelado" }, lead, stages, now), 0);
  assert.equal(isClosedCrmLead(item, { ...lead, retentionStatus: "Utilizando" }, stages), false);
});

const reminder = (id, extra = {}, status = "Pendente") => ({ id, status, description: JSON.stringify({ kind: "systemReminder", title: "Retornar contato", sourceModule: "commercial", sourceEntityId: "lead-1", sourceClientId: "158181", remindAt: "2026-10-26T18:00:00Z", ...extra }) });
const context = { module: "commercial", entityId: "lead-1", clientId: "158181", title: "Clínica" };

test("lembretes vinculam ao card correto sem cair no cliente de outro card", () => {
  const linked = pendingLinkedReminders([reminder("correto"), reminder("outro-card", { sourceEntityId: "lead-2" }), reminder("outro-módulo", { sourceModule: "lia" })], context);
  assert.deepEqual(linked.map((entry) => entry.id), ["correto"]);
  assert.equal(pendingLinkedReminders([reminder("legado", { sourceEntityId: undefined })], context).length, 1);
});

test("ícone representa lembretes pendentes, inclusive vencidos, e desaparece ao confirmar ou cancelar", () => {
  const records = [reminder("pendente"), reminder("vencido", { remindAt: "2026-10-20T18:00:00Z" }), reminder("visto", { seenAt: new Date(now).toISOString() }), reminder("confirmado", { confirmedAt: new Date(now).toISOString() }), reminder("cancelado", {}, "Cancelado"), reminder("sem-data", { remindAt: "inválida" }), { id: "inválido", description: "texto" }];
  assert.deepEqual(pendingLinkedReminders(records, context).map((entry) => entry.id), ["vencido", "pendente"]);
  assert.deepEqual(pendingLinkedReminders([], context), []);
});

test("filtro de hoje usa Brasília na virada do dia e o novo horário após adiamento", () => {
  const beforeMidnight = Date.parse("2026-10-27T02:59:59Z");
  assert.equal(brasiliaDateKey(beforeMidnight), "2026-10-26");
  assert.equal(isReminderForToday({ remindAt: "2026-10-27T02:00:00Z" }, beforeMidnight), true);
  assert.equal(isReminderForToday({ remindAt: "2026-10-27T03:00:00Z" }, beforeMidnight), false);
  assert.equal(isReminderForToday({ remindAt: "2026-10-27T02:00:00Z", nextAlertAt: "2026-10-27T03:30:00Z" }, beforeMidnight), false);
  assert.equal(isReminderForToday({ remindAt: "inválida" }, now), false);
});
