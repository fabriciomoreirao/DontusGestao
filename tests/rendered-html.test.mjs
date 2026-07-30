import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("compila a Central de Operações com metadados e ativos da marca", async () => {
  const [layout, app, css] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /lang="pt-BR"/i);
  assert.match(layout, /Dontus \| Central de Operações/i);
  assert.match(layout, /og\.png/i);
  assert.match(app, /Dontus Gestão Odontológica/i);
  assert.match(app, /Customer 360/i);
  assert.match(app, /Usuários e grupos/i);
  assert.match(app, /Permissões do grupo/i);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.doesNotMatch(`${layout}${app}`, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
  await Promise.all([
    access(new URL("../public/dontus-logo.png", import.meta.url)),
    access(new URL("../public/dontus-mark.png", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
    access(new URL("../dist/server/index.js", import.meta.url)),
  ]);
});

test("mantém a identidade, a persistência e a API C# no produto final", async () => {
  const [page, layout, packageJson, hosting, proxy] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/operations/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /OperationsApp/);
  assert.match(layout, /Dontus \| Central de Operações/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(hosting, /"d1": null/);
  assert.match(proxy, /API_INTERNAL_URL/);
  assert.match(proxy, /aspnet-core/);
});
