import assert from "node:assert/strict";
import test from "node:test";
import { clipboardImages } from "../lib/clipboard-images.ts";

const item = file => ({ kind: "file", type: file.type, getAsFile: () => file });

test("extrai imagens copiadas sem duplicar o mesmo arquivo presente em items e files", () => {
  const image = new File(["image"], "captura.png", { type: "image/png" });
  const pdf = new File(["pdf"], "documento.pdf", { type: "application/pdf" });
  assert.deepEqual(clipboardImages({ items: [item(image), item(pdf)], files: [image, pdf] }), [image]);
});

test("preserva múltiplas imagens e usa a lista de arquivos quando o navegador não entrega items", () => {
  const images = [new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.jpg", { type: "image/jpeg" })];
  assert.deepEqual(clipboardImages({ items: [], files: images }), images);
});

test("colar somente texto não produz imagens nem interfere no texto colado", () => {
  assert.deepEqual(clipboardImages({ items: [{ kind: "string", type: "text/plain", getAsFile: () => null }], files: [] }), []);
});

test("imagens sem nome recebem extensão válida e preservam conteúdo e tipo", async () => {
  const file = new File(["image-content"], "", { type: "image/jpeg" });
  const [image] = clipboardImages({ items: [item(file)], files: [] });
  assert.equal(image.name, "imagem-colada-1.jpg"); assert.equal(image.type, file.type);
  assert.equal(await image.text(), "image-content");
});
