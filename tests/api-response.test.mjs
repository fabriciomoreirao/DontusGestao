import assert from "node:assert/strict";
import test from "node:test";
import { apiResponse } from "../lib/api-response.ts";

test("comprime a resposta sem alterar o JSON ou o status", async () => {
  const payload = { message: "Olá 😀", items: Array(1000).fill("Dados da operação") };
  const result = apiResponse(new Request("http://localhost", { headers: { "accept-encoding": "gzip, br" } }), Response.json(payload, { status: 201 }));
  assert.equal(result.status, 201);
  assert.equal(result.headers.get("content-encoding"), "gzip");
  const compressed = await result.arrayBuffer();
  assert.ok(compressed.byteLength < JSON.stringify(payload).length / 4);
  const restored = new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip")));
  assert.deepEqual(await restored.json(), payload);
});

test("respeita clientes sem suporte a gzip e respostas de erro", async () => {
  for (const encoding of ["", "br", "gzip;q=0"]) {
    const result = apiResponse(new Request("http://localhost", { headers: { "accept-encoding": encoding } }), Response.json({ ok: true }));
    assert.equal(result.headers.get("content-encoding"), null);
    assert.deepEqual(await result.json(), { ok: true });
  }
  const error = apiResponse(new Request("http://localhost", { headers: { "accept-encoding": "gzip" } }), Response.json({ detail: "Acesso negado" }, { status: 403 }));
  assert.equal(error.status, 403);
  assert.equal(error.headers.get("content-encoding"), null);
});
