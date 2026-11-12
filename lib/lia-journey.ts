export type LiaCatalog = { id: string; catalog: string; name: string; active: boolean; description?: string };
export type LiaStage = { key: string; label: string; statuses: readonly string[]; target: string };

export const LIA_STAGES: readonly LiaStage[] = [
  { key: "validation", label: "1. Validação", statuses: ["Validacao"], target: "Validacao" },
  { key: "onboarding", label: "2. Onboarding", statuses: ["AguardandoKickoff", "KickoffAgendado"], target: "AguardandoKickoff" },
  { key: "configuration", label: "3. Configuração inicial", statuses: ["ConfiguracaoInicial"], target: "ConfiguracaoInicial" },
  { key: "tests", label: "4. Testes do cliente", statuses: ["EmTesteCliente", "EmAjustes"], target: "EmTesteCliente" },
  { key: "release", label: "5. Liberação e Ativação CRC", statuses: ["AguardandoAprovacao", "GoLiveAgendado", "EmProducaoAssistida", "ImplantacaoPrincipalConcluida", "ConfigurandoCRC"], target: "AguardandoAprovacao" },
  { key: "finalFollowup", label: "6. Acompanhamento Final", statuses: ["AcompanhamentoFinal"], target: "AcompanhamentoFinal" },
  { key: "completed", label: "7. Concluídos", statuses: ["Concluida"], target: "Concluida" },
];

export function activeLiaStages(catalogs: LiaCatalog[]): LiaStage[] {
  const known = new Set(LIA_STAGES.flatMap(stage => [...stage.statuses]));
  const custom = catalogs.filter(entry => entry.active && entry.catalog === "liaWorkflowStage" && !known.has(entry.name));
  return [...LIA_STAGES, ...custom.filter((entry, index) => custom.findIndex(other => other.name === entry.name) === index)
    .map(entry => ({ key: `custom:${entry.id}`, label: entry.name, statuses: [entry.name], target: entry.name }))];
}

export function liaStageForStatus(status: string, stages: readonly LiaStage[] = LIA_STAGES): LiaStage {
  return stages.find(stage => stage.statuses.includes(status)) ?? stages[0];
}

export function liaContractedPlan(detail: { liaPlan?: string; products?: Array<{ product?: string; plan?: string }> }): string {
  const products = Array.isArray(detail.products) ? detail.products : [];
  return (typeof detail.liaPlan === "string" ? detail.liaPlan.trim() : "") || [...new Set(products.filter(entry => entry && /\blia\b/i.test(entry.product ?? "")).map(entry => typeof entry.plan === "string" ? entry.plan.trim() : "").filter(Boolean))].join(" + ");
}

export function liaPlanOptions(catalogs: LiaCatalog[]): string[] {
  return [...new Set(catalogs.filter(entry => entry.active).flatMap(entry => {
    if (entry.catalog === "liaPlan") return [entry.name];
    if (!/product/i.test(entry.catalog) || !/\blia\b/i.test(entry.name)) return [];
    try {
      const detail = JSON.parse(entry.description ?? "{}");
      return Array.isArray(detail?.plans) ? detail.plans.filter((plan: { active?: boolean; name?: string }) => plan.active !== false && plan.name?.trim()).map((plan: { name: string }) => plan.name.trim()) : [];
    } catch { return []; }
  }))];
}

export type LiaClientRow = { key: string; name: string; clientId: string; liaPlan: string; value: string; whatsapp: string; requestType: string; origin: string; owner: string; startDate: string };
export function liaClientRowError(row: LiaClientRow, existingIds: string[], today: string): string {
  if (!row.name.trim() || !row.liaPlan.trim() || !row.owner.trim() || !row.requestType.trim() || !row.origin.trim()) return "Preencha nome, plano, responsável, tipo de solicitação e origem.";
  if (!/^\d{6}$/.test(row.clientId)) return "Informe o ID do cliente com 6 números.";
  if (existingIds.includes(row.clientId)) return `O ID ${row.clientId} já está no acompanhamento LIA.`;
  const date = new Date(`${row.startDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.startDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== row.startDate || row.startDate > today) return "Informe uma data de início válida, até hoje.";
  if (!row.value.trim() || !Number.isFinite(Number(row.value)) || Number(row.value) < 0 || Number(row.value) > 1_000_000_000) return "Informe um valor válido para o cliente.";
  return "";
}

export function liaClientPayload(row: LiaClientRow, currentUser: string, completed: boolean, at: string, historyId: string) {
  return { action: "createWorkItem", module: "lia", recordType: "Projeto LIA", title: row.name.trim(), customerName: row.name.trim(),
    owner: row.owner, team: "LIA", status: completed ? "Concluida" : "Validacao", priority: "P3", amountCents: Math.round(Number(row.value) * 100),
    description: JSON.stringify({ kind: "liaJourney", clientId: row.clientId, liaPlan: row.liaPlan.trim(), whatsapp: row.whatsapp,
      requestType: row.requestType, sector: row.origin, startDate: row.startDate, ...(completed ? { importedCompleted: true } : {}),
      history: [{ id: historyId, text: completed ? "Cliente concluído importado para o Acompanhamento LIA." : "Cliente inserido manualmente para validação no Acompanhamento LIA.", at, author: currentUser }] }) };
}
