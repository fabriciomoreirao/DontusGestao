import assert from "node:assert/strict";
import test from "node:test";
import { clientRecordQuery, resolveClientHistory, structuredClientEvolutions, consolidateClientEvolutions } from "../lib/client-history.ts";

const at = "2026-10-01T10:00:00Z";
const customer = { id: "customer-a", document_masked: "001234", trade_name: "Clínica Aurora", legal_name: "Aurora Odontologia LTDA", phone: "(11) 99999-1111", email: "aurora@example.test" };
const record = (id, detail = {}, overrides = {}) => ({
  id, module: "commercial", record_type: "Lead comercial", title: "Clínica Aurora",
  customer_id: null, customer_name: "", owner: "Ana", created_at: at, updated_at: "2026-11-05T13:00:00Z",
  description: JSON.stringify({ kind: "commercialLead", follows: [], comments: [], ...detail }), ...overrides,
});
const ids = result => result.items.map(item => item.id).sort();

test("abre a ficha do lead antes do ganho pelo registro, ignorando o falso ID Lead", () => {
  const lead = record("lead-a", { comments: [{ text: "Primeiro contato", createdAt: at }] });
  const context = { entityId: lead.id, clientId: "Lead", customerName: "Lead sem cliente vinculado", title: lead.title };
  assert.equal(clientRecordQuery(context, [lead]), lead.id);
  const result = resolveClientHistory(clientRecordQuery(context, [lead]), [], [lead, record("lead-b", {}, { title: "Outra clínica" })]);
  assert.equal(result.customer, undefined);
  assert.equal(result.source, lead);
  assert.deepEqual(ids(result), ["lead-a"]);
  assert.equal(structuredClientEvolutions(result.items[0])[0].text, "Primeiro contato");
  assert.equal(clientRecordQuery({ clientId: "Lead", customerName: "Lead sem cliente vinculado", title: "Clínica Aurora" }, []), "Clínica Aurora");
});

test("o ID informado no encaminhamento recupera todo o histórico anterior ao ganho", () => {
  const lead = record("lead-a", { onboarding: { clientId: "001234" }, comments: [{ text: "Comentário antes da venda", createdAt: at }], follows: [{ type: "Ligação", text: "Apresentação inicial", createdAt: at }] });
  assert.equal(clientRecordQuery({ entityId: lead.id, clientId: "Lead" }, [lead]), lead.id);
  for (const query of [customer.id, "001234", "#001-234", customer.trade_name]) {
    const result = resolveClientHistory(query, [customer], [lead]);
    assert.equal(result.customer, customer, query);
    assert.deepEqual(ids(result), ["lead-a"], query);
    assert.equal(structuredClientEvolutions(result.items[0]).length, 2);
  }
});

test("o lead ganho relaciona a qualificação antiga pelo nome mesmo sem cadastro de cliente", () => {
  const qualification = record("qualification", { follows: [{ text: "Primeira abordagem", createdAt: at }] }, { record_type: "Lead de qualificação" });
  const won = record("won", { onboarding: { clientId: "001234" } });
  const unrelated = record("unrelated", { clientId: "009999" });
  assert.deepEqual(ids(resolveClientHistory("001234", [], [qualification, won, unrelated])), ["qualification", "won"]);
});

test("segue os vínculos de qualificação e conversão com nomes diferentes, inclusive ao abrir o lead original", () => {
  const qualification = record("qualification-a", { comments: [{ text: "Contato na campanha", createdAt: at }] }, { title: "Dra. Joana", record_type: "Lead de qualificação" });
  const lead = record("lead-a", { sourceQualificationId: qualification.id }, { title: "Joana e equipe" });
  const journey = record("journey-a", { kind: "csJourney", clientId: "001234", sourceLeadId: lead.id }, { module: "cs", title: "Onboarding Aurora" });
  for (const query of ["001234", qualification.id, journey.id]) {
    const result = resolveClientHistory(query, [customer], [qualification, lead, journey]);
    assert.equal(result.customer, customer);
    assert.deepEqual(ids(result), ["journey-a", "lead-a", "qualification-a"]);
  }
});

test("recupera leads antigos sem ID pelo contato único ou nome exato e preserva zeros iniciais", () => {
  const byName = record("by-name", {}, { title: "CLINICA AURORA" });
  const byPhone = record("by-phone", { phone: "+55 11 99999-1111" }, { title: "Contato da campanha" });
  const partial = record("partial", {}, { title: "Clínica Aurora Norte" });
  const differentId = record("different-id", { clientId: "991234", phone: customer.phone });
  const onlyMention = record("only-mention", { comments: [{ text: "Conversar com Clínica Aurora, ID 001234" }] }, { title: "Outra clínica" });
  assert.deepEqual(ids(resolveClientHistory("001234", [customer], [byName, byPhone, partial, differentId, onlyMention])), ["by-name", "by-phone"]);
  assert.deepEqual(ids(resolveClientHistory("01234", [customer], [byName, byPhone])), []);
});

test("não mistura clientes diferentes com nomes iguais, telefone compartilhado ou referências conflitantes", () => {
  const other = { ...customer, id: "customer-b", document_masked: "009999" };
  const own = record("own", { clientId: "001234" }, { customer_id: customer.id });
  const wrongCustomer = record("wrong-customer", { clientId: "001234" }, { customer_id: other.id });
  const sharedPhone = record("shared-phone", { phone: customer.phone }, { title: "Outro contato" });
  const wrongCode = record("wrong-code", { clientId: "009999", sourceLeadId: own.id });
  const ambiguousName = record("ambiguous-name");
  const result = resolveClientHistory("001234", [customer, other], [own, wrongCustomer, sharedPhone, wrongCode, ambiguousName]);
  assert.equal(result.customer, customer);
  assert.deepEqual(ids(result), ["own"]);
});

test("inclui CRM Retenção, venda direta e LIA ligados à mesma identidade sem depender de status ganho", () => {
  const retention = record("retention", { clientId: "001234" }, { record_type: "Lead de retenção" });
  const sale = record("sale", { kind: "directSale", clientId: "001234" }, { record_type: "Venda direta comercial" });
  const lia = record("lia", { kind: "liaJourney", clientId: "001234", sourceLeadId: retention.id }, { module: "lia" });
  const result = resolveClientHistory("001234", [customer], [retention, sale, lia]);
  assert.deepEqual(ids(result), ["lia", "retention", "sale"]);
  assert.equal(result.belongs("Agendamento para ID 001234"), true);
  assert.equal(result.belongs(""), false);
});

test("preserva tipo, autor, data e origem de comentários, follow-ups e interações", () => {
  const lead = record("lead", {
    comments: [{ text: "Observação", createdAt: at, author: "Bia" }],
    follows: [{ text: "Ligação feita", createdAt: at, author: "Carlos" }],
    interactions: [{ body: "Mensagem recebida", at, actor: "Dora" }],
    history: [{ text: "Mudou de etapa", at, by: "Edu" }],
    communications: [{ summary: "Email enviado", date: at, authorName: "Fê" }],
  });
  const entries = structuredClientEvolutions(lead, "Comercial · CRM Inicial");
  assert.deepEqual(Object.fromEntries(entries.map(entry => [entry.type, entry.author])), { "Comentário": "Bia", "Follow-up": "Carlos", "Interação": "Dora", "Movimentação": "Edu", "Comunicação": "Fê" });
  assert.ok(entries.every(entry => entry.at === at && entry.sourceId === lead.id && entry.source === "Comercial · CRM Inicial"));
});

test("consolida cópias da qualificação sem repetir interações, preservando os registros distintos e a ordem", () => {
  const original = record("qualification", { comments: [{ text: "Contato inicial", createdAt: at, author: "Ana" }] });
  const copy = record("crm", { comments: [{ text: "Contato inicial", createdAt: at, author: "Ana" }, { text: "Contrato enviado", createdAt: "2026-11-01T10:00:00Z" }] });
  const other = record("task", { comments: [{ text: "Contato inicial", createdAt: at, author: "Ana" }] }, { module: "tasks" });
  const entries = [original, copy, other].flatMap(item => structuredClientEvolutions(item));
  const result = consolidateClientEvolutions(entries, new Set([original.id, copy.id]));
  assert.deepEqual(result.map(entry => entry.text), ["Contrato enviado", "Contato inicial", "Contato inicial"]);
  assert.equal(result[1].sourceId, original.id);
  assert.equal(result[2].sourceId, other.id);
});

test("trata descrições antigas e consultas vazias sem associar todos os registros", () => {
  assert.deepEqual(structuredClientEvolutions(record("legacy", {}, { description: "texto antigo" })), []);
  assert.deepEqual(ids(resolveClientHistory("", [], [record("lead")])), []);
  assert.deepEqual(ids(resolveClientHistory("Lead sem cliente vinculado", [], [record("lead")])), []);
});
