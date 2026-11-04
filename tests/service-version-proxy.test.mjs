import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/service-records/version/route.ts";

test("consulta a versão pelo ID completo e preserva a sessão sem armazenar a resposta",async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async(url,options)=>{
      assert.equal(new URL(url).pathname,"/api/operations/service-version");
      assert.equal(new URL(url).searchParams.get("clientId"),"210400");
      assert.equal(options.headers.get("x-local-session"),"test-session");
      assert.equal(options.cache,"no-store");
      return Response.json({version:"Plus"});
    };
    const response=await GET(new Request("http://localhost/api/service-records/version?clientId=210400",{headers:{cookie:"dontus_session=test-session"}}));
    assert.equal(response.status,200);
    assert.equal(response.headers.get("cache-control"),"no-store");
    assert.deepEqual(await response.json(),{version:"Plus"});
  } finally { globalThis.fetch=original; }
});

test("rejeita ID parcial sem consultar e preserva erros de autorização da API",async()=>{
  const original=globalThis.fetch;let called=false;
  try {
    globalThis.fetch=async()=>{called=true;return Response.json({detail:"Sem acesso"},{status:403});};
    assert.equal((await GET(new Request("http://localhost/api/service-records/version?clientId=21040"))).status,400);
    assert.equal(called,false);
    const denied=await GET(new Request("http://localhost/api/service-records/version?clientId=210400"));
    assert.equal(denied.status,403);assert.deepEqual(await denied.json(),{detail:"Sem acesso"});
    globalThis.fetch=async()=>{throw new Error("offline");};
    assert.equal((await GET(new Request("http://localhost/api/service-records/version?clientId=210400"))).status,503);
  } finally { globalThis.fetch=original; }
});
