import assert from "node:assert/strict";
import test from "node:test";
import {
  recordSources,
  resolveRecordSource,
  mergeRecordPage,
  fetchRecordPage,
  recordKey,
} from "../lib/record-pages.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("listas resolvem a origem persistida sem confundir colaboradores com tarefas", () => {
  const data = {
    items: [{ id: id(1), description: "{}" }],
    taskModule: {
      tasks: [{ id: id(2) }],
      collaborators: [{ id: id(3), name: "Ana" }],
    },
    access: { employees: [{ id: id(3), displayName: "Ana" }] },
  };
  const sources = recordSources(data);
  assert.deepEqual(resolveRecordSource(sources, [id(1)], "support"), ["items"]);
  assert.deepEqual(resolveRecordSource(sources, [id(3)], "tasks"), [
    "taskModule",
    "collaborators",
  ]);
  assert.deepEqual(resolveRecordSource(sources, [id(3)], "admin"), [
    "access",
    "employees",
  ]);
  assert.equal(
    resolveRecordSource(sources, ["agregação sem registro"], "support"),
    undefined,
  );
  assert.equal(recordKey(".$" + id(1)), id(1));
});
test("a página recebida atualiza os dados sem apagar outras páginas ou substituir uma edição mais nova", () => {
  const first = { id: id(1), version: 2, title: "Original" },
    other = { id: id(2), version: 1, title: "Outra página" },
    data = { items: [first, other] };
  const updated = mergeRecordPage(
    data,
    ["items"],
    [{ id: id(1), version: 3, title: "Atualizado no servidor" }],
  );
  assert.equal(updated.items.length, 2);
  assert.equal(updated.items[0].title, "Atualizado no servidor");
  assert.equal(updated.items[1], other);
  assert.equal(
    mergeRecordPage(
      updated,
      ["items"],
      [{ id: id(1), version: 2, title: "Resposta atrasada" }],
    ),
    updated,
  );
  assert.equal(mergeRecordPage(updated, ["__proto__", "items"], []), updated);
});
test("unidades e outros registros incorporados mantêm a origem e atualizam apenas a coleção consultada", () => {
  const data = {
    items: [
      {
        id: id(1),
        description: JSON.stringify({
          units: [
            { id: id(2), notes: "Antes" },
            { id: id(3), notes: "Preservar" },
          ],
        }),
      },
    ],
  };
  const path = resolveRecordSource(recordSources(data), [id(2), id(3)], "cs");
  assert.deepEqual(path, [
    "items",
    `@id:${id(1)}`,
    "$json:description",
    "units",
  ]);
  const updated = mergeRecordPage(data, path, [
    { id: id(2), notes: "Do servidor" },
  ]);
  const detail = JSON.parse(updated.items[0].description);
  assert.equal(detail.units[0].notes, "Do servidor");
  assert.equal(detail.units[1].notes, "Preservar");
});
test("abrir lista, trocar página e alterar quantidade fazem requisições distintas à API", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push(JSON.parse(options.body));
    assert.equal(url, "/api/record-pages");
    return Response.json({
      keys: [id(1)],
      rows: [{ id: id(1) }],
      page: calls.at(-1).page,
      pageSize: calls.at(-1).pageSize,
      total: 31,
    });
  });
  for (const [page, size] of [
    [1, 10],
    [2, 10],
    [1, 30],
  ])
    await fetchRecordPage(
      ["items"],
      [id(1)],
      page,
      size,
      new AbortController().signal,
    );
  assert.deepEqual(
    calls.map((call) => [call.page, call.pageSize]),
    [
      [1, 10],
      [2, 10],
      [1, 30],
    ],
  );
});
test("falha de consulta não é substituída por uma página recortada no navegador", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ detail: "Sem permissão" }, { status: 403 }),
  );
  await assert.rejects(
    fetchRecordPage(["items"], [id(1)], 1, 10, new AbortController().signal),
    /Sem permissão/,
  );
});
