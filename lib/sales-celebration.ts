export type SaleCelebration = { id: string; customerName: string; clientId: string; seller: string; at: string };
export const SALE_WON_EVENT = "dontus:sale-won";
export const PUBLIC_SALE_DURATION_MS = 60_000;
type Item = { id: string; module: string; record_type: string; title: string; customer_name?: string; owner: string; status: string; description?: string; updated_at: string };
const detail = (item: Item) => { try { return JSON.parse(item.description || "{}"); } catch { return {}; } };
export function isWonSale(item?: Item) {
  return !!item && item.module === "commercial" && !/reten|qualifica|configura/i.test(item.record_type) && /ganho|vendid|fechad|contrat|conclu/i.test(detail(item).stage || item.status);
}
export function saleTransition(previous: Item | undefined, next: Item | undefined): SaleCelebration | undefined {
  if (!next || isWonSale(previous) || !isWonSale(next)) return;
  const data = detail(next);
  return { id: `${next.id}:${next.updated_at}`, customerName: data.customer || next.customer_name || next.title, clientId: data.clientId || "", seller: data.seller || next.owner, at: next.updated_at };
}
export function enqueueSales(current: SaleCelebration[], incoming: SaleCelebration[], seen: Set<string>) {
  const additions = incoming.filter(event => { if (seen.has(event.id)) return false; seen.add(event.id); return true; });
  return [...current, ...additions];
}
