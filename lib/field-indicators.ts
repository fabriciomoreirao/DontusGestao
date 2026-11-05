export type IndicatorRecord = { id: string; module?: string; record_type: string; owner: string; team: string; status: string; priority?: string; amount_cents: number; description?: string; created_at: string; updated_at: string; due_at?: string | null; sla_due_at?: string | null };
export type IndicatorField = { key: string; label: string };
export type IndicatorFilter = { field: string; value: string };
export const NOT_FILLED = "Não informado";
const labels: Record<string, string> = {
  seller: "Vendedor", sellerName: "Vendedor", csOwner: "Responsável CS", reversalOwner: "Responsável pela reversão", creatorName: "Criador", approverName: "Aprovador", sourceDepartment: "Setor de origem",
  stage: "Etapa", phase: "Fase", status: "Status informado", priority: "Prioridade informada", severity: "Severidade", sector: "Setor informado", department: "Departamento", type: "Tipo", selectedType: "Tipo de solicitação", requestType: "Tipo de solicitação", classification: "Classificação", aiClassification: "Classificação da triagem",
  version: "Versão", productVersion: "Versão do produto", plan: "Plano", product: "Produto", source: "Origem", origin: "Origem", channel: "Canal", acquisitionChannel: "Canal de aquisição", funnel: "Funil", temperature: "Temperatura", labels: "Etiquetas", tags: "Marcadores", region: "Região", state: "Estado", city: "Cidade", campaignName: "Campanha",
  usage: "Utilização do cliente", usageStatus: "Situação da utilização", usagePercent: "Percentual de utilização", usageScore: "Score de utilização", healthScore: "Saúde do cliente", score: "Score", retentionStatus: "Status da retenção", retentionMarks: "Utilização e marcadores de retenção", qualification: "Qualificação", leadQualification: "Qualificação do lead", callStatus: "Status do contato", outcome: "Resultado", cancellationOutcome: "Resultado do cancelamento",
  reason: "Motivo", cancellationReason: "Motivo de cancelamento", rejectionReason: "Motivo da reprovação", lossReason: "Motivo de perda", stayRange: "Faixa de permanência", featuresBase: "Features contratadas", featuresActive: "Features em uso", featuresPlus: "Features adicionais", features: "Funcionalidades", category: "Categoria", decision: "Decisão", scope: "Área", metric: "Indicador da meta", active: "Ativo", strategicClient: "Cliente estratégico", cancellationRisk: "Risco de cancelamento", cancelled: "Cancelada", cancellationRequest: "Solicitação de cancelamento", commerciallyApproved: "Aprovação comercial", clientNotificationState: "Comunicação com o cliente", slaPolicyName: "Política de SLA", slaState: "Situação do SLA", recurrence: "Recorrência", communicationType: "Tipo de comunicação", attendanceType: "Tipo de atendimento", serviceType: "Tipo de atendimento", supportType: "Tipo de suporte", queueMode: "Tipo de fila", position: "Cargo", jobTitle: "Cargo", workModel: "Modelo de trabalho", contractType: "Tipo de contrato", paymentMethod: "Forma de pagamento", trainingStatus: "Status do treinamento", onboardingStatus: "Status do onboarding", finalStatus: "Status final",
};
const translated: Record<string, string> = { true: "Sim", false: "Não", qualified: "Qualificado", "not-qualified": "Não qualificado", disqualified: "Desqualificado", tracking: "Em acompanhamento", validation: "Validação", onboarding: "Onboarding", conference: "Conferência", closed: "Encerrado", pending: "Pendente", approved: "Aprovado", rejected: "Reprovado", requested: "Solicitado", cancelled: "Cancelado", reverted: "Revertido", success: "Sucesso", failure: "Sem sucesso", active: "Ativo", inactive: "Inativo", overdue: "Vencido", breached: "Violado", onTime: "No prazo", warning: "Em alerta", paused: "Pausado", completed: "Concluído" };
const detailCache = new WeakMap<IndicatorRecord, { raw: string | undefined; detail: Record<string, unknown> }>();
export function indicatorDetail(item: IndicatorRecord): Record<string, unknown> {
  const cached = detailCache.get(item); if (cached && cached.raw === item.description) return cached.detail;
  let detail: Record<string, unknown> = {};
  try { const value = JSON.parse(item.description || "{}"); if (value && typeof value === "object" && !Array.isArray(value)) detail = value; } catch { /* Legacy plain text has no structured fields. */ }
  detailCache.set(item, { raw: item.description, detail }); return detail;
}
function values(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.flatMap(entry => typeof entry === "object" && entry ? values((entry as Record<string, unknown>).name ?? (entry as Record<string, unknown>).product ?? (entry as Record<string, unknown>).label) : values(entry)))];
  if (value === null || value === undefined || value === "" || typeof value === "object") return [];
  const text = typeof value === "number" ? value.toLocaleString("pt-BR") : String(value).trim();
  return text ? [translated[text] || text] : [];
}
export function indicatorFields(records: IndicatorRecord[]): IndicatorField[] {
  const base = [{ key: "status", label: "Status / etapa" }, { key: "owner", label: "Responsável" }, { key: "team", label: "Setor" }, { key: "record_type", label: "Tipo de registro" }];
  if (new Set(records.map(item => item.module).filter(Boolean)).size > 1) base.push({ key: "module", label: "Funcionalidade" });
  if (records.some(item => item.priority)) base.push({ key: "priority", label: "Prioridade" });
  if (records.some(item => item.sla_due_at || indicatorDetail(item).slaState)) base.push({ key: "sla", label: "Situação do SLA" });
  const keys = new Set(records.flatMap(item => Object.keys(indicatorDetail(item))));
  for (const key of Object.keys(labels)) if (key !== "slaState" && keys.has(key) && records.some(item => values(indicatorDetail(item)[key]).length)) base.push({ key: `detail.${key}`, label: labels[key] });
  if (records.some(item => Array.isArray(indicatorDetail(item).products))) { base.push({ key: "products.product", label: "Produto contratado" }, { key: "products.plan", label: "Plano contratado" }); }
  return base;
}
export function indicatorValues(item: IndicatorRecord, key: string, now = Date.now()): string[] {
  const detail = indicatorDetail(item);
  let result: string[];
  if (key === "sla") {
    result = values(detail.slaState);
    if (!result.length) result = item.sla_due_at ? [Date.parse(item.sla_due_at) < now ? "Vencido" : "No prazo"] : [];
  } else if (key.startsWith("detail.")) result = values(detail[key.slice(7)]);
  else if (key.startsWith("products.")) result = Array.isArray(detail.products) ? [...new Set(detail.products.flatMap(product => values(product?.[key.slice(9)])))] : [];
  else if (key === "status") result = values(detail.stage || detail.status || item.status);
  else if (key === "module") result = values(({ tasks: "Tarefas", commercial: "Comercial", cs: "Sucesso do Cliente", cancellations: "Cancelamentos", support: "Atendimentos", lia: "LIA", work: "Agenda", diary: "Diário de Bordo", referrals: "Indicações", marketing: "Marketing", ti: "Desenvolvimento", commissions: "Comissões", goals: "Metas", suggestions: "Sugestões", access: "Acessos", customers: "Clientes", hr: "Gestão RH", finance: "Financeiro", admin: "Administração", serviceRequests: "Chamados", serviceFollowup: "Acompanhamento de chamados", waitingQueue: "Fila de espera" } as Record<string, string>)[item.module || ""] || item.module);
  else result = values(item[key as keyof IndicatorRecord]);
  return result.length ? result : [NOT_FILLED];
}
export function matchesIndicatorFilters(item: IndicatorRecord, filters: IndicatorFilter[], now = Date.now()) {
  return filters.every(filter => !filter.value || indicatorValues(item, filter.field, now).includes(filter.value));
}
export function isOverdueIndicatorRecord(item: IndicatorRecord, now = Date.now()) {
  if (indicatorDetail(item).cancelled || /cancel/i.test(item.status)) return false;
  return indicatorValues(item, "sla", now).some(value => /vencid|overdue|atras|violad/i.test(value));
}
export function isCriticalIndicatorRecord(item: IndicatorRecord) {
  const severity = indicatorDetail(item).prioritySeverityOrder;
  if (typeof severity === "number") return severity >= 30;
  return /^(p0|p1|alta|urgente|critica|crítica)$/i.test(item.priority?.trim() || "");
}
export function groupIndicatorRecords(records: IndicatorRecord[], field: string, split = "", now = Date.now()) {
  const groups = new Map<string, { label: string; count: number; amountCents: number }>();
  for (const item of records) {
    const categories = indicatorValues(item, field, now).flatMap(first => split ? indicatorValues(item, split, now).map(second => `${first} · ${second}`) : [first]);
    for (const label of new Set(categories)) { const group = groups.get(label) ?? { label, count: 0, amountCents: 0 }; group.count++; group.amountCents += item.amount_cents; groups.set(label, group); }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}
