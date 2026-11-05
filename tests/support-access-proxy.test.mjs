import assert from "node:assert/strict";
import test from "node:test";
import { GET, POST } from "../app/api/dontus-integration/[...path]/route.ts";
import { accessDeniedMessage, ACCESS_DENIED_EVENT, OUTSIDE_WORKING_HOURS } from "../lib/access-session.ts";
import { dontusIntegrationApi } from "../lib/dontus-integration-api.ts";

test("o histórico encaminha filtros de datas, responsável e motivo com a sessão autenticada", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      const target = new URL(url);
      assert.equal(target.pathname, "/api/dontus-integration/access/history");
      assert.equal(target.searchParams.get("from"), "2026-11-05");
      assert.equal(target.searchParams.get("to"), "2026-11-06");
      assert.equal(target.searchParams.get("responsible"), "ana@test.local");
      assert.equal(target.searchParams.get("reasonId"), "reason-id");
      assert.equal(options.headers.get("x-local-session"), "session-value");
      assert.equal(options.cache, "no-store");
      return Response.json({ entries: [], total: 0 });
    };
    const response = await GET(new Request("http://localhost/api/dontus-integration/access/history?from=2026-11-05&to=2026-11-06&responsible=ana%40test.local&reasonId=reason-id", { headers: { cookie: "dontus_session=session-value" } }), { params: Promise.resolve({ path: ["access", "history"] }) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally { globalThis.fetch = original; }
});

test("o acesso encaminha motivo e descrição sem substituir validações do servidor", async () => {
  const original = globalThis.fetch;
  const body = { identification: "210400", userId: 17, reasonId: "registered-reason", justification: "Verificar atendimento" };
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).pathname, "/api/dontus-integration/users/login");
      assert.deepEqual(JSON.parse(options.body), body);
      return Response.json({ detail: "Motivo inativo." }, { status: 400 });
    };
    const response = await POST(new Request("http://localhost/api/dontus-integration/users/login", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ path: ["users", "login"] }) });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { detail: "Motivo inativo." });
    const denied = await GET(new Request("http://localhost/api/dontus-integration/access/unsupported"), { params: Promise.resolve({ path: ["access", "unsupported"] }) });
    assert.equal(denied.status, 404);
  } finally { globalThis.fetch = original; }
});

test("a recusa por expediente leva a mensagem correta ao login e preserva a recusa comum", async () => {
  assert.equal(await accessDeniedMessage(Response.json({ code: "access_outside_hours", detail: OUTSIDE_WORKING_HOURS }, { status: 401 })), OUTSIDE_WORKING_HOURS);
  assert.equal(await accessDeniedMessage(Response.json({ detail: "Sessão expirada" }, { status: 401 })), undefined);
  const original = globalThis.fetch;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const target = new EventTarget();
  let denial;
  target.addEventListener(ACCESS_DENIED_EVENT, event => { denial = event.detail; });
  Object.defineProperty(globalThis, "window", { configurable: true, value: target });
  try {
    globalThis.fetch = async () => Response.json({ code: "access_outside_hours", detail: OUTSIDE_WORKING_HOURS }, { status: 401 });
    await assert.rejects(dontusIntegrationApi("access/reasons"), /Acesso proibido fora do expediente/);
    assert.equal(denial, OUTSIDE_WORKING_HOURS);
  } finally { globalThis.fetch = original; if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else delete globalThis.window; }
});

test("a configuração consulta os setores dinâmicos e encaminha o modo de catálogo com o setor do motivo", async () => {
  const original = globalThis.fetch;
  const body = { name: "Motivo 01", active: true, departmentId: "support-id" };
  try {
    globalThis.fetch = async (url, options) => {
      const target = new URL(url);
      if (target.pathname.endsWith("/departments")) return Response.json([{ id: "support-id", name: "Suporte", active: true }]);
      if (options.method === "POST") { assert.deepEqual(JSON.parse(options.body), body); return Response.json({ ...body, id: "reason-id" }); }
      assert.equal(target.searchParams.get("catalog"), "true"); return Response.json([]);
    };
    const sectors = await GET(new Request("http://localhost/api/dontus-integration/access/departments"), { params: Promise.resolve({ path: ["access", "departments"] }) });
    assert.equal(sectors.status, 200); assert.equal((await sectors.json())[0].name, "Suporte");
    const catalog = await GET(new Request("http://localhost/api/dontus-integration/access/reasons?catalog=true"), { params: Promise.resolve({ path: ["access", "reasons"] }) });
    assert.equal(catalog.status, 200);
    const saved = await POST(new Request("http://localhost/api/dontus-integration/access/reasons", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ path: ["access", "reasons"] }) });
    assert.equal(saved.status, 200);
  } finally { globalThis.fetch = original; }
});
