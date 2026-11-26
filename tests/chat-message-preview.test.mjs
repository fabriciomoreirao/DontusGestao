import assert from "node:assert/strict";
import test from "node:test";
import {
  chatAlertText,
  messagePreview,
  parsePoll,
} from "../lib/chat-message-preview.ts";

const poll = (question, options) =>
  JSON.stringify({
    question,
    options: options.map((text) => ({ text, voterUserIds: [] })),
  });

test("o alerta de enquete mostra a pergunta, nunca o JSON", () => {
  // O mesmo conteúdo que apareceu cru no alerta durante o teste manual.
  const body =
    '{"question":"teste","options":[{"text":"2","voterUserIds":[]},{"text":"3","voterUserIds":[]}]}';
  assert.equal(chatAlertText({ type: "poll", body }), "Enquete: teste");
  assert.equal(
    chatAlertText({ type: "poll", body: poll("Almoço?", ["Sim", "Não"]) }),
    "Enquete: Almoço?",
  );
});

test("enquete com conteúdo inválido não expõe o texto bruto", () => {
  for (const body of [
    "",
    "não é json",
    "{}",
    '{"question":"x","options":[]}',
  ]) {
    assert.equal(chatAlertText({ type: "poll", body }), "Enquete: pergunta");
    assert.equal(messagePreview({ type: "poll", body }), "Enquete: pergunta");
  }
  // Uma enquete precisa de ao menos duas opções.
  assert.equal(parsePoll(poll("x", ["só uma"])), null);
});

test("o alerta mantém os textos de documento, imagem e vídeo e trata áudio e figurinha", () => {
  assert.equal(
    chatAlertText({ type: "file", body: "", fileName: "contrato.pdf" }),
    "Documento: contrato.pdf",
  );
  assert.equal(
    chatAlertText({ type: "file", body: "", fileName: "" }),
    "Documento: Arquivo recebido",
  );
  assert.equal(chatAlertText({ type: "image", body: "" }), "Imagem recebida");
  assert.equal(chatAlertText({ type: "video", body: "" }), "Vídeo recebido");
  assert.equal(chatAlertText({ type: "audio", body: "" }), "Áudio recebido");
  assert.equal(chatAlertText({ type: "sticker", body: "🎉" }), "🎉 Figurinha");
});

test("o alerta de texto mostra a mensagem, ou um texto genérico quando ela vem vazia", () => {
  assert.equal(chatAlertText({ type: "text", body: "Bom dia" }), "Bom dia");
  assert.equal(
    chatAlertText({ type: "text", body: "" }),
    "Nova mensagem recebida",
  );
  // Mensagem excluída chega com tipo texto e corpo vazio.
  assert.equal(
    chatAlertText({
      type: "text",
      body: "",
      deletedAt: "2026-11-19T10:00:00Z",
    }),
    "Nova mensagem recebida",
  );
});

test("a lista de conversas mantém o comportamento anterior", () => {
  assert.equal(
    messagePreview({
      type: "text",
      body: "oi",
      deletedAt: "2026-11-19T10:00:00Z",
    }),
    "Mensagem excluída",
  );
  assert.equal(messagePreview({ type: "image", body: "" }), "Imagem");
  assert.equal(messagePreview({ type: "video", body: "" }), "Vídeo");
  assert.equal(messagePreview({ type: "audio", body: "" }), "Áudio");
  assert.equal(
    messagePreview({ type: "file", body: "", fileName: "a.pdf" }),
    "a.pdf",
  );
  assert.equal(
    messagePreview({ type: "file", body: "", fileName: "" }),
    "Arquivo",
  );
  assert.equal(messagePreview({ type: "sticker", body: "🎉" }), "🎉 Figurinha");
  assert.equal(messagePreview({ type: "text", body: "olá" }), "olá");
  assert.equal(
    messagePreview({ type: "poll", body: poll("Pizza?", ["a", "b"]) }),
    "Enquete: Pizza?",
  );
});

test("parsePoll devolve a pergunta e as opções com os votos", () => {
  const parsed = parsePoll(
    JSON.stringify({
      question: "Qual dia?",
      options: [
        { text: "Seg", voterUserIds: ["u1", 7, "u2"] },
        { text: "Ter" },
        { notText: true },
      ],
    }),
  );
  assert.deepEqual(parsed, {
    question: "Qual dia?",
    options: [
      { text: "Seg", voterUserIds: ["u1", "u2"] },
      { text: "Ter", voterUserIds: [] },
    ],
  });
});
