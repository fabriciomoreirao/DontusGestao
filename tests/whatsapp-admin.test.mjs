import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRecipients, templatePreview } from "../lib/whatsapp-admin.ts";
import { readWorkspaceRoute, workspaceRouteUrl } from "../lib/workspace-navigation.ts";

test("campaign imports normalize international phones and preserve personalized values", () => {
  const result = normalizeRecipients([
    { name: " Maria ", phone: "(11) 99999-1111", values: { clinica: "Sorriso" } },
    { name: "Maria duplicada", phone: "+55 11 99999-1111" },
    { name: "Inválido", phone: "123" },
    { name: "", phone: "11999992222" },
    { name: "Contato internacional", phone: "+1 415 555 2671" },
  ]);
  assert.equal(result.duplicates, 1); assert.equal(result.invalid, 2);
  assert.deepEqual(result.recipients[0], { name: "Maria", phone: "5511999991111", values: { clinica: "Sorriso" } });
  assert.equal(result.recipients[1].phone, "14155552671");
});
test("template preview substitutes repeated variables without interpreting the content as code", () => {
  assert.equal(templatePreview("Olá {{1}}. {{2}}. Até logo, {{1}}!", ["Maria", "<img src=x>"]), "Olá Maria. <img src=x>. Até logo, Maria!");
});
test("WhatsApp configuration sections survive refresh and browser history", () => {
  for (const adminPage of ["whatsappTemplates", "whatsappConnection", "whatsappCampaigns"]) {
    const url = workspaceRouteUrl("https://dontus.local", { module: "admin", adminPage });
    assert.equal(readWorkspaceRoute(url.search, ["admin", "chat"]).adminPage, adminPage);
  }
});
