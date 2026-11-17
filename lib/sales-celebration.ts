export type SaleCelebration = { id: string; customerName: string; clientId: string; seller: string; at: string };
export const SALE_WON_EVENT = "dontus:sale-won";
export const PUBLIC_SALE_DURATION_MS = 60_000;
type Item = { id: string; module: string; record_type: string; title: string; customer_name?: string; owner: string; status: string; description?: string; updated_at: string };
const detail = (item: Item) => { try { return JSON.parse(item.description || "{}"); } catch { return {}; } };
type Funnel = { id?: string; name: string; catalog: string; description: string };
const normalizedName = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
export function saleFunnel(data: Record<string, unknown>, catalogs: Funnel[]) {
  const funnels = catalogs.filter(entry => entry.catalog === "funnelStage");
  return funnels.find(entry => entry.id && entry.id === data.funnelId)
    ?? funnels.find(entry => normalizedName(entry.name) === normalizedName(data.funnel));
}
export function isWonSale(item?: Item, catalogs: Funnel[] = []) {
  if (!item || item.module !== "commercial" || /reten|qualifica|configura/i.test(item.record_type)) return false;
  const data = detail(item); const stage = data.stage || item.status;
  if (/retention|retencao|retencão|retenção|qualification|qualificacao|qualificação/i.test(`${data.flow || ""} ${data.crmFlow || ""}`)) return false;
  const funnel = saleFunnel(data, catalogs);
  if (funnel) {
    let config; try { config = JSON.parse(funnel.description); } catch { config = {}; }
    if (["q", "r"].includes(config.f) || /reten|qualifica/i.test(config.functionality || "")) return false;
    const configured = Array.isArray(config.s) ? config.s.find((row: unknown[]) => normalizedName(row[0]) === normalizedName(stage)) : undefined;
    if (configured) return [true, 1, "true", "1"].includes(configured[2]);
    const expanded = config.stages?.find((row: { name: string }) => normalizedName(row.name) === normalizedName(stage));
    if (expanded) return expanded.won === true;
  }
  return /ganho|vendid|fechad|contrat|conclu/i.test(stage);
}
export function saleTransition(previous: Item | undefined, next: Item | undefined, catalogs: Funnel[] = []): SaleCelebration | undefined {
  if (!next || isWonSale(previous, catalogs) || !isWonSale(next, catalogs)) return;
  const data = detail(next);
  if (data.notifyPublicWin === false) return;
  return { id: `${next.id}:${next.updated_at}`, customerName: data.customer || next.customer_name || next.title, clientId: data.clientId || "", seller: data.seller || next.owner, at: next.updated_at };
}

export function pendingWinChoice(previous: Item | undefined, payload: Record<string, unknown>, catalogs: Funnel[] = []) {
  if (!["createWorkItem", "updateWorkItem", "transitionWorkItem"].includes(String(payload.action))) return;
  const next: Item = { id: previous?.id || "new", module: String(payload.module || previous?.module || ""), record_type: String(payload.recordType || previous?.record_type || ""), title: String(payload.title || previous?.title || ""), owner: String(payload.owner || previous?.owner || ""), status: String(payload.nextStatus || payload.status || previous?.status || ""), updated_at: previous?.updated_at || "", description: String(payload.description ?? previous?.description ?? "{}") };
  if (payload.action === "transitionWorkItem") next.description = JSON.stringify({ ...detail(next), stage: payload.nextStatus });
  return !isWonSale(previous, catalogs) && isWonSale(next, catalogs) ? next : undefined;
}
export function enqueueSales(current: SaleCelebration[], incoming: SaleCelebration[], seen: Set<string>) {
  const additions = incoming.filter(event => { if (seen.has(event.id)) return false; seen.add(event.id); return true; });
  return [...current, ...additions];
}
