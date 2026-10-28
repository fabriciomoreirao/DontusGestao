import assert from "node:assert/strict";
import test from "node:test";
import { MODULES } from "../lib/domain.ts";
import { matchWorkspaceDestinations, normalizeWorkspaceSearch, readNavigationPreferences, readWorkspaceRoute, workspaceDestinationKey, workspaceRouteUrl } from "../lib/workspace-navigation.ts";

test("as telas e subáreas são preservadas ao recarregar uma URL", () => {
  for (const route of [
    { module: "dashboard" }, { module: "commercial", commercialFlow: "retention" },
    { module: "cs", csFlow: "enterprise" }, { module: "admin", adminPage: "employeeIndicators" },
    { module: "admin", adminPage: "permissions" }, { module: "reporting", reportingSection: "biExecutive" },
    { module: "catalogs", catalog: "statuses" },
  ]) {
    const url = workspaceRouteUrl("https://dontus.local/?mod=customers", route);
    const restored = readWorkspaceRoute(url.search, Object.keys(MODULES));
    for (const [key, value] of Object.entries(route)) assert.equal(restored[key], value);
  }
});

test("trocar de ferramenta remove vínculos e filtros da tela anterior", () => {
  const current = "https://dontus.local/?mod=cs&csFlow=enterprise&card=cliente&clientId=123&view=indicators&adminPage=permissions&lead=outro&subtask=7";
  const url = workspaceRouteUrl(current, { module: "work" });
  assert.equal(url.origin, "https://dontus.local");
  assert.deepEqual([...url.searchParams.entries()], [["mod", "work"]]);
  assert.equal(workspaceRouteUrl(url.href, { module: "dashboard" }).search, "");
});

test("endereços inválidos não geram módulos ou subáreas arbitrárias", () => {
  const read = search => readWorkspaceRoute(search, Object.keys(MODULES));
  assert.equal(read("?mod=__proto__").module, "dashboard");
  assert.equal(read("?mod=admin&adminPage=unknown").adminPage, "collaborators");
  assert.equal(read("?mod=cs&csFlow=unknown").csFlow, "onboarding");
  assert.equal(read("?mod=work&adminPage=permissions&csFlow=enterprise").adminPage, undefined);
  assert.equal(read("?mod=work&adminPage=permissions&csFlow=enterprise").csFlow, undefined);
});

test("favoritos distinguem fluxos diferentes do mesmo módulo", () => {
  const keys = [
    { module: "commercial", commercialFlow: "crm" }, { module: "commercial", commercialFlow: "retention" },
    { module: "cs", csFlow: "onboarding" }, { module: "cs", csFlow: "evolution" },
    { module: "admin", adminPage: "collaborators" }, { module: "admin", adminPage: "permissions" },
  ].map(workspaceDestinationKey);
  assert.equal(new Set(keys).size, keys.length);
});

test("a busca de ferramentas ignora acentos e aceita várias palavras em qualquer ordem", () => {
  const entries = [
    { label: "Comissões", group: "Operação", description: "Regras de remuneração por score" },
    { label: "Agenda", group: "Módulos", description: "Reuniões e compromissos por setor" },
  ];
  assert.equal(matchWorkspaceDestinations(entries, "operacao COMISSOES")[0].label, "Comissões");
  assert.equal(matchWorkspaceDestinations(entries, "setor reunioes")[0].label, "Agenda");
  assert.equal(matchWorkspaceDestinations(entries, "agenda comissoes").length, 0);
  assert.equal(matchWorkspaceDestinations(entries, " ").length, 2);
  assert.equal(normalizeWorkspaceSearch("  Retenção Ágil  "), "retencao agil");
});

test("preferências corrompidas ou de formato inesperado não impedem a navegação", () => {
  for (const raw of [null, "broken", "null", "123", "[]"]) assert.deepEqual(readNavigationPreferences(raw), { favorites: [], recent: [] });
  assert.deepEqual(readNavigationPreferences(JSON.stringify({ favorites: ["work", null, 4, "work", "x".repeat(200)], recent: ["tasks", "work"] })), { favorites: ["work"], recent: ["tasks", "work"] });
  assert.equal(readNavigationPreferences(JSON.stringify({ recent: Array.from({ length: 20 }, (_, index) => String(index)) })).recent.length, 6);
});
