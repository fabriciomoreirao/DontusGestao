import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/auth/change-password/route.ts";

const request = (cookie = "dontus_session=session-token") => new Request("http://localhost/api/auth/change-password", {
  method: "POST",
  headers: cookie ? { cookie } : {},
  body: JSON.stringify({ currentPassword: "old-password", newPassword: "new-password" }),
});

test("confirma a troca de senha com sucesso inclusive quando a API retorna 204", async (t) => {
  for (const upstream of [new Response(null, { status: 204 }), Response.json({ message: "Senha alterada com sucesso." })]) {
    const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
      assert.ok(url.endsWith("/api/auth/change-password"));
      assert.equal(options.headers["x-local-session"], "session-token");
      assert.deepEqual(JSON.parse(options.body), { currentPassword: "old-password", newPassword: "new-password" });
      return upstream;
    });
    const response = await POST(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { message: "Senha alterada com sucesso." });
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
});

test("preserva erros de senha, validação e sessão retornados pela API", async (t) => {
  for (const [status, detail] of [[400, "A senha atual não confere."], [401, "Sessão expirada."], [500, "Falha na operação."]]) {
    const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ detail }, { status }));
    const response = await POST(request());
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { detail });
    fetch.mock.restore();
  }
});

test("recusa solicitações sem sessão antes de chamar a API", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => assert.fail("Não deve chamar a API"));
  assert.equal((await POST(request(""))).status, 401);
  assert.equal(fetch.mock.callCount(), 0);
});

test("retorna indisponibilidade quando a conexão com a API falha", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed"); });
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { detail: "Serviço de autenticação indisponível." });
});
