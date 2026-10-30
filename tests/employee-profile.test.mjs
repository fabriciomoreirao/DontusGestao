import assert from "node:assert/strict";
import test from "node:test";
import { proxyEmployeeProfile } from "../lib/employee-profile-proxy.ts";

test("carrega e salva o perfil próprio encaminhando a sessão e a versão", async t => {
  for (const method of ["GET", "PUT"]) {
    const body = { bio: "Minha bio", phrase: "Minha frase", coverDataUrl: "", version: 4 };
    const mock = t.mock.method(globalThis, "fetch", async (url, options) => {
      assert.ok(url.endsWith("/api/employee-profiles/me"));
      assert.equal(options.headers.get("x-local-session"), "session-token");
      assert.equal(options.method, method);
      assert.equal(options.cache, "no-store");
      if (method === "PUT") assert.deepEqual(JSON.parse(options.body), body);
      return Response.json({ ...body, version: 5 });
    });
    const request = new Request("http://localhost/api/employee-profiles/me", {
      method, headers: { cookie: "dontus_session=session-token" }, body: method === "PUT" ? JSON.stringify(body) : undefined,
    });
    const response = await proxyEmployeeProfile(request, "me");
    assert.equal(response.status, 200); assert.equal((await response.json()).version, 5);
    assert.equal(response.headers.get("cache-control"), "no-store");
    mock.mock.restore();
  }
});

test("preserva erros de sessão, acesso, validação e conflito de versão", async t => {
  for (const status of [400, 401, 403, 404, 409]) {
    const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ detail: "Falha informada pela API" }, { status }));
    const response = await proxyEmployeeProfile(new Request("http://localhost/api/employee-profiles/me"), "me");
    assert.equal(response.status, status); assert.equal((await response.json()).detail, "Falha informada pela API");
    mock.mock.restore();
  }
});

test("recusa caminhos inválidos e edição de outro perfil antes de chamar a API", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => assert.fail("Não deve chamar a API"));
  assert.equal((await proxyEmployeeProfile(new Request("http://localhost"), "../operations")).status, 400);
  assert.equal((await proxyEmployeeProfile(new Request("http://localhost", { method: "PUT", body: "{}" }), "11111111-1111-1111-1111-111111111111")).status, 405);
  assert.equal(mock.mock.callCount(), 0);
});

test("informa falha de conexão para permitir uma nova tentativa", async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed"); });
  const response = await proxyEmployeeProfile(new Request("http://localhost"), "me");
  assert.equal(response.status, 503); assert.match((await response.json()).detail, /Tente novamente/);
});
