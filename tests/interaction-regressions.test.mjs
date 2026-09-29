import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mantém o perfil amplo e legível nos temas claro e escuro", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.employee-profile-drawer\{width:min\(88vw,1560px\)/);
  assert.match(css, /\.theme-light \.employee-profile-drawer/);
  assert.match(css, /\.theme-dark \.employee-profile-drawer/);
});

test("mantém movimentação direta por arraste nos kanbans", async () => {
  const [operations, marketing, development, service, contracts] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MarketingWorkspaceModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/DevelopmentModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/Dontus.Operations.Infrastructure/OperationsService.cs", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/Dontus.Operations.Application/Contracts.cs", import.meta.url), "utf8"),
  ]);
  assert.match(operations, /boardMove: true/);
  assert.match(operations, /draggable=\{canEdit\}/);
  assert.match(marketing, /boardMove:true/);
  assert.match(development, /setData\("workItemId"/);
  assert.match(contracts, /bool BoardMove = false/);
  assert.match(service, /!command\.BoardMove/);
});

test("mantém gráficos próprios para cada domínio operacional", async () => {
  const indicators = await readFile(new URL("../app/OperationIndicatorsBoard.tsx", import.meta.url), "utf8");
  for (const title of [
    "Conversão de contatos",
    "Problemas e situações",
    "Funil comercial",
    "Unidades por rede",
    "Clientes por etapa LIA",
    "Candidatos por vaga",
    "Comissões por origem",
    "Metas por periodicidade",
    "Indicações por módulo",
  ]) assert.match(indicators, new RegExp(title));
  assert.match(indicators, /chartConfigFor\(module, contextKey, scoped\)/);
});

test("mantém lembretes acima dos detalhes e vinculados aos históricos", async () => {
  const [css, action, reminders, operations, tasks] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/ReminderAction.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RemindersModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/TasksModule.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(css, /\.reminder-modal-backdrop\{z-index:9100!important\}/);
  assert.match(action, /updateLinkedHistory/);
  assert.match(action, /\.task-table-row:not\(\.head\)/);
  assert.match(reminders, /sourceClientId:context\.clientId/);
  assert.match(reminders, /sourceCustomerName:context\.customerName/);
  assert.match(operations, /label: "Lembretes", count: reminders\.length/);
  assert.match(operations, /Lembretes vinculados ao cliente/);
  assert.match(tasks, /data-reminder-client-id=\{task\.customerCode\}/);
});

test("mantém funções nas vagas, interações estratégicas e histórico pendente", async () => {
  const [operations, reminders, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RemindersModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(operations, /entry\.catalog === "employeeRole"/);
  assert.match(operations, /function EnterpriseInteractionsModal/);
  assert.match(operations, /createAgendaCommitment/);
  assert.match(operations, /> Interações<\/button>/);
  assert.match(reminders, /Histórico pendente/);
  assert.match(reminders, /Pendentes em todas as funcionalidades/);
  assert.match(css, /Fechamento dos modais e painéis sempre no canto superior direito/);
  assert.match(css, /\.journey-drawer-body>\.journey-summary-grid/);
});
