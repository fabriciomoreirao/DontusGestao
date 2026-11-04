type RoutedSale = {
  clientId?: string; saleId: string; saleDate: string; name: string; seller: string;
  followUpTrack: "activation" | "retention" | "lia" | "enterprise";
  version: string; origin: string; products: Array<{product: string; plan: string; unitValue: number; quantity: number}>;
  totalCents: number;
};

export const directSaleClientId = (sale: {clientId?: string; saleId: string}) => sale.clientId?.trim() || sale.saleId;

export function directSaleFollowup(sale: RoutedSale, sourceId: string | undefined, at: string, historyId: string) {
  const summary = `Venda direta ${sale.saleId} · Cliente ${directSaleClientId(sale)} · ${sale.name}. Versão: ${sale.version}. Origem: ${sale.origin}. Produtos: ${sale.products.map(product => `${product.product} · ${product.plan} · ${product.quantity} unidade(s)`).join("; ")}.`;
  const common = { clientId: directSaleClientId(sale), sourceLeadId: sourceId, saleId: sale.saleId,
    version: sale.version, origin: sale.origin, products: sale.products, seller: sale.seller, totalCents: sale.totalCents };
  if (sale.followUpTrack === "enterprise") throw new Error("Vendas para contas estratégicas devem ser vinculadas à rede selecionada.");
  if (sale.followUpTrack === "lia") return { ...common, kind: "liaJourney", startDate: at, sector: "Comercial", requestType: "Venda direta",
    history: [{id: historyId, text: summary, at, author: sale.seller}] };
  return { ...common, kind: "csJourney", track: sale.followUpTrack, phase: "validation", commerciallyApproved: true, status: "Pendente",
    featuresBase: [], featuresActive: [], featuresPlus: [], labels: [], follows: [{kind: "Origem comercial", text: summary, createdAt: at, actor: sale.seller}] };
}
