import assert from "node:assert/strict";
import test from "node:test";
import { buildCardShareUrl, csCardFlow } from "../lib/card-links.ts";

test("link da jornada usa o card e a ferramenta corretos mesmo quando copiado dentro de uma rede", () => {
  for (const track of ["activation", "retention"]) {
    const flow = csCardFlow(JSON.stringify({ kind: "csJourney", track }));
    const url = new URL(buildCardShareUrl("https://dontus.local", "https://dontus.local/?mod=cs&csFlow=enterprise&card=rede-1&client=outro", "cs", "jornada-1", { csFlow: flow }));
    assert.equal(url.searchParams.get("card"), "jornada-1");
    assert.equal(url.searchParams.get("csFlow"), track === "retention" ? "evolution" : "onboarding");
    assert.equal(url.searchParams.get("mod"), "cs");
    assert.equal(url.searchParams.has("client"), false);
  }
});

test("a jornada permite corrigir links antigos com csFlow ausente ou incorreto a partir do registro", () => {
  assert.equal(csCardFlow('{"kind":"csJourney","track":"activation","phase":"tracking"}'), "onboarding");
  assert.equal(csCardFlow('{"kind":"csJourney","track":"retention","phase":"finished"}'), "evolution");
  assert.equal(csCardFlow('{"kind":"enterpriseNetwork"}'), null);
  assert.equal(csCardFlow("inválido"), null);
});

test("links dos outros módulos preservam suas rotas específicas sem filtros de ferramentas diferentes", () => {
  const current = "https://dontus.local/?csFlow=enterprise&commercialFlow=retention&card=outro";
  const task = new URL(buildCardShareUrl("https://dontus.local", current, "tasks", "t1"));
  assert.equal(task.searchParams.get("task"), "t1");
  assert.equal(task.searchParams.get("card"), "t1");
  assert.equal(task.searchParams.has("csFlow"), false);
  assert.equal(task.searchParams.has("commercialFlow"), false);
  const development = new URL(buildCardShareUrl("https://dontus.local", current, "ti", "d1"));
  assert.equal(development.searchParams.get("subtask"), "d1");
  const crm = new URL(buildCardShareUrl("https://dontus.local", current, "commercial", "c1"));
  assert.equal(crm.searchParams.get("commercialFlow"), "retention");
});
