import assert from "node:assert/strict";
import test from "node:test";
import { uploadTaskFiles, downloadTaskFile, deleteTaskFile } from "../lib/task-files-proxy.ts";

test("envia vídeo e imagem como multipart válido com a sessão e o comentário da tarefa", async t => {
  const form = new FormData();
  form.append("files", new File(["video-webm"], "evidencia.webm", { type: "video/webm" }));
  form.append("files", new File(["imagem-png"], "tela.png", { type: "image/png" }));
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.ok(url.endsWith("/api/tasks/task-id/attachments?commentId=comment-id"));
    assert.equal(options.headers.get("x-local-session"), "user/session");
    // A real Request checks the generated multipart boundary and rejects an unconfigured stream body.
    const outgoing = new Request(url, options);
    const files = (await outgoing.formData()).getAll("files");
    assert.equal(files.length, 2);
    assert.equal(files[0].name, "evidencia.webm"); assert.equal(files[0].type, "video/webm");
    assert.equal(await files[0].text(), "video-webm"); assert.equal(await files[1].text(), "imagem-png");
    return Response.json({ ids: ["video-id", "image-id"] }, { status: 201 });
  });
  const response = await uploadTaskFiles(new Request("http://localhost/api/task-files?taskId=task-id&commentId=comment-id", {
    method: "POST", headers: { cookie: "other=1; dontus_session=user%2Fsession" }, body: form,
  }));
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).ids, ["video-id", "image-id"]);
});

test("a reprodução do vídeo encaminha intervalos sem enviar a sessão para o armazenamento", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    assert.equal(options.headers.get("range"), "bytes=5-9");
    assert.equal(options.headers.get("if-range"), "video-version");
    if (calls === 1) {
      assert.equal(options.headers.get("x-local-session"), "session");
      assert.equal(options.redirect, "manual");
      return new Response(null, { status: 302, headers: { location: "https://storage.example.test/video?signature=test" } });
    }
    assert.equal(new URL(url).host, "storage.example.test");
    assert.equal(options.headers.get("x-local-session"), null);
    assert.equal(options.headers.get("x-user-email"), null);
    return new Response("video", { status: 206, headers: { "content-type": "video/webm", "content-range": "bytes 5-9/100", "accept-ranges": "bytes", "content-length": "5" } });
  });
  const response = await downloadTaskFile(new Request("http://localhost/api/task-files/video-id", { headers: {
    cookie: "dontus_session=session", range: "bytes=5-9", "if-range": "video-version",
  } }), "video-id");
  assert.equal(response.status, 206); assert.equal(response.headers.get("content-range"), "bytes 5-9/100");
  assert.equal(response.headers.get("accept-ranges"), "bytes"); assert.equal(await response.text(), "video");
  assert.equal(calls, 2);
});

test("download preserva a recusa da API sem buscar um arquivo externo", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ detail: "Sem acesso" }, { status: 403 }));
  const response = await downloadTaskFile(new Request("http://localhost/api/task-files/video"), "video");
  assert.equal(response.status, 403); assert.equal((await response.json()).detail, "Sem acesso");
  assert.equal(fetch.mock.callCount(), 1);
});

test("exclui o anexo usando a sessão e aceita resposta sem conteúdo", async t => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.method, "DELETE"); assert.equal(options.headers.get("x-local-session"), "session");
    return new Response(null, { status: 204 });
  });
  const response = await deleteTaskFile(new Request("http://localhost/api/task-files?id=file", { method: "DELETE", headers: { cookie: "dontus_session=session" } }));
  assert.equal(response.status, 204); assert.equal(await response.text(), "");
});

test("envio preserva falhas de autenticação e validação retornadas pela API", async t => {
  for (const status of [401, 403, 400]) {
    const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ detail: "Falha de envio" }, { status }));
    const form = new FormData(); form.append("files", new File(["x"], "video.webm"));
    const response = await uploadTaskFiles(new Request("http://localhost/api/task-files?taskId=task", { method: "POST", body: form }));
    assert.equal(response.status, status); assert.equal((await response.json()).detail, "Falha de envio");
    fetch.mock.restore();
  }
});

test("parâmetros ausentes não chamam a API e falhas de conexão são informadas", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  assert.equal((await uploadTaskFiles(new Request("http://localhost/api/task-files", { method: "POST" }))).status, 400);
  assert.equal((await deleteTaskFile(new Request("http://localhost/api/task-files", { method: "DELETE" }))).status, 400);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal((await downloadTaskFile(new Request("http://localhost/api/task-files/id"), "id")).status, 503);
});
