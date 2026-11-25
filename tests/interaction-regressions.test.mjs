import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { customerSuccessScore } from "../lib/commission-rules.ts";

// Estes testes procuram trechos do código-fonte, que é formatado pelo Prettier.
// A comparação ignora o layout dos dois lados: espaços, quebras de linha,
// vírgulas finais, o ponto e vírgula antes de "}" e o {" "} que o Prettier
// insere no fim das linhas de texto do JSX.
const withoutLayout = (text) =>
  text
    .replace(/\s+/g, "")
    .replace(/,(?=[)\]}])/g, "")
    .replace(/;(?=\})/g, "")
    .replace(/\{""\}/g, "");
const codePattern = (pattern) =>
  new RegExp(pattern.source.replace(/\s+/g, ""), pattern.flags);
const assertCode = {
  match: (text, pattern) =>
    assert.match(withoutLayout(text), codePattern(pattern)),
  doesNotMatch: (text, pattern) =>
    assert.doesNotMatch(withoutLayout(text), codePattern(pattern)),
};

test("mantém o perfil amplo e legível nos temas claro e escuro", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assertCode.match(css, /\.employee-profile-drawer\{width:min\(88vw,1560px\)/);
  assertCode.match(css, /\.theme-light \.employee-profile-drawer/);
  assertCode.match(css, /\.theme-dark \.employee-profile-drawer/);
});

test("exibe o presente de aniversário no chat somente na data de Brasília", async () => {
  const [chat, operations, css] = await Promise.all([
    readFile(new URL("../app/InternalChatModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(chat, /timeZone: "America\/Sao_Paulo"/);
  assertCode.match(chat, /birthDate\?\.slice\(5, 10\) === todayInBrasilia/);
  assertCode.match(chat, /function BirthdayGift/);
  assertCode.match(chat, /window\.setInterval\(\(\) => setTodayInBrasilia/);
  assertCode.match(
    operations,
    /employees=\{data\.access\?\.employees \?\? \[\]\}/,
  );
  assertCode.match(css, /\.internal-chat-birthday-gift/);
});

test("abre o perfil lateral do colaborador pela busca global", async () => {
  const operations = await readFile(
    new URL("../app/OperationsApp.tsx", import.meta.url),
    "utf8",
  );
  assertCode.match(operations, /kind: "employee" as const/);
  assertCode.match(operations, /const openEmployeeFromGlobalSearch/);
  assertCode.match(operations, /setProfileEmployee\(employee\)/);
  assertCode.match(operations, /result\.kind === "employee"/);
  assertCode.match(operations, /Buscar clientes, IDs, protocolos e registros/);
  assertCode.match(
    operations,
    /employee\.displayName\.toLocaleLowerCase\("pt-BR"\) === normalized/,
  );
});

test("mantém movimentação direta por arraste nos kanbans", async () => {
  const [operations, marketing, service, contracts] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/MarketingWorkspaceModule.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Infrastructure/OperationsService.cs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Application/Contracts.cs",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assertCode.match(operations, /boardMove: true/);
  assertCode.match(operations, /draggable=\{canEdit\}/);
  assertCode.match(marketing, /boardMove:true/);
  assertCode.match(contracts, /bool BoardMove = false/);
  assertCode.match(service, /!command\.BoardMove/);
});

test("mantém gráficos próprios para cada domínio operacional", async () => {
  const indicators = await readFile(
    new URL("../app/OperationIndicatorsBoard.tsx", import.meta.url),
    "utf8",
  );
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
  ])
    assertCode.match(indicators, new RegExp(title));
  assertCode.match(indicators, /chartConfigFor\(module, contextKey, scoped\)/);
});

test("mantém lembretes acima dos detalhes e vinculados aos históricos", async () => {
  const [css, action, reminders, operations, tasks] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/ReminderAction.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RemindersModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/TasksModule.tsx", import.meta.url), "utf8"),
  ]);
  assertCode.match(css, /\.reminder-modal-backdrop\{z-index:9100!important\}/);
  assertCode.match(action, /updateLinkedHistory/);
  assertCode.match(action, /\.task-table-row:not\(\.head\)/);
  assertCode.match(reminders, /sourceClientId:context\.clientId/);
  assertCode.match(reminders, /sourceCustomerName:context\.customerName/);
  assertCode.match(operations, /label: "Lembretes", count: reminders\.length/);
  assertCode.match(operations, /Lembretes vinculados ao cliente/);
  assertCode.match(tasks, /data-reminder-client-id=\{task\.customerCode\}/);
});

test("mantém funções nas vagas, interações estratégicas e histórico pendente", async () => {
  const [operations, reminders, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RemindersModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(operations, /entry\.catalog === "employeeRole"/);
  assertCode.match(operations, /function EnterpriseInteractionsModal/);
  const lucideImport =
    operations.match(/import\s*\{([\s\S]*?)\}\s*from "lucide-react"/)?.[1] ??
    "";
  assertCode.match(lucideImport, /\bSend\b/);
  assertCode.doesNotMatch(operations, /createPortal\(drawer, document\.body\)/);
  assertCode.match(operations, /className="enterprise-interactions-drawer"/);
  assertCode.match(operations, /createAgendaCommitment/);
  assertCode.match(operations, /> Interações<\/button>/);
  assertCode.match(reminders, /Histórico pendente/);
  assertCode.match(reminders, /Pendentes em todas as funcionalidades/);
  assertCode.match(
    css,
    /Fechamento dos modais e painéis sempre no canto superior direito/,
  );
  assertCode.match(css, /\.journey-drawer-body>\.journey-summary-grid/);
  assertCode.match(
    css,
    /\.app-shell \.main \.internal-chat-conversation-head h2\{font-size:1rem!important/,
  );
});

test("mantém cartões compactos e status completos no desenvolvimento", async () => {
  const [css, development] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/DevelopmentModule.tsx", import.meta.url), "utf8"),
  ]);
  assertCode.match(
    css,
    /Cartões compactos e hierarquia visual dos módulos operacionais/,
  );
  assertCode.match(
    css,
    /\.app-shell \.main \.reminder-card h2\{font-size:0?\.98rem!important/,
  );
  assertCode.match(css, /\.app-shell \.main \.diary-column>h2/);
  assertCode.match(css, /\.app-shell \.main \.recruitment-process-list h2/);
  assertCode.match(css, /\.app-shell \.main \.survey-grid h2/);
  assertCode.match(development, /\{ name: "Em validação", tone: "cyan" \}/);
  assertCode.match(
    development,
    /<option>Em validação<\/option><option>Liberada<\/option><option>Em produção<\/option>/,
  );
});

test("controla indicadores por grupo e exibe somente ferramentas do menu", async () => {
  const [operations, screens, access, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Domain/ScreenCatalog.cs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Infrastructure/AccessControlService.cs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(operations, /VIEW_INDICATORS_CAPABILITY = "viewIndicators"/);
  assertCode.match(operations, /canViewOperationIndicators/);
  assertCode.match(operations, /label: "Indicadores"/);
  assertCode.match(operations, /screen\.supportsIndicators/);
  assertCode.match(access, /obsoletePermissions/);
  assertCode.doesNotMatch(
    screens,
    /new\("finance"|new\("procurement"|new\("approvals"|new\("reporting"|new\("catalogs"/,
  );
  assertCode.match(css, /repeat\(4,112px\)/);
});

test("mantém o clique de indicadores estável e copia o padrão do processo seletivo", async () => {
  const [operations, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(css, /\.permission-row > label \{[^}]*position: relative/);
  assertCode.match(css, /\.permission-row input \{[^}]*inset: 0/);
  assertCode.match(
    operations,
    /"recruitmentStageTemplate", "Padrões de colunas"/,
  );
  assertCode.match(operations, /DEFAULT_RECRUITMENT_STAGES/);
  assertCode.match(operations, /stageTemplateName: template\?\.name/);
  // [^{}]+ keeps the search inside the same object, now that line breaks are ignored.
  assertCode.match(operations, /stageTemplateName:[^{}]+stages \}\)/);
  assertCode.match(operations, /const processStages = process/);
});

test("mantém os novos fluxos de CRM, evolução, metas e animações", async () => {
  const [operations, journey, goals, marketing, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/CustomerSuccessJourneyModule.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/GoalsModule.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/MarketingWorkspaceModule.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(operations, /dontus:commercial-settings-tab/);
  assertCode.match(operations, /dontus:commercial-settings-area/);
  assertCode.match(operations, /COMMERCIAL_CRM_CATALOGS/);
  assertCode.match(operations, /COMMERCIAL_RETENTION_CATALOGS/);
  assertCode.match(operations, /aria-label="Área dos cadastros comerciais"/);
  assertCode.match(
    operations,
    /commercialArea === "retention" \? functionality === "CRM Retenção" : functionality !== "CRM Retenção"/,
  );
  assertCode.match(operations, /<label>Funil selecionado<select/);
  assertCode.doesNotMatch(
    operations,
    /<section className="commercial-active-funnel"/,
  );
  assertCode.match(journey, /function UsageLineChart/);
  assertCode.match(
    journey,
    /<UsageLineChart milestones=\{milestones\} usageByDay=\{usageByDay\}/,
  );
  assertCode.match(
    goals,
    /type Cadence="daily"\|"weekly"\|"monthly"\|"annual"/,
  );
  assertCode.match(goals, /<option value="annual">Anual<\/option>/);
  assertCode.match(
    marketing,
    /onClick=\{onClose\} aria-label="Fechar"><X size=\{18\}/,
  );
  assertCode.match(css, /\.commercial-column\{flex:0 0 292px!important/);
  assertCode.match(css, /\.commercial-catalog-area-tabs/);
  assertCode.match(css, /\.cs-usage-line-chart/);
  assertCode.match(css, /\.drawer-backdrop\.modal-leaving/);
});

test("limita os horários comerciais e permite bloquear períodos na agenda", async () => {
  const [operations, agenda, agendaService, css, scheduling] =
    await Promise.all([
      readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/AgendaModule.tsx", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../backend/src/Dontus.Operations.Infrastructure/AgendaService.cs",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(
        new URL("../lib/commercial-scheduling.ts", import.meta.url),
        "utf8",
      ),
    ]);
  assertCode.match(operations, /availableCommercialSlots/);
  assertCode.match(scheduling, /slotCommitments\.length < 3/);
  assertCode.match(scheduling, /commercialSlotIsBlocked/);
  assertCode.match(operations, /isBrazilianHoliday/);
  assertCode.doesNotMatch(operations, /dayCommitments\.length\s*>=\s*3/);
  assertCode.match(agenda, /COMMERCIAL_AVAILABILITY_BLOCK_PREFIX/);
  assertCode.match(agenda, /> Bloquear período<\/button>/);
  assertCode.match(agenda, /> Bloqueios<\/button>/);
  assertCode.match(agendaService, /scheduledAtSlot >= 3/);
  assertCode.match(agendaService, /IsBrazilianHoliday/);
  assertCode.match(css, /\.commercial-schedule-rule/);
  assertCode.doesNotMatch(css, /\.commercial-schedule-controls::before/);
});

test("sincroniza responsáveis e suporta alinhamento único no acompanhamento", async () => {
  const [operations, journey, indicators, contracts, agendaService, api] =
    await Promise.all([
      readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/CustomerSuccessJourneyModule.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/OperationIndicatorsBoard.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../backend/src/Dontus.Operations.Application/AgendaContracts.cs",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../backend/src/Dontus.Operations.Infrastructure/AgendaService.cs",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../backend/src/Dontus.Operations.Api/Program.cs",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
  assertCode.match(operations, /entry\.isCoordinator && destinationTerms/);
  assertCode.match(journey, /responsibleUserId: employee\.id/);
  assertCode.match(journey, /Atualizar responsável e agenda/);
  assertCode.match(journey, /singleAlignmentCompletedAt/);
  assertCode.match(
    journey,
    /onboardingReady = Boolean\(journey\.singleAlignmentCompletedAt/,
  );
  assertCode.match(journey, />Alinhamento único</);
  assertCode.match(indicators, /label: "Kick offs"/);
  assertCode.match(indicators, /label: "Treinamentos"/);
  assertCode.match(indicators, /label: "Alinhamentos únicos"/);
  assertCode.match(contracts, /AssignAgendaCommitmentCommand/);
  assertCode.match(agendaService, /AssignCommitmentAsync/);
  assertCode.match(api, /case "assignAgendaCommitment"/);
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
    ].map((file) =>
      readFile(new URL(`../app/${file}`, import.meta.url), "utf8"),
    ),
  ]);
  assertCode.match(component, /media-upload-field/);
  assertCode.match(component, /media-upload-action/);
  assertCode.match(css, /\.media-upload-control/);
  assertCode.match(css, /linear-gradient\(135deg,#2688ed,#1765d4\)/);
  for (const source of modules) assertCode.match(source, /<MediaUploadField/);
  assertCode.match(
    modules[0],
    /ref=\{attachmentInput\} type="file" hidden multiple/,
  );
});

test("mantém upload de arquivos disponível no modal de tarefas", async () => {
  const [tasks, css] = await Promise.all([
    readFile(new URL("../app/TasksModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(
    tasks,
    /ref=\{attachmentInput\} type="file" hidden multiple/,
  );
  assertCode.match(tasks, /uploadAttachments=\{uploadAttachments\}/);
  assertCode.match(
    css,
    /\.task-detail-overlay \.task-files-panel\{overflow:hidden\}/,
  );
  assertCode.match(
    css,
    /grid-template-columns:repeat\(3,minmax\(0,1fr\)\);grid-auto-rows:29px/,
  );
});

test("exibe uploads com prévia sob demanda e preserva links dos anexos de tarefas", async () => {
  const [field, tasks, css, preview] = await Promise.all([
    readFile(new URL("../app/MediaUploadField.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/TasksModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/FilePreview.tsx", import.meta.url), "utf8"),
  ]);
  assertCode.match(field, /media-upload-links/);
  assertCode.match(field, /LocalFilePreview/);
  assertCode.match(preview, /onClick=\{\(\) => setOpen\(true\)\}/);
  assertCode.match(preview, /role="dialog"/);
  assertCode.match(preview, /download=\{name\}/);
  assertCode.match(field, /previewUrl/);
  assertCode.match(tasks, /className="task-attachment-link"/);
  assertCode.doesNotMatch(tasks, /function TaskFilePreview/);
  assertCode.doesNotMatch(tasks, /className="task-media-thumb"/);
  assertCode.match(css, /\.task-attachment-link/);
});

test("permite selecionar e acumular vários arquivos", async () => {
  const [tasks, suggestions, hr] = await Promise.all([
    readFile(new URL("../app/TasksModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/SuggestionsModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/HrManagementModule.tsx", import.meta.url), "utf8"),
  ]);
  assertCode.match(tasks, /mergeSelectedFiles/);
  assertCode.match(tasks, /multiple selectedFiles=\{files\}/);
  assertCode.match(suggestions, /multiple accept=/);
  assertCode.match(hr, /onSave:\(documents:HrDocument\[\]\)/);
  assertCode.match(hr, /Promise\.all\(files\.map/);
  assertCode.match(hr, /multiple selectedFiles=\{files\}/);
});

test("organiza múltiplos anexos, documentos de cancelamento e ID público", async () => {
  const [tasks, cancellations, journey, css] = await Promise.all([
    readFile(new URL("../app/TasksModule.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/CancellationsModule.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/CustomerSuccessJourneyModule.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(
    tasks,
    /task\.attachments\.length > 1 \? "multiple" : "single"/,
  );
  assertCode.match(
    css,
    /\.task-detail-overlay \.task-attachment-grid\.multiple/,
  );
  assertCode.match(cancellations, /attachments:Array/);
  assertCode.match(cancellations, /Documentos anexados/);
  assertCode.match(cancellations, /requesterPhone:string/);
  assertCode.match(cancellations, /Telefone do responsável pela solicitação/);
  assertCode.match(cancellations, /Telefone da solicitação/);
  assertCode.match(cancellations, /workspaceFileUrl/);
  assertCode.match(cancellations, /typeof globalThis\.crypto\?\.randomUUID/);
  assertCode.doesNotMatch(
    cancellations,
    /id:crypto\.randomUUID\(\),name:file\.name/,
  );
  assertCode.match(cancellations, /Não foi possível salvar os documentos/);
  assertCode.match(cancellations, /publicCustomerId/);
  assertCode.match(cancellations, /pattern="\\d\{6\}"/);
  assertCode.doesNotMatch(cancellations, /setClientId\(id\)/);
  assertCode.match(journey, /publicCustomerId\(customer\)/);
  assertCode.match(tasks, /publicCustomerCode\(customer\)/);
});

test("configura clientes, vincula redes e consolida comentários por ID", async () => {
  const [app, domain, contracts, service, migration, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Domain/Entities.cs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Application/Contracts.cs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Infrastructure/OperationsService.cs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Infrastructure/Migrations/20261006120000_CustomerStrategicNetwork.cs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(app, /Configurar opções do cadastro de clientes/);
  assertCode.match(app, /const CUSTOMER_CATALOGS/);
  assertCode.match(app, /scope="customers"/);
  assertCode.match(app, /name="strategicNetworkId"/);
  assertCode.match(
    app,
    /Cliente estratégico vinculado à rede \{linkedNetwork\.title\}/,
  );
  assertCode.match(app, /label: "Comentários"/);
  assertCode.match(app, /label: "Alerta"/);
  assertCode.match(app, /structuredClientEvolutions/);
  assertCode.match(app, /Comentário registrado na evolução do cliente/);
  assertCode.match(domain, /Guid\? StrategicNetworkId/);
  assertCode.match(contracts, /strategic_network_id/);
  assertCode.match(service, /Selecione a rede da conta estratégica/);
  assertCode.match(migration, /FK_customers_work_items_StrategicNetworkId/);
  assertCode.match(css, /\.client-comment-timeline/);
});

test("centraliza alertas e checklists e retoma clientes pelo CRM Retenção", async () => {
  const [app, actions, enhancer, journey, serviceModule, backend, css] =
    await Promise.all([
      readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/ClientEngagementActions.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/ReminderAction.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/CustomerSuccessJourneyModule.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/ServiceRecordsModule.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../backend/src/Dontus.Operations.Infrastructure/OperationsService.cs",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ]);
  assertCode.match(enhancer, /CLIENT_ALERT_EVENT/);
  assertCode.match(enhancer, /CLIENT_CHECKLIST_EVENT/);
  assertCode.match(enhancer, /client-alert-detail-action/);
  assertCode.match(enhancer, /client-checklist-detail-action/);
  assertCode.match(enhancer, /checklistDisplayOnly/);
  assertCode.match(actions, /recordType: "Alerta do cliente"/);
  assertCode.match(actions, /recordType: "Checklist vinculado"/);
  assertCode.match(actions, /resolveContextCustomer/);
  assertCode.match(actions, /sourceCustomerIdentity/);
  assertCode.match(actions, /sharedTemplates/);
  assertCode.match(actions, /customerId: customer\.id \|\| null/);
  assertCode.match(actions, /createPortal/);
  assertCode.match(actions, /client-checklist-card-slot/);
  assertCode.match(actions, /client-checklist-picker/);
  assertCode.match(actions, /client-checklist-card-field/);
  assertCode.match(actions, /client-checklist-native-host/);
  assertCode.match(actions, /Vincular checklist ao card/);
  assertCode.match(actions, /setShowComposer\(false\)/);
  assertCode.match(actions, /void add\(selected\)/);
  assertCode.match(actions, /Checklist finalizado/);
  assertCode.match(actions, /Ocultar itens marcados/);
  assertCode.match(actions, /Mostrar itens marcados/);
  assertCode.match(actions, /linked-checklist-progress/);
  assertCode.match(actions, /className=\{entry\.checked \? "checked"/);
  assertCode.match(app, /label: "Checklists"/);
  assertCode.match(app, /commercialChecklist/);
  assertCode.match(app, /retentionChecklist/);
  assertCode.match(app, /\["csFeatureActive", "Configuração de features"\]/);
  assertCode.match(app, /\["csWorkflowStatus", "Status da jornada"\]/);
  assertCode.match(app, /\["csActivationChecklist", "Checklist · Ativação"\]/);
  const csCatalogs =
    app.match(/const CS_CATALOGS = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
  assertCode.doesNotMatch(csCatalogs, /csFeatureBase|csFeaturePlus/);
  assertCode.match(
    app,
    /catalog === "csFeatureActive" && \["csFeature", "csFeatureBase", "csFeaturePlus"\]\.includes\(item\.catalog\)/,
  );
  assertCode.match(app, /enterpriseChecklist/);
  assertCode.match(app, /serviceChecklist/);
  assertCode.match(app, /cancellationChecklist/);
  assertCode.match(app, /Retomado pelo CRM Retenção/);
  assertCode.match(app, /sourceJourneyId/);
  assertCode.match(journey, /Retomar card no CRM Retenção/);
  assertCode.match(journey, /Cliente no CRM Retenção/);
  assertCode.match(serviceModule, /data-reminder-entity-id=\{item\.id\}/);
  assertCode.match(backend, /CanEditCustomerEngagement/);
  assertCode.match(backend, /CanRestartRetentionJourney/);
  assertCode.match(css, /\.client-alert-list/);
  assertCode.match(css, /\.linked-checklist-card/);
  assertCode.match(css, /\.client-engagement-backdrop\{z-index:35000/);
  assertCode.match(css, /@keyframes usageLineDraw/);
  assertCode.match(css, /\.cs-pipeline-tabs/);
});

test("mantém checklist estável e sincroniza cancelamentos com acompanhamentos e comissões", async () => {
  const [actions, cancellations, commissions, journey, enhancer, css] =
    await Promise.all([
      readFile(
        new URL("../app/ClientEngagementActions.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/CancellationsModule.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/CommissionsModule.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/CustomerSuccessJourneyModule.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/ReminderAction.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ]);
  assertCode.doesNotMatch(actions, /scrollIntoView/);
  assertCode.doesNotMatch(actions, /select autoFocus/);
  assertCode.match(actions, /onCloseRef/);
  assertCode.match(cancellations, /sendLinkedJourneysToConference/);
  assertCode.match(
    cancellations,
    /journey\.track==="activation"\|\|journey\.track==="retention"/,
  );
  assertCode.match(
    cancellations,
    /phase:"conference",status:"Não convertido pelo Comercial · aguardando conferência"/,
  );
  assertCode.match(cancellations, /restoreLinkedJourneys/);
  assertCode.match(journey, /phase:\s*"cancelled",\s*status:\s*"Cancelado"/);
  assertCode.match(commissions, /Cancelado · disponível para reprovação/);
  assertCode.match(commissions, /busy\|\|cancelled/);
  assertCode.match(journey, /className="cs-card-labels"/);
  assertCode.doesNotMatch(enhancer, /classList\.add\("centered"\)/);
  assertCode.match(
    css,
    /\.cancellation-drawer>header\{display:flex;flex-wrap:wrap/,
  );
  assertCode.match(css, /\.commission-row\.cancelled/);
});

test("mantém ficha, lembretes, desenvolvimento e indicadores integrados", async () => {
  const [app, reminders, enhancer, development, journeys, compose, css] =
    await Promise.all([
      readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/RemindersModule.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/ReminderAction.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/DevelopmentModule.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/OperationalJourneyModules.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../docker-compose.yml", import.meta.url), "utf8"),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ]);
  assertCode.match(enhancer, /CLIENT_RECORD_EVENT/);
  assertCode.match(enhancer, /Ficha do cliente/);
  assertCode.match(enhancer, /Ficha da rede/);
  assertCode.match(app, /Retomar cliente/);
  assertCode.match(app, /label: "Acompanhamentos"/);
  assertCode.match(app, /EmployeeIndicatorsAdmin/);
  assertCode.match(app, /DADOS DA GESTÃO RH/);
  assertCode.match(app, /onSection\("employeeIndicators"\)/);
  assertCode.match(app, /className="form-grid employee-form"/);
  assertCode.match(
    app,
    /userCan\(data\.user, "catalogs", "manage"\) \|\| userCan\(data\.user, "tasks", "manage"\)/,
  );
  assertCode.match(reminders, /confirmedAt/);
  assertCode.match(reminders, /60 minutos/);
  assertCode.match(reminders, /ReminderDetailModal/);
  assertCode.match(development, /DevelopmentTriageCompletePortal/);
  assertCode.match(development, /searchParams\.delete\("subtask"\)/);
  assertCode.match(journeys, /<div className="journey-board">/);
  assertCode.match(compose, /TZ: America\/Sao_Paulo/);
  assertCode.match(css, /\.client-engagement-backdrop\.embedded-checklist/);
  assertCode.match(css, /\.employee-indicator-kpis/);
  assertCode.match(css, /\.client-checklist-card-slot/);
  assertCode.match(css, /\.client-checklist-native-host/);
  assertCode.match(css, /position:static!important/);
  assertCode.match(css, /\.client-checklist-picker/);
  assertCode.match(css, /\.client-checklist-card-field/);
  assertCode.match(css, /\.linked-checklist-actions/);
  assertCode.match(css, /\.linked-checklist-progress/);
  assertCode.match(css, /\.employee-modal/);
});

test("integra chamados públicos, competência mensal e rolagem do chat", async () => {
  const [app, requests, chat, api, screens, compose, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/ServiceRequestsModule.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/InternalChatModule.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Api/Program.cs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Domain/ScreenCatalog.cs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../docker-compose.yml", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(app, /label: "Chamados"/);
  assertCode.match(app, /label: "Acompanhamento de chamados"/);
  assertCode.match(app, /topbar-month-filter/);
  assertCode.doesNotMatch(app, /Competência do Kanban/);
  assertCode.match(app, /brasiliaMonthKey/);
  assertCode.match(app, /label: "Chamados", count: serviceRequests\.length/);
  assertCode.match(requests, /TRIAGE_STAGES/);
  assertCode.match(
    requests,
    /Dúvida sobre o sistema.*Tarefa.*Reclamação.*Sugestão.*Bug.*Cancelamento.*Nova contratação/s,
  );
  assertCode.match(requests, /PublicServiceRequestPage/);
  assertCode.match(
    requests,
    /Imagens ou arquivos <small>\(opcional\)<\/small>/,
  );
  assertCode.match(requests, /<input type="file" multiple/);
  assertCode.doesNotMatch(requests, /required=\{files\.length===0\}/);
  assertCode.match(api, /MapPost\("\/api\/public-service-requests"/);
  assertCode.match(api, /X-API-Key/);
  assertCode.match(api, /customerMatched = customer is not null/);
  assertCode.match(api, /maximum = 5/);
  assertCode.match(api, /form\["companyName"\]/);
  assertCode.match(api, /form\.Files\.Count > 5/);
  assertCode.doesNotMatch(api, /form\.Files\.Count is < 1 or > 5/);
  assertCode.match(api, /files = new \{ field = "files", required = false/);
  assertCode.doesNotMatch(api, /requiredFields = new\[\] \{[^}]*"files"/);
  assertCode.match(screens, /serviceRequests/);
  assertCode.match(screens, /serviceFollowup/);
  assertCode.match(compose, /PUBLIC_SERVICE_REQUESTS_API_KEY/);
  assertCode.match(chat, /messagesRef/);
  assertCode.match(chat, /messages\.scrollTo/);
  assertCode.match(css, /\.enterprise-detail-shell>\.drawer-head/);
  assertCode.match(css, /\.public-service-request-page/);
  assertCode.match(css, /\.external-experience-page/);
  assertCode.match(css, /\.public-request-type:has\(input:checked\)/);
});

test("integra campanhas de marketing com qualificação e indicadores do CRM", async () => {
  const [marketing, app, indicators, workflow, css, traffic] =
    await Promise.all([
      readFile(
        new URL("../app/MarketingWorkspaceModule.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/CommercialAnalyticsBoard.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../backend/src/Dontus.Operations.Domain/WorkflowPolicy.cs",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(
        new URL("../app/CommercialTrafficIndicators.tsx", import.meta.url),
        "utf8",
      ),
    ]);
  assertCode.match(marketing, /kind:"marketingCampaign"/);
  assertCode.match(marketing, /"Planejada","Em desenvolvimento","Publicada"/);
  assertCode.match(marketing, /Indicadores de campanhas/);
  assertCode.match(marketing, /Nova campanha/);
  assertCode.match(marketing, /sem limite de tamanho no sistema/);
  assertCode.match(app, /marketingCampaigns=\{data\.items\.filter/);
  assertCode.match(app, /leadQualification/);
  assertCode.match(app, /Link do post/);
  assertCode.match(app, /Selecionar campanha publicada/);
  assertCode.match(
    indicators,
    /CommercialTrafficIndicators entries=\{traffic\}/,
  );
  assertCode.match(traffic, /Leads por campanha/);
  assertCode.match(traffic, /Receita por campanha/);
  assertCode.match(workflow, /"Planejada", "Em desenvolvimento", "Publicada"/);
  assertCode.match(css, /\.campaign-kanban/);
  assertCode.match(css, /\.commercial-campaign-fields/);
});

test("vendas diretas identificam o cliente sem qualificação e preservam metas e navegação", async () => {
  const [app, indicators, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/OperationIndicatorsBoard.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(app, /type DirectSale = \{[\s\S]*clientId\?: string/);
  const directSaleModal = app.slice(
    app.indexOf("function DirectSaleModal("),
    app.indexOf("function CommercialLeadCard("),
  );
  assertCode.doesNotMatch(
    directSaleModal,
    /Qualificação do lead|leadQualification/,
  );
  assertCode.match(directSaleModal, /ID do cliente/);
  assertCode.match(app, /directSaleFollowup\(detail, sourceId/);
  assertCode.match(app, /openFunctionSettings/);
  assertCode.match(app, /ConfigurationReturnBar/);
  assertCode.match(app, /Voltar para \{label\}/);
  assertCode.match(indicators, /function GoalsIndicatorsBoard/);
  assertCode.match(indicators, /Metas ativas/);
  assertCode.match(indicators, /Alcance por setor/);
  assertCode.match(indicators, /Acompanhar metas/);
  assertCode.match(indicators, /Margem de alcance/);
  assertCode.match(css, /\.configuration-return-bar/);
  assertCode.match(css, /\.goals-bi-tracking/);
});

test("permite temas claro e escuro no painel público em tempo real", async () => {
  const [overview, css] = await Promise.all([
    readFile(
      new URL("../app/PublicOperationsOverview.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(overview, /Dontus BI em tempo real/);
  assertCode.match(overview, /Tema do BI público/);
  assertCode.match(css, /public-bi-light\{color-scheme:light/);
  assertCode.match(overview, /public-talent-radar/);
  assertCode.match(
    css,
    /Painel público em tempo real: command center escuro e uniforme/,
  );
  assertCode.match(
    css,
    /\.public-ops-page\.public-bi-page:not\(\.public-bi-light\)\{/,
  );
  assertCode.match(css, /--public-surface:#0d1a28/);
  assertCode.match(
    css,
    /\.public-ops-page\.public-bi-page:not\(\.public-bi-light\) \.public-talent-radar section/,
  );
  assertCode.match(css, /background:linear-gradient\(145deg,#142a3f,#0d1c2b\)/);
});

test("finaliza a conferência em quatro destinos e notifica o responsável", async () => {
  const [journey, css] = await Promise.all([
    readFile(
      new URL("../app/CustomerSuccessJourneyModule.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(
    journey,
    /moveFromConference\("tracking", "Em acompanhamento"\)/,
  );
  assertCode.match(journey, /moveFromConference\("finished", "Finalizado"\)/);
  assertCode.match(journey, /moveFromConference\("cancelled", "Cancelado"\)/);
  assertCode.match(
    journey,
    /moveFromConference\("cancelledWithoutTraining", "Cancelado sem treinamento"\)/,
  );
  assertCode.match(journey, /action: "saveNotice"/);
  assertCode.match(journey, /Cliente marcado como CANCELADO/);
  assertCode.match(css, /\.cs-conference-actions/);
  assertCode.match(css, /\.warning-button/);
});

test("mantém acompanhamentos perenes e corrige modais, permissões e reabertura", async () => {
  const [app, cancellations, development, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/CancellationsModule.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/DevelopmentModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(
    app,
    /const kanbanModules = new Set<ModuleKey>\(\["commercial", "cancellations", "marketing"/,
  );
  // [^\]]* keeps the search inside the array, now that line breaks are ignored.
  assertCode.doesNotMatch(
    app,
    /kanbanModules = new Set<ModuleKey>\(\[[^\]]*"cs"/,
  );
  assertCode.doesNotMatch(
    app,
    /kanbanModules = new Set<ModuleKey>\(\[[^\]]*"lia"/,
  );
  assertCode.doesNotMatch(
    app,
    /kanbanModules = new Set<ModuleKey>\(\[[^\]]*"hr"/,
  );
  assertCode.match(app, /if \(screen === "catalogs"\)/);
  assertCode.match(app, /taskPermission\?\.canManage === true/);
  assertCode.match(app, /client-cancelled-status/);
  assertCode.match(cancellations, /searchParams\.delete\("cancellation"\)/);
  assertCode.match(development, /className="modal development-create-modal"/);
  assertCode.match(development, /className="form-grid"/);
  assertCode.match(
    css,
    /\.cs-pipeline-metrics\{grid-template-columns:repeat\(7/,
  );
});

test("configura a IA dos chamados com segredo criptografado e contingência local", async () => {
  const [requests, api, entities, context, route, css] = await Promise.all([
    readFile(
      new URL("../app/ServiceRequestsModule.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Api/Program.cs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Domain/Entities.cs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Infrastructure/OperationsDbContext.cs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/service-request-ai-settings/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(requests, /Configurar IA/);
  assertCode.match(requests, /ServiceRequestAiSettingsModal/);
  assertCode.match(requests, /Testar integração/);
  assertCode.match(api, /Dontus\.ServiceRequests\.AiCredentials\.v1/);
  assertCode.match(api, /ClassifyServiceRequestAsync/);
  assertCode.match(api, /local-fallback/);
  assertCode.match(api, /service-request-ai-settings\/test/);
  assertCode.match(entities, /class ServiceRequestAiSetting/);
  assertCode.match(context, /ServiceRequestAiSettings/);
  assertCode.match(route, /api\/service-request-ai-settings/);
  assertCode.match(css, /\.service-request-ai-modal/);
});

test("separa o acesso às agendas, preserva o rodapé dos modais e usa o ID público nos atendimentos", async () => {
  const [app, services, access, agenda, entities, context, css] =
    await Promise.all([
      readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/ServiceRecordsModule.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../backend/src/Dontus.Operations.Infrastructure/AccessControlService.cs",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../backend/src/Dontus.Operations.Infrastructure/AgendaService.cs",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../backend/src/Dontus.Operations.Domain/AgendaEntities.cs",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../backend/src/Dontus.Operations.Infrastructure/OperationsDbContext.cs",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ]);
  assertCode.match(app, /agendaDepartmentIds/);
  assertCode.match(app, /Acesso às agendas/);
  assertCode.match(
    app,
    /O setor do cadastro não libera acesso automaticamente/,
  );
  assertCode.match(services, /publicCustomerCode\(customer\)/);
  assertCode.match(services, /pattern="\\d\{6\}"/);
  assertCode.doesNotMatch(services, /clientCode: customer\.id\.slice/);
  assertCode.match(access, /ValidateAgendaCalendarAccessesAsync/);
  assertCode.match(agenda, /AccessibleAgendaCalendarIdsAsync/);
  assertCode.match(entities, /class UserAgendaCalendarAccess/);
  assertCode.match(context, /UserAgendaCalendarAccesses/);
  assertCode.match(css, /proteção global contra corte no final dos modais/);
  assertCode.match(css, /scroll-padding-bottom:88px/);
});

test("organiza reservas da sala e restringe a criação aos coordenadores", async () => {
  const [portal, agenda, service, css] = await Promise.all([
    readFile(new URL("../app/PortalDontus.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/AgendaModule.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Infrastructure/AgendaService.cs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(portal, /const canReserveRoom=data\.user\.isCoordinator/);
  assertCode.match(portal, /portal-room-overview/);
  assertCode.match(portal, /Somente colaboradores marcados como coordenadores/);
  assertCode.match(agenda, /showMeetingRoomCommitments/);
  assertCode.match(
    agenda,
    /filtered\.filter\(\(entry\) => !isMeetingRoomCommitment/,
  );
  assertCode.match(agenda, /Sala de reunião/);
  assertCode.match(agenda, /calendarCommitmentTitle/);
  assertCode.match(agenda, /"🏢 "/);
  assertCode.match(service, /EnsureMeetingRoomReservationAllowed/);
  assertCode.match(
    service,
    /Somente colaboradores marcados como coordenadores podem reservar a sala de reunião/,
  );
  assertCode.match(css, /\.portal-room-overview/);
  assertCode.match(css, /\.agenda-room-visibility/);
  assertCode.match(css, /\.agenda-filter-controls/);
});

test("sincroniza etapas das versões", async () => {
  const development = await readFile(
    new URL("../app/DevelopmentModule.tsx", import.meta.url),
    "utf8",
  );
  assertCode.match(
    development,
    /const versionKanbanStage = \(detail: DevelopmentData\) => detail\.processStage/,
  );
  assertCode.match(development, /onClick=\{openEditor\}/);
  assertCode.match(
    development,
    /ref=\{editSectionRef\} className="development-actions"/,
  );
  assertCode.match(
    development,
    /processStage:"Em validação", versionName:selectedVersion/,
  );
});

test("calcula score por features e vincula clientes a redes", async () => {
  const [journey, app, enhancer] = await Promise.all([
    readFile(
      new URL("../app/CustomerSuccessJourneyModule.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CardLinkEnhancer.tsx", import.meta.url), "utf8"),
  ]);
  assertCode.match(journey, /catalogFeatureIsBase/);
  assert.equal(
    customerSuccessScore({
      featuresBase: ["Agenda"],
      featuresActive: ["Agenda"],
      featuresPlus: ["Financeiro"],
    }),
    200,
  );
  assertCode.match(journey, /scoreEvolution/);
  assertCode.match(journey, /As seleções são salvas automaticamente/);
  assertCode.doesNotMatch(journey, /> Salvar evolução<\/button>/);
  assertCode.match(app, /saveStrategicNetwork/);
  assertCode.match(app, /strategicNetworkId/);
  assertCode.match(app, /title="Visualizar dados da unidade"/);
  assertCode.match(app, /const openUnitJourney = async/);
  assertCode.match(app, /Abrir acompanhamento sem sair de Contas estratégicas/);
  assertCode.match(
    app,
    /openedJourney && openedJourneyDetail && unit && \(?<JourneyDrawer/,
  );
  assertCode.doesNotMatch(app, /window\.location\.assign\(url\.toString\(\)\)/);
  assertCode.match(
    await readFile(new URL("../app/detail-header.ts", import.meta.url), "utf8"),
    /commercial-copy-link/,
  );
});

test("integra redes, acesso total, alertas por ID e notificações persistentes", async () => {
  const [app, actions, notices, contracts, access] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/ClientEngagementActions.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/NoticesModule.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Application/AccessContracts.cs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../backend/src/Dontus.Operations.Infrastructure/AccessControlService.cs",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assertCode.match(app, /Redes e franquias/);
  assertCode.match(app, /function NetworkCustomerRecord/);
  assertCode.match(
    app,
    /network\?\.id \|\| clientRecordQuery\(context, data\?\.items \?\? \[\]\)/,
  );
  assertCode.match(app, /networkRecord && networkDetail/);
  assertCode.match(app, /network-customer-record-page/);
  assertCode.match(
    app,
    /Cadastro sincronizado automaticamente com Contas Estratégicas/,
  );
  assertCode.match(app, /Acesso total ao sistema/);
  assertCode.match(app, /fullAccess/);
  assertCode.match(app, /dontus:snoozed-notices/);
  assertCode.match(app, /Date\.now\(\) \+ 60 \* 60_000/);
  assertCode.match(app, /buildNotifications/);
  assertCode.match(app, /entry\.targetUrl/);
  assertCode.match(
    app,
    /onAuthenticated=\{\(\) => window\.location\.replace\("\/"\)\}/,
  );
  assertCode.match(actions, /ID do cliente<input/);
  assertCode.match(actions, /customer\?\.id \|\| null/);
  assertCode.match(actions, /pattern="\[0-9\]\{6\}"/);
  assertCode.match(actions, /Nome do cliente/);
  assertCode.match(notices, /Ver depois/);
  assertCode.match(contracts, /bool FullAccess = false/);
  assertCode.match(
    access,
    /group\.Name == AdministratorsGroup && group\.Active/,
  );
  assertCode.match(access, /existing\.CanManage = true/);
});

test("arquiva versões liberadas por competência e unifica kanbans, portal e cores persistentes", async () => {
  const [app, development, portal, tasks, suggestions, css] = await Promise.all(
    [
      readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/DevelopmentModule.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/PortalDontus.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/TasksModule.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/SuggestionsModule.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ],
  );
  assertCode.match(
    app,
    /release\.kind === "developmentRelease" && release\.status !== "Liberada"/,
  );
  assertCode.match(app, /item\.record_type === "Configuração de Kanban"/);
  assertCode.match(app, /useState<"board" \| "list">\("board"\)/);
  assertCode.match(app, /useState<"list" \| "kanban">\("kanban"\)/);
  assertCode.match(app, /dontus\.agenda-visual/);
  assertCode.match(app, /Azul-marinho/);
  assertCode.match(app, /Verde-lima/);
  assertCode.match(development, /useState<"list" \| "kanban">\("kanban"\)/);
  assertCode.match(development, /<option>Liberada<\/option>/);
  assertCode.match(tasks, /useState<"kanban" \| "list">\("kanban"\)/);
  assertCode.match(suggestions, /useState<"list" \| "kanban">\("kanban"\)/);
  assertCode.match(portal, /portal-version-feature/);
  assertCode.match(portal, /portal-feature-summary-modal/);
  assertCode.match(portal, /\["Liberada","Em produção"\]/);
  assertCode.match(css, /Kanbans: colunas translúcidas/);
  assertCode.match(css, /\.service-request-column/);
  assertCode.match(css, /\.standard-kanban-column/);
  assertCode.match(css, /\.app-shell\.theme-light \.sidebar \.brand/);
  assertCode.match(
    css,
    /\.app-shell\.theme-dark \.sidebar \.brand img\{filter:brightness\(0\) invert\(1\)\}/,
  );
  assertCode.match(css, /system-accent-fuchsia/);
});

test("padroniza copiar link, posiciona checklist no corpo e prioriza modais de ação", async () => {
  const [links, enhancer, actions, agenda, tasks, css] = await Promise.all([
    readFile(new URL("../app/CardLinkEnhancer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ReminderAction.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/ClientEngagementActions.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/AgendaModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/TasksModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(links, /card-copy-link card-detail-copy/);
  assertCode.match(links, /<svg aria-hidden="true"/);
  assertCode.match(links, /insertBefore\(button, closeButton\)/);
  assertCode.match(enhancer, /copy\.innerHTML = '<svg/);
  assertCode.match(tasks, /copy-task-link card-copy-link/);
  assertCode.match(actions, /\.retention-detail-grid>main/);
  assertCode.match(actions, /\.commercial-lead-drawer-content/);
  assertCode.match(actions, /\.journey-drawer-body/);
  assertCode.match(actions, /\.cancellation-history/);
  assertCode.match(
    actions,
    /contentHost\.insertBefore\(portalHost, directAnchor \|\| fallbackAnchor \|\| null\)/,
  );
  assertCode.match(agenda, /action-modal-backdrop agenda-action-backdrop/);
  assertCode.match(css, /\.card-copy-link\{position:static!important/);
  assertCode.match(
    css,
    /\.action-modal-backdrop,.agenda-action-backdrop\{z-index:42000!important/,
  );
  assertCode.match(
    css,
    /\.reminder-alert-backdrop,.notice-attention-backdrop,.confirmation-backdrop\{z-index:50000!important/,
  );
});

test("alinha ações dos cards e conta somente tarefas abertas do responsável", async () => {
  const [app, tasks, links, css] = await Promise.all([
    readFile(new URL("../app/OperationsApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/TasksModule.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CardLinkEnhancer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assertCode.match(
    app,
    /const assignedOpenTaskCount = data\.taskModule\?\.tasks\.filter/,
  );
  assertCode.match(
    app,
    /assignedToCurrentUser && !task\.completedAt && !task\.cancelled && !finalTaskStatusIds\.has\(task\.statusId\)/,
  );
  assertCode.match(app, /module === "tasks" && assignedOpenTaskCount > 0/);
  assertCode.match(app, /const taskNotificationUnread =/);
  assertCode.match(
    app,
    /totalUnread = internalChatUnread \+ taskNotificationUnread/,
  );
  assertCode.match(
    tasks,
    /!onlyMine \|\| \(currentCollaborator \? task\.assigneeUserId === currentCollaborator\.id : task\.assigneeName === user\.displayName\)/,
  );
  assertCode.match(links, /const actionHost = header\.querySelector/);
  assertCode.match(links, /actionHost\.insertBefore\(button, closeButton\)/);
  assertCode.match(
    css,
    /\.card-copy-link\{position:static!important;display:inline-flex!important;flex:0 0 auto;align-self:center/,
  );
  assertCode.match(
    css,
    /\.task-detail-overlay \.task-overlay-header-actions>:is\(button,\.task-header-status,\.task-client-state\)/,
  );
});
