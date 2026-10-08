import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mantém o perfil amplo e legível nos temas claro e escuro", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.employee-profile-drawer\{width:min\(88vw,1560px\)/);
  assert.match(css, /\.theme-light \.employee-profile-drawer/);
  assert.match(css, /\.theme-dark \.employee-profile-drawer/);
});

test("exibe o presente de aniversário no chat somente na data de Brasília", async () => {
  const [chat, operations, css] = await Promise.all([
    readFile(new URL("../app/InternalChatModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(chat, /timeZone: "America\/Sao_Paulo"/);
  assert.match(chat, /birthDate\?\.slice\(5, 10\) === todayInBrasilia/);
  assert.match(chat, /function BirthdayGift/);
  assert.match(chat, /window\.setInterval\(\(\) => setTodayInBrasilia/);
  assert.match(operations, /employees=\{data\.access\?\.employees \?\? \[\]\}/);
  assert.match(css, /\.internal-chat-birthday-gift/);
});

test("abre o perfil lateral do colaborador pela busca global", async () => {
  const operations = await readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8");
  assert.match(operations, /kind: "employee" as const/);
  assert.match(operations, /const openEmployeeFromGlobalSearch/);
  assert.match(operations, /setProfileEmployee\(employee\)/);
  assert.match(operations, /result\.kind === "employee"/);
  assert.match(operations, /Buscar ID, clientes, colaboradores, protocolos, tarefas/);
  assert.match(operations, /employee\.displayName\.toLocaleLowerCase\("pt-BR"\) === normalized/);
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
  const lucideImport = operations.match(/import\s*\{([\s\S]*?)\}\s*from "lucide-react"/)?.[1] ?? "";
  assert.match(lucideImport, /\bSend\b/);
  assert.doesNotMatch(operations, /createPortal\(drawer, document\.body\)/);
  assert.match(operations, /className="enterprise-interactions-drawer"/);
  assert.match(operations, /createAgendaCommitment/);
  assert.match(operations, /> Interações<\/button>/);
  assert.match(reminders, /Histórico pendente/);
  assert.match(reminders, /Pendentes em todas as funcionalidades/);
  assert.match(css, /Fechamento dos modais e painéis sempre no canto superior direito/);
  assert.match(css, /\.journey-drawer-body>\.journey-summary-grid/);
  assert.match(css, /\.app-shell \.main \.internal-chat-conversation-head h2\{font-size:1rem!important/);
});

test("mantém cartões compactos e status completos no desenvolvimento", async () => {
  const [css, development] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/DevelopmentModule.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(css, /Cartões compactos e hierarquia visual dos módulos operacionais/);
  assert.match(css, /\.app-shell \.main \.reminder-card h2\{font-size:\.98rem!important/);
  assert.match(css, /\.app-shell \.main \.diary-column>h2/);
  assert.match(css, /\.app-shell \.main \.recruitment-process-list h2/);
  assert.match(css, /\.app-shell \.main \.survey-grid h2/);
  assert.match(development, /\{ name: "Em validação", tone: "cyan" \}/);
  assert.match(development, /<option>Em validação<\/option><option>Em produção<\/option>/);
});

test("controla indicadores por grupo e exibe somente ferramentas do menu", async () => {
  const [operations, screens, access, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/Dontus.Operations.Domain/ScreenCatalog.cs", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/Dontus.Operations.Infrastructure/AccessControlService.cs", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(operations, /VIEW_INDICATORS_CAPABILITY = "viewIndicators"/);
  assert.match(operations, /canViewOperationIndicators/);
  assert.match(operations, /label: "Indicadores"/);
  assert.match(operations, /screen\.supportsIndicators/);
  assert.match(access, /obsoletePermissions/);
  assert.doesNotMatch(screens, /new\("finance"|new\("procurement"|new\("approvals"|new\("reporting"|new\("catalogs"/);
  assert.match(css, /repeat\(4,112px\)/);
});

test("mantém o clique de indicadores estável e copia o padrão do processo seletivo", async () => {
  const [operations, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(css, /\.permission-row > label \{[^}]*position: relative/);
  assert.match(css, /\.permission-row input \{[^}]*inset: 0/);
  assert.match(operations, /"recruitmentStageTemplate", "Padrões de colunas"/);
  assert.match(operations, /DEFAULT_RECRUITMENT_STAGES/);
  assert.match(operations, /stageTemplateName: template\?\.name/);
  assert.match(operations, /stageTemplateName:[^\n]+stages \}\)/);
  assert.match(operations, /const processStages = process/);
});

test("mantém os novos fluxos de CRM, evolução, metas e animações", async () => {
  const [operations, journey, goals, marketing, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CustomerSuccessJourneyModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/GoalsModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MarketingWorkspaceModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(operations, /dontus:commercial-settings-tab/);
  assert.match(operations, /dontus:commercial-settings-area/);
  assert.match(operations, /COMMERCIAL_CRM_CATALOGS/);
  assert.match(operations, /COMMERCIAL_RETENTION_CATALOGS/);
  assert.match(operations, /aria-label="Área dos cadastros comerciais"/);
  assert.match(operations, /commercialArea === "retention" \? functionality === "CRM Retenção" : functionality !== "CRM Retenção"/);
  assert.match(operations, /<label>Funil selecionado<select/);
  assert.doesNotMatch(operations, /<section className="commercial-active-funnel"/);
  assert.match(journey, /function UsageLineChart/);
  assert.match(journey, /<UsageLineChart milestones=\{milestones\} usageByDay=\{usageByDay\}/);
  assert.match(goals, /type Cadence="daily"\|"weekly"\|"monthly"\|"annual"/);
  assert.match(goals, /<option value="annual">Anual<\/option>/);
  assert.match(marketing, /onClick=\{onClose\} aria-label="Fechar"><X size=\{18\}/);
  assert.match(css, /\.commercial-column\{flex:0 0 292px!important/);
  assert.match(css, /\.commercial-catalog-area-tabs/);
  assert.match(css, /\.cs-usage-line-chart/);
  assert.match(css, /\.drawer-backdrop\.modal-leaving/);
});

test("limita os horários comerciais e permite bloquear períodos na agenda", async () => {
  const [operations, agenda, agendaService, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/AgendaModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/Dontus.Operations.Infrastructure/AgendaService.cs", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(operations, /slotCommitments\.length < 3/);
  assert.match(operations, /commercialSlotIsBlocked/);
  assert.match(operations, /isBrazilianHoliday/);
  assert.doesNotMatch(operations, /dayCommitments\.length\s*>=\s*3/);
  assert.match(agenda, /COMMERCIAL_AVAILABILITY_BLOCK_PREFIX/);
  assert.match(agenda, /> Bloquear período<\/button>/);
  assert.match(agenda, /> Bloqueios<\/button>/);
  assert.match(agendaService, /scheduledAtSlot >= 3/);
  assert.match(agendaService, /IsBrazilianHoliday/);
  assert.match(css, /\.commercial-schedule-rule/);
  assert.doesNotMatch(css, /\.commercial-schedule-controls::before/);
});

test("sincroniza responsáveis e suporta alinhamento único no acompanhamento", async () => {
  const [operations, journey, indicators, contracts, agendaService, api] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CustomerSuccessJourneyModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationIndicatorsBoard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/Dontus.Operations.Application/AgendaContracts.cs", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/Dontus.Operations.Infrastructure/AgendaService.cs", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/Dontus.Operations.Api/Program.cs", import.meta.url), "utf8"),
  ]);
  assert.match(operations, /entry\.isCoordinator && destinationTerms/);
  assert.match(journey, /assignAgendaCommitment/);
  assert.match(journey, /Atualizar responsável e agenda/);
  assert.match(journey, /singleAlignmentCompletedAt/);
  assert.match(journey, /onboardingReady = Boolean\(journey\.singleAlignmentCompletedAt/);
  assert.match(journey, />Alinhamento único</);
  assert.match(indicators, /label: "Kick offs"/);
  assert.match(indicators, /label: "Treinamentos"/);
  assert.match(indicators, /label: "Alinhamentos únicos"/);
  assert.match(contracts, /AssignAgendaCommitmentCommand/);
  assert.match(agendaService, /AssignCommitmentAsync/);
  assert.match(api, /case "assignAgendaCommitment"/);
});

test("padroniza campos de upload de mídia nos principais cadastros", async () => {
  const [component, css, ...modules] = await Promise.all([
    readFile(new URL("../app/MediaUploadField.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ...[
      "TasksModule.tsx",
      "SuggestionsModule.tsx",
      "HrManagementModule.tsx",
      "NoticesModule.tsx",
      "PortalDontus.tsx",
      "OperationsApp.tsx",
    ].map((file) => readFile(new URL(`../app/${file}`, import.meta.url), "utf8")),
  ]);
  assert.match(component, /media-upload-field/);
  assert.match(component, /media-upload-action/);
  assert.match(css, /\.media-upload-control/);
  assert.match(css, /linear-gradient\(135deg,#2688ed,#1765d4\)/);
  assert.ok((modules.join("\n").match(/<MediaUploadField/g) ?? []).length >= 8);
});

test("mantém upload de tarefa sem rolagem e disponível nos cards", async () => {
  const [tasks, css] = await Promise.all([
    readFile(new URL("../app/TasksModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(tasks, /function TaskCardFileUpload/);
  assert.match(tasks, /onUpload=\{uploadAttachments\}/);
  assert.match(tasks, /title="Subir arquivos"/);
  assert.match(css, /\.task-detail-overlay \.task-files-panel\{overflow:hidden\}/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\);grid-auto-rows:29px/);
});

test("exibe uploads como links e só abre a mídia quando solicitado", async () => {
  const [field, tasks, css] = await Promise.all([
    readFile(new URL("../app/MediaUploadField.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/TasksModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(field, /media-upload-links/);
  assert.match(field, /window\.open\(url/);
  assert.match(field, /previewUrl/);
  assert.match(tasks, /className="task-attachment-link"/);
  assert.doesNotMatch(tasks, /function TaskFilePreview/);
  assert.doesNotMatch(tasks, /className="task-media-thumb"/);
  assert.match(css, /\.task-attachment-link/);
});

test("permite selecionar e acumular vários arquivos", async () => {
  const [tasks, suggestions, hr] = await Promise.all([
    readFile(new URL("../app/TasksModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/SuggestionsModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/HrManagementModule.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(tasks, /mergeSelectedFiles/);
  assert.match(tasks, /multiple selectedFiles=\{files\}/);
  assert.match(suggestions, /multiple accept=/);
  assert.match(hr, /onSave:\(documents:HrDocument\[\]\)/);
  assert.match(hr, /Promise\.all\(files\.map/);
  assert.match(hr, /multiple selectedFiles=\{files\}/);
});

test("organiza múltiplos anexos, documentos de cancelamento e ID público", async () => {
  const [tasks, cancellations, journey, css] = await Promise.all([
    readFile(new URL("../app/TasksModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CancellationsModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CustomerSuccessJourneyModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(tasks, /task\.attachments\.length > 1 \? "multiple" : "single"/);
  assert.match(css, /\.task-detail-overlay \.task-attachment-grid\.multiple/);
  assert.match(cancellations, /attachments:Array/);
  assert.match(cancellations, /Documentos anexados/);
  assert.match(cancellations, /requesterPhone:string/);
  assert.match(cancellations, /Telefone do responsável pela solicitação/);
  assert.match(cancellations, /Telefone da solicitação/);
  assert.match(cancellations, /file\.arrayBuffer\(\)/);
  assert.match(cancellations, /typeof globalThis\.crypto\?\.randomUUID/);
  assert.doesNotMatch(cancellations, /id:crypto\.randomUUID\(\),name:file\.name/);
  assert.match(cancellations, /Não foi possível salvar os documentos/);
  assert.match(cancellations, /publicCustomerId/);
  assert.match(cancellations, /pattern="\\d\{6\}"/);
  assert.doesNotMatch(cancellations, /setClientId\(id\)/);
  assert.match(journey, /publicCustomerId\(customer\)/);
  assert.match(tasks, /publicCustomerCode\(customer\)/);
});

test("configura clientes, vincula redes e consolida comentários por ID", async () => {
  const [app, domain, contracts, service, migration, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/Dontus.Operations.Domain/Entities.cs", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/Dontus.Operations.Application/Contracts.cs", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/Dontus.Operations.Infrastructure/OperationsService.cs", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/Dontus.Operations.Infrastructure/Migrations/20261006120000_CustomerStrategicNetwork.cs", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /Configurar opções do cadastro de clientes/);
  assert.match(app, /const CUSTOMER_CATALOGS/);
  assert.match(app, /scope="customers"/);
  assert.match(app, /name="strategicNetworkId"/);
  assert.match(app, /Rede: \{linkedNetwork\.title\}/);
  assert.match(app, /label: "Comentários"/);
  assert.match(app, /label: "Alerta"/);
  assert.match(app, /structuredClientEvolutions/);
  assert.match(app, /Comentário registrado na evolução do cliente/);
  assert.match(domain, /Guid\? StrategicNetworkId/);
  assert.match(contracts, /strategic_network_id/);
  assert.match(service, /Selecione a rede da conta estratégica/);
  assert.match(migration, /FK_customers_work_items_StrategicNetworkId/);
  assert.match(css, /\.client-comment-timeline/);
});

test("centraliza alertas e checklists e retoma clientes pelo CRM Retenção", async () => {
  const [app, actions, enhancer, journey, serviceModule, backend, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ClientEngagementActions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ReminderAction.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CustomerSuccessJourneyModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ServiceRecordsModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/Dontus.Operations.Infrastructure/OperationsService.cs", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(enhancer, /CLIENT_ALERT_EVENT/);
  assert.match(enhancer, /CLIENT_CHECKLIST_EVENT/);
  assert.match(enhancer, /client-alert-detail-action/);
  assert.match(enhancer, /client-checklist-detail-action/);
  assert.match(enhancer, /checklistDisplayOnly/);
  assert.match(actions, /recordType: "Alerta do cliente"/);
  assert.match(actions, /recordType: "Checklist vinculado"/);
  assert.match(actions, /resolveContextCustomer/);
  assert.match(actions, /sourceCustomerIdentity/);
  assert.match(actions, /sharedTemplates/);
  assert.match(actions, /customerId: customer\.id \|\| null/);
  assert.match(actions, /createPortal/);
  assert.match(actions, /client-checklist-card-slot/);
  assert.match(actions, /client-checklist-picker/);
  assert.match(actions, /client-checklist-card-field/);
  assert.match(actions, /client-checklist-native-host/);
  assert.match(actions, /Vincular checklist ao card/);
  assert.match(actions, /setShowComposer\(false\)/);
  assert.match(actions, /void add\(selected\)/);
  assert.match(actions, /Checklist finalizado/);
  assert.match(actions, /Ocultar itens marcados/);
  assert.match(actions, /Mostrar itens marcados/);
  assert.match(actions, /linked-checklist-progress/);
  assert.match(actions, /className=\{entry\.checked \? "checked"/);
  assert.match(app, /label: "Checklists"/);
  assert.match(app, /commercialChecklist/);
  assert.match(app, /retentionChecklist/);
  assert.match(app, /csActivationChecklist/);
  assert.match(app, /enterpriseChecklist/);
  assert.match(app, /serviceChecklist/);
  assert.match(app, /cancellationChecklist/);
  assert.match(app, /Retomado pelo CRM Retenção/);
  assert.match(app, /sourceJourneyId/);
  assert.match(journey, /Retomar card no CRM Retenção/);
  assert.match(journey, /Cliente no CRM Retenção/);
  assert.match(serviceModule, /data-reminder-entity-id=\{item\.id\}/);
  assert.match(backend, /CanEditCustomerEngagement/);
  assert.match(backend, /CanRestartRetentionJourney/);
  assert.match(css, /\.client-alert-list/);
  assert.match(css, /\.linked-checklist-card/);
  assert.match(css, /\.client-engagement-backdrop\{z-index:35000/);
  assert.match(css, /@keyframes usageLineDraw/);
  assert.match(css, /\.cs-pipeline-tabs/);
});

test("mantém checklist estável e sincroniza cancelamentos com acompanhamentos e comissões", async () => {
  const [actions, cancellations, commissions, journey, enhancer, css] = await Promise.all([
    readFile(new URL("../app/ClientEngagementActions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CancellationsModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CommissionsModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CustomerSuccessJourneyModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ReminderAction.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(actions, /scrollIntoView/);
  assert.doesNotMatch(actions, /select autoFocus/);
  assert.match(actions, /onCloseRef/);
  assert.match(cancellations, /cancelLinkedJourneys/);
  assert.match(cancellations, /journey\.track==="activation"\|\|journey\.track==="retention"/);
  assert.match(cancellations, /phase:"cancelled",status:"Cancelado"/);
  assert.match(commissions, /Cancelado · disponível para reprovação/);
  assert.match(commissions, /busy\|\|cancelled/);
  assert.match(journey, /className="cs-card-labels"/);
  assert.doesNotMatch(enhancer, /classList\.add\("centered"\)/);
  assert.match(css, /\.cancellation-drawer>header\{display:flex;flex-wrap:wrap/);
  assert.match(css, /\.commission-row\.cancelled/);
});

test("mantém ficha, lembretes, desenvolvimento e indicadores integrados", async () => {
  const [app, reminders, enhancer, development, journeys, compose, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RemindersModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ReminderAction.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/DevelopmentModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationalJourneyModules.tsx", import.meta.url), "utf8"),
    readFile(new URL("../docker-compose.yml", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(enhancer, /CLIENT_RECORD_EVENT/);
  assert.match(enhancer, /Ficha do cliente/);
  assert.match(app, /Retomar cliente/);
  assert.match(app, /label: "Acompanhamentos"/);
  assert.match(app, /EmployeeIndicatorsAdmin/);
  assert.match(app, /DADOS DA GESTÃO RH/);
  assert.match(app, /onSection\("employeeIndicators"\)/);
  assert.match(app, /className="form-grid employee-form"/);
  assert.match(app, /userCan\(data\.user, "catalogs", "manage"\) \|\| userCan\(data\.user, "tasks", "manage"\)/);
  assert.match(reminders, /confirmedAt/);
  assert.match(reminders, /30 minutos/);
  assert.match(reminders, /ReminderDetailModal/);
  assert.match(development, /DevelopmentTriageCompletePortal/);
  assert.match(development, /searchParams\.delete\("subtask"\)/);
  assert.match(journeys, /<div className="journey-board">/);
  assert.match(compose, /TZ: America\/Sao_Paulo/);
  assert.match(css, /\.client-engagement-backdrop\.embedded-checklist/);
  assert.match(css, /\.employee-indicator-kpis/);
  assert.match(css, /\.client-checklist-card-slot/);
  assert.match(css, /\.client-checklist-native-host/);
  assert.match(css, /position:static!important/);
  assert.match(css, /\.client-checklist-picker/);
  assert.match(css, /\.client-checklist-card-field/);
  assert.match(css, /\.linked-checklist-actions/);
  assert.match(css, /\.linked-checklist-progress/);
  assert.match(css, /\.employee-modal/);
});
