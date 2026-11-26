import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("a caixa de mensagem do chat não limita os caracteres e cresce sozinha", async () => {
  const composer = await read("../app/InternalChatDraftComposer.tsx");
  const module = await read("../app/InternalChatModule.tsx");
  const css = await read("../app/chat-layout.css");
  // Antes: maxLength={4000} na caixa e na edição, e a menção recusava passar de 4.000.
  assert.doesNotMatch(composer, /maxLength|4000/);
  assert.doesNotMatch(module, /maxLength=\{4000\}/);
  // Cresce pelo CSS (field-sizing) e, onde não existe, pelo ajuste de altura em JS.
  assert.match(css, /field-sizing:\s*content/);
  assert.match(css, /internal-chat-composer textarea[^}]*max-height/s);
  assert.match(composer, /fitComposer\(event\.currentTarget\)/);
});
