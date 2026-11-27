import assert from "node:assert/strict";
import test from "node:test";
import {
  enterpriseInteractionTypes,
  splitEnterpriseHistory,
} from "../lib/enterprise-tracking.ts";

test("separa os tipos do formulário dos eventos internos e preserva a ordem mais recente", () => {
  const comments = enterpriseInteractionTypes.map((type, i) => ({
    id: `comment-${i}`,
    type,
    text: type,
  }));
  const history = [
    { id: "created", type: "Cadastro" },
    {
      id: "score",
      type: "Atualização interna",
      text: "Score atualizado de 80% para 100%.",
    },
    { id: "status", type: "Alteração de status" },
  ];
  const entries = [history[0], ...comments, ...history.slice(1)];
  const before = structuredClone(entries);
  const separated = splitEnterpriseHistory(entries);
  assert.deepEqual(separated.comments, [...comments].reverse());
  assert.deepEqual(separated.history, [...history].reverse());
  assert.deepEqual(entries, before);
  assert.equal(
    separated.comments.length + separated.history.length,
    entries.length,
  );
});

test("comentários legados, acentos e contatos permanecem disponíveis", () => {
  const entries = [
    { id: "legacy", text: "Comentário antigo sem tipo" },
    { id: "comment", type: "  COMENTÁRIO  " },
    {
      id: "meeting",
      type: "Reuniao",
      participants: "Ana, Bia",
      meetingLink: "https://example.com/reuniao",
      scheduledFor: "2026-11-27T14:00:00Z",
      unitId: "unit-1",
    },
    { id: "note", type: "Observação" },
    { id: "update", type: "ATUALIZAÇÃO INTERNA" },
  ];
  const { comments, history } = splitEnterpriseHistory(entries);
  assert.deepEqual(
    comments.map((entry) => entry.id),
    ["note", "meeting", "comment", "legacy"],
  );
  assert.equal(comments[1], entries[2]);
  assert.equal(comments[1].meetingLink, "https://example.com/reuniao");
  assert.deepEqual(
    history.map((entry) => entry.id),
    ["update"],
  );
});

test("eventos automáticos não ocultam comentários nem entram na sua contagem", () => {
  const entries = [
    { id: "human", type: "Comentário", text: "Cliente respondeu" },
    ...Array.from({ length: 331 }, (_, i) => ({
      id: `system-${i}`,
      type: "Atualização interna",
    })),
  ];
  const { comments, history } = splitEnterpriseHistory(entries);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].text, "Cliente respondeu");
  assert.equal(history.length, 331);
  assert.equal(
    new Set([...comments, ...history].map((entry) => entry.id)).size,
    entries.length,
  );
  assert.deepEqual(splitEnterpriseHistory([]), { comments: [], history: [] });
});
