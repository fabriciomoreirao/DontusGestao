import assert from "node:assert/strict";
import test from "node:test";
import { GET, POST } from "../app/api/public-service-requests/route.ts";

test("a consulta pública encaminha somente o ID solicitado e impede cache dos dados de contato", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.PUBLIC_SERVICE_REQUESTS_API_KEY;
  const originalBase = process.env.API_INTERNAL_URL;
  process.env.PUBLIC_SERVICE_REQUESTS_API_KEY = "test-key";
  process.env.API_INTERNAL_URL = "http://api.test";
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), "http://api.test/api/public-service-requests?clientId=123456");
      assert.equal(options.method, "GET");
      assert.equal(options.headers.get("x-api-key"), "test-key");
      assert.equal(options.body, undefined);
      assert.equal(options.cache, "no-store");
      return Response.json({ matched:true, companyName:"Clínica de teste", whatsapp:"5511999999999" });
    };
    const response = await GET(new Request("http://localhost/api/public-service-requests?clientId=123456&extra=ignored"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).matched, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.PUBLIC_SERVICE_REQUESTS_API_KEY; else process.env.PUBLIC_SERVICE_REQUESTS_API_KEY = originalKey;
    if (originalBase === undefined) delete process.env.API_INTERNAL_URL; else process.env.API_INTERNAL_URL = originalBase;
  }
});
test("a abertura de chamado preserva o corpo e os erros da API", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(options.method, "POST");
      assert.equal(new TextDecoder().decode(options.body), "request-body");
      assert.equal(new URL(url).search, "");
      return Response.json({ detail:"Dados inválidos" }, { status:400 });
    };
    const response = await POST(new Request("http://localhost/api/public-service-requests", { method:"POST", body:"request-body" }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).detail, "Dados inválidos");
  } finally { globalThis.fetch = originalFetch; }
});
