type Interaction = { createdAt?: string; text?: string; type?: string };
export type CrmActivityLead = { stage?: string; retentionStatus?: string; entryDate?: string; follows?: Interaction[]; comments?: Interaction[] };
export type CrmActivityItem = { created_at: string; status: string };
export type CrmActivityStage = { name: string; won?: boolean; lost?: boolean };

const normalize = (value?: string) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
const terminalName = (value?: string) => /^(ganh[oa]|perdid[oa]|finalizad[oa]|concluid[oa]|cancelad[oa]|encerrad[oa]|sucesso|insucesso|desqualificad[oa]|qualificado)$/.test(normalize(value));
const timestamp = (value?: string) => {
  if (typeof value !== "string" || !value) return NaN;
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00-03:00` : value);
};

export function isClosedCrmLead(item: CrmActivityItem, lead: CrmActivityLead | null, stages: CrmActivityStage[]) {
  const stage = stages.find((entry) => normalize(entry.name) === normalize(lead?.stage));
  return Boolean(stage?.won || stage?.lost || terminalName(lead?.stage) || terminalName(lead?.retentionStatus) || terminalName(item.status));
}

export function crmInactivityDays(item: CrmActivityItem, lead: CrmActivityLead | null, stages: CrmActivityStage[], now = Date.now()) {
  if (isClosedCrmLead(item, lead, stages)) return 0;
  const baseline = Number.isFinite(timestamp(lead?.entryDate)) ? timestamp(lead?.entryDate) : timestamp(item.created_at);
  // Alterações de cadastro e movimentações automáticas não são contato com o cliente.
  const interactions = [...(lead?.comments ?? []), ...(lead?.follows ?? []).filter((entry) => entry && !["movimentacao", "resultado comercial"].includes(normalize(entry.type)))];
  const dates = interactions.filter((entry) => typeof entry?.text === "string" && entry.text.trim()).map((entry) => timestamp(entry.createdAt)).filter(Number.isFinite);
  const last = Math.max(Number.isFinite(baseline) ? baseline : now, ...dates);
  return Math.max(0, Math.floor((now - last) / 86_400_000));
}
