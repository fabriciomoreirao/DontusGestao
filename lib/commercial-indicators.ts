type CommercialFlow = "qualification" | "crm" | "retention";
type CommercialItem = { module: string; record_type: string; description?: string };
const normalize = (value: unknown) => typeof value === "string" ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() : "";

function flowFrom(value: unknown): CommercialFlow | undefined {
  const text = normalize(value);
  if (/retention|retencao/.test(text)) return "retention";
  if (/qualification|qualificacao/.test(text)) return "qualification";
  if (/crm|commercial|comercial/.test(text)) return "crm";
}

export function commercialIndicatorFlow(item: CommercialItem): CommercialFlow {
  // O tipo do registro identifica o quadro, mesmo quando todos usam kind= commercialLead.
  const recordFlow = flowFrom(item.record_type);
  if (recordFlow) return recordFlow;
  try {
    const detail = JSON.parse(item.description || "{}");
    const explicitFlow = flowFrom(detail?.flow) ?? flowFrom(detail?.crmFlow);
    if (explicitFlow) return explicitFlow;
    // Nomes de tipos legados podem identificar retenção/qualificação; commercialLead não identifica o quadro.
    const kind = normalize(detail?.kind);
    if (/retention|retencao|qualification|qualificacao/.test(kind)) return flowFrom(kind)!;
  } catch { /* Oportunidades antigas podem conter apenas texto. */ }
  return "crm";
}

export function scopeCommercialIndicatorItems<T extends CommercialItem>(items: T[], contextKey: string): T[] {
  const context = contextKey.split(":");
  const selected = flowFrom(context[0] === "commercial" ? context[1] : contextKey) ?? "crm";
  return items.filter(item => item.module === "commercial" && commercialIndicatorFlow(item) === selected);
}
