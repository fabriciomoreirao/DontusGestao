import assert from "node:assert/strict";
import test from "node:test";
import { createChatDraftStore, moveChatDraft, restoreChatDraft, sendChatDraft } from "../lib/chat-drafts.ts";

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

test("digitar quatro mil caracteres preserva o texto sem notificar a interface a cada tecla", () => {
  const store = createChatDraftStore();
  for (let index = 0; index < 1000; index++) store.set(`other-${index}`, "Outro rascunho");
  let changes = 0;
  store.subscribe(() => changes++);
  for (let index = 1; index <= 4000; index++) store.input("room", "a".repeat(index));
  assert.equal(store.get("room"), "a".repeat(4000));
  assert.equal(changes, 1);
  store.input("room", " "); assert.equal(changes, 2);
  store.input("room", "\n"); assert.equal(changes, 2);
  store.input("room", "Novo texto"); assert.equal(changes, 3);
  store.set("room", "Resposta rápida"); assert.equal(changes, 4);
  assert.equal(store.get("other-500"), "Outro rascunho");
});

test("enviar usa o texto mais recente e não apaga a próxima mensagem digitada durante a espera", async () => {
  const store = createChatDraftStore();
  store.input("room:reply", "Mensagem atual");
  let finish;
  const request = sendChatDraft(store, "room:reply", body => {
    assert.equal(body, "Mensagem atual");
    return new Promise(resolve => { finish = resolve; });
  });
  assert.equal(store.get("room:reply"), "");
  store.input("room:reply", "Próxima mensagem");
  finish(true);
  assert.equal(await request, true);
  assert.equal(store.get("room:reply"), "Próxima mensagem");
});

test("falha no envio restaura o texto na conversa e no modo originais", async () => {
  const store = createChatDraftStore();
  store.input("room:note", "Nota interna");
  let finish;
  const request = sendChatDraft(store, "room:note", () => new Promise(resolve => { finish = resolve; }));
  store.input("room:reply", "Resposta ao cliente");
  store.input("other:reply", "Outra conversa");
  store.input("room:note", "Complemento");
  finish(false);
  assert.equal(await request, false);
  assert.equal(store.get("room:note"), "Nota interna\nComplemento");
  assert.equal(store.get("room:reply"), "Resposta ao cliente");
  assert.equal(store.get("other:reply"), "Outra conversa");
  assert.equal(await sendChatDraft(store, "other:reply", async () => { throw new Error("offline"); }), false);
  assert.equal(store.get("other:reply"), "Outra conversa");
  let sent = false;
  assert.equal(await sendChatDraft(store, "empty", async () => { sent = true; }), false);
  assert.equal(sent, false);
});
