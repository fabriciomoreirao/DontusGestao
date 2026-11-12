import { commissionDate, normalizeCommissionName } from "./commission-rules.ts";
import { commercialIndicatorFlow } from "./commercial-indicators.ts";

type Source = { module: string; record_type: string; status: string; description: string; amount_cents: number; updated_at: string };
export function commercialCommissionSource(item: Source, catalogs: { catalog: string; name: string; description: string }[] = []) {
  let detail: Record<string, unknown> = {};
  try { const parsed = JSON.parse(item.description); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) detail = parsed; } catch { /* Legacy cards have plain descriptions. */ }
  if (item.module !== "commercial" || commercialIndicatorFlow(item) !== "crm" || detail.kind === "directSale") return null;
  const stage = String(detail.stage || item.status);
  let won = /ganho|fechad|vendid|contrat|conclu/i.test(stage);
  const funnel = catalogs.find(entry => entry.catalog === "funnelStage" && entry.name === detail.funnel);
  if (funnel) {
    try {
      const definition = JSON.parse(funnel.description);
      if (["q", "r"].includes(definition.f) || /reten|qualifica/i.test(definition.functionality || "")) return null;
      const configured = Array.isArray(definition.s) ? definition.s.find((entry: unknown[]) => entry[0] === stage)
        : definition.stages?.find((entry: { name: string }) => entry.name === stage);
      if (configured) won = Array.isArray(configured) ? configured[2] === 1 || configured[2] === true : configured.won === true;
    } catch { /* Legacy funnel definitions use the status. */ }
  }
  if (!won) return null;
  const day = commissionDate(detail.wonAt || detail.closedAt || detail.saleDate || item.updated_at);
  if (!day) return null;
  const products = Array.isArray(detail.products) ? detail.products as Record<string, unknown>[] : [];
  const productCents = products.reduce((sum, product) => sum + Math.round(Number(product.unitValue ?? product.value ?? 0) * Math.max(1, Number(product.quantity || 1)) * 100), 0);
  return { day, valueCents: Math.max(0, item.amount_cents || productCents), seller: String(detail.seller || ""),
    product: products.map(product => String(product.product || product.name || "Produto não informado")).join(", ") || item.record_type };
}

export function commissionEmployeeKey(employeeId: string, employeeName: string) {
  return employeeId ? employeeId.toLowerCase() : "name:" + normalizeCommissionName(employeeName);
}

export type LiaCommissionStages = { configuration: string; tests: string; release: string; current: string };
export function liaCommissionStages(detail: Record<string, unknown>, status: string): LiaCommissionStages {
  const stages = ["AguardandoKickoff", "KickoffAgendado", "ConfiguracaoInicial", "EmTesteCliente", "EmAjustes", "AguardandoAprovacao", "GoLiveAgendado", "EmProducaoAssistida", "ImplantacaoPrincipalConcluida", "ConfigurandoCRC", "AcompanhamentoFinal", "Concluida"];
  const index = stages.indexOf(status);
  const progress = (key: string, start: number, end: number) => detail[key] ? String(detail[key]) : index > end ? "Concluída" : index >= start ? "Em andamento" : "Pendente";
  return { configuration: progress("configurationStartedAt", 2, 2), tests: progress("clientTestsStartedAt", 3, 4),
    release: progress("releaseStartedAt", 5, 9), current: status === "Validacao" ? "Validação" : status === "Concluida" ? "Concluído" : status === "AcompanhamentoFinal" ? "Acompanhamento" : stages[index] ? ["Onboarding", "Onboarding", "Configuração Inicial", "Testes do Cliente", "Testes do Cliente", "Liberação", "Liberação", "Liberação", "Liberação", "Liberação"][index] : status };
}
