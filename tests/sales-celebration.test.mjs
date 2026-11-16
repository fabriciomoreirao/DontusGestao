import assert from "node:assert/strict";
import test from "node:test";
import { saleTransition, enqueueSales, pendingWinChoice } from "../lib/sales-celebration.ts";
const item = (id, stage, type = "Lead comercial") => ({ id, module: "commercial", record_type: type, title: "Clínica", owner: "Ana", status: "Proposta", updated_at: "2026-11-05T15:00:00Z", description: JSON.stringify({ stage, customer: `Clínica ${id}`, clientId: "123456" }) });
test("o ganho informa cliente e ID, sem repetir a celebração em edições do mesmo ganho", () => {
  const sale = saleTransition(item("1", "Proposta"), item("1", "Ganho"));
  assert.equal(sale.customerName, "Clínica 1"); assert.equal(sale.clientId, "123456"); assert.equal(sale.seller, "Ana");
  assert.equal(saleTransition(item("1", "Ganho"), item("1", "Ganho")), undefined);
  assert.equal(saleTransition(item("1", "Proposta", "Lead de retenção"), item("1", "Ganho", "Lead de retenção")), undefined);
});
test("duas vendas simultâneas ficam na fila e novas consultas não reinserem as já recebidas", () => {
  const a = saleTransition(item("1", "Proposta"), item("1", "Ganho")); const b = saleTransition(item("2", "Proposta"), item("2", "Ganho"));
  const seen = new Set(); let queue = enqueueSales([], [a, b], seen);
  assert.deepEqual(queue.map(sale => sale.customerName), ["Clínica 1", "Clínica 2"]);
  queue = enqueueSales(queue.slice(1), [a, b], seen);
  assert.deepEqual(queue.map(sale => sale.customerName), ["Clínica 2"]);
});
test("ganhos sem notificação não entram na televisão", () => {
  const next = item("1", "Ganho"); next.description = JSON.stringify({ stage: "Ganho", notifyPublicWin: false });
  assert.equal(saleTransition(item("1", "Proposta"), next), undefined);
  next.description = JSON.stringify({ stage: "Ganho", notifyPublicWin: true });
  assert.ok(saleTransition(item("1", "Proposta"), next));
});
test("todos os caminhos de ganho pedem uma escolha e edições de ganhos existentes não repetem", () => {
  const previous = item("1", "Proposta");
  for (const action of ["updateWorkItem", "transitionWorkItem", "createWorkItem"]) {
    const payload = { action, module:"commercial", recordType:"Lead comercial", description: JSON.stringify({stage:"Ganho"}), nextStatus:"Ganho" };
    assert.ok(pendingWinChoice(action === "createWorkItem" ? undefined : previous, payload));
    assert.equal(pendingWinChoice(item("1", "Ganho"), payload), undefined);
  }
  assert.equal(pendingWinChoice(previous, {action:"updateWorkItem", description:previous.description}), undefined);
});
test("etapas de ganho configuradas respeitam o indicador e o aviso", () => {
  const catalogs = [{catalog:"funnelStage",name:"Vendas",description:JSON.stringify({s:[["Contrato aceito","#abc",true],["Ganho antigo","#abc",false]]})}];
  const previous = item("1", "Proposta"); previous.description = JSON.stringify({funnel:"Vendas",stage:"Proposta"});
  const payload = {action:"transitionWorkItem",nextStatus:"Contrato aceito"};
  assert.ok(pendingWinChoice(previous,payload,catalogs));
  assert.equal(pendingWinChoice(previous,{...payload,nextStatus:"Ganho antigo"},catalogs),undefined);
});
