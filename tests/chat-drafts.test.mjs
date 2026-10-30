import assert from "node:assert/strict";
import test from "node:test";
import { moveChatDraft, restoreChatDraft } from "../lib/chat-drafts.ts";

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
