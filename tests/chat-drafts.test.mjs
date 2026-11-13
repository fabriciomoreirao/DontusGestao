import assert from "node:assert/strict";
import test from "node:test";
import { createChatDraftStore, moveChatDraft, restoreChatDraft } from "../lib/chat-drafts.ts";

test("ao criar a primeira conversa, o texto seguinte acompanha o novo ID sem alterar outros rascunhos", () => {
  const drafts = { "user:colleague":"Próxima mensagem", other:"Outra conversa" };
  assert.deepEqual(moveChatDraft(drafts,"user:colleague","room"), { room:"Próxima mensagem", other:"Outra conversa" });
  assert.deepEqual(drafts, { "user:colleague":"Próxima mensagem", other:"Outra conversa" });
});
test("falhas restauram a mensagem enviada preservando o que foi digitado durante a espera", () => {
  assert.deepEqual(restoreChatDraft({ room:"Próximo texto", other:"Outro rascunho" },"room","Texto não enviado"), { room:"Texto não enviado\nPróximo texto", other:"Outro rascunho" });
  assert.deepEqual(restoreChatDraft({},"room","Texto não enviado"), { room:"Texto não enviado" });
});
test("atualizações de uma conversa existente não duplicam nem descartam seu rascunho", () => {
  const drafts = { room:"Próxima mensagem" };
  assert.equal(moveChatDraft(drafts,"room","room"), drafts);
  assert.equal(moveChatDraft(drafts,"missing","room"), drafts);
  assert.deepEqual(moveChatDraft({ pending:"Rascunho novo", room:"Rascunho existente" },"pending","room"), { room:"Rascunho novo\nRascunho existente" });
});

test("o campo recebe o texto imediatamente e conserva rascunhos, criação da conversa e falhas de envio", () => {
  const store = createChatDraftStore(); const changes = [];
  const unsubscribe = store.subscribe(() => changes.push(store.get("user:bia")));
  store.set("user:bia", "Olá Bia"); store.set("user:carlos", "Outro rascunho");
  assert.equal(changes[0], "Olá Bia");
  store.set("user:bia", ""); store.set("user:bia", "Texto seguinte");
  store.move("user:bia", "room"); store.restore("room", "Olá Bia");
  assert.equal(store.get("room"), "Olá Bia\nTexto seguinte");
  assert.equal(store.get("user:carlos"), "Outro rascunho");
  assert.equal(store.get("user:bia"), "");
  const before = changes.length; store.set("room", store.get("room")); assert.equal(changes.length, before);
  unsubscribe(); store.set("room", "Depois de desmontar"); assert.equal(changes.length, before);
});
