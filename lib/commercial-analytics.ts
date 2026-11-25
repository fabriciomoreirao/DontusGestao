import { dateRangeBounds, dateRangeLabel } from "./date-range.ts";
import { crmResponsible } from "./crm-responsibles.ts";
import {
  commercialIndicatorFlow,
  commercialSaleDate,
  scopeCommercialIndicatorItems,
} from "./commercial-indicators.ts";
import { isWonSale, saleFunnel } from "./sales-celebration.ts";

export type CommercialAnalyticsItem = {
  id: string;
  module: string;
  record_type: string;
  title: string;
  customer_name?: string;
  owner: string;
  team: string;
  status: string;
  amount_cents: number;
  description?: string;
  created_at: string;
  updated_at: string;
};
export type AnalyticsCatalog = {
  id?: string;
  catalog: string;
  name: string;
  description: string;
};
type Detail = Record<string, unknown>;
export type CommercialAnalyticsEntry = {
  item: CommercialAnalyticsItem;
  detail: Detail;
  direct: boolean;
  won: boolean;
  lost: boolean;
  createdDate: string;
  saleDate: string;
  seller: string;
  stage: string;
  origin: string;
  funnel: string;
  amount: number;
  products: string[];
  follows: Detail[];
};
const normalize = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
const parse = (value?: string): Detail => {
  try {
    const data = JSON.parse(value || "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
};
const text = (...values: unknown[]) =>
  String(
    values.find((value) => typeof value === "string" && value.trim()) || "",
  );
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" &&
        value.trim() &&
        Number.isFinite(Number(value))
      ? Number(value)
      : undefined;
const validDay = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? commercialSaleDate({}, value)
    : "";

export function commercialAmountCents(
  item: Pick<CommercialAnalyticsItem, "amount_cents" | "description">,
  detail: Detail = parse(item.description),
) {
  const products = (
    Array.isArray(detail.products) ? detail.products : []
  ).filter(
    (product): product is Detail => !!product && typeof product === "object",
  );
  const productAmount = products.reduce(
    (sum, product) =>
      sum +
      Math.round(
        Math.max(0, number(product.unitValue) ?? number(product.value) ?? 0) *
          Math.max(1, number(product.quantity) ?? 1) *
          100,
      ),
    0,
  );
  return Math.max(
    0,
    Math.round(
      detail.kind === "directSale"
        ? (number(detail.totalCents) ??
            number(detail.valueCents) ??
            item.amount_cents)
        : item.amount_cents > 0
          ? item.amount_cents
          : (number(detail.totalCents) ??
            number(detail.valueCents) ??
            productAmount),
    ),
  );
}

export function commercialAnalyticsEntries(
  items: CommercialAnalyticsItem[],
  context: string,
  catalogs: AnalyticsCatalog[] = [],
) {
  const unique = new Map(
    scopeCommercialIndicatorItems(items, context).map((item) => [
      item.id,
      item,
    ]),
  );
  const sellers = new Map<string, string>();
  return [...unique.values()].flatMap((item) => {
    const detail = parse(item.description);
    const seller = crmResponsible(item) || "Não atribuído";
    if (!sellers.has(normalize(seller))) sellers.set(normalize(seller), seller);
    if (
      context === "commercial:combined" &&
      commercialIndicatorFlow(item) === "qualification"
    )
      return [];
    if (
      /configura|perfil|catalog/.test(normalize(item.record_type)) ||
      (detail.kind &&
        !["commercialLead", "directSale"].includes(String(detail.kind)))
    )
      return [];
    const direct = detail.kind === "directSale";
    const stage = text(detail.stage, item.status) || "Sem etapa";
    const products = (
      Array.isArray(detail.products) ? detail.products : []
    ).filter(
      (product): product is Detail => !!product && typeof product === "object",
    );
    const amount = commercialAmountCents(item, detail);
    const won =
      direct ||
      (commercialIndicatorFlow(item) === "crm" && isWonSale(item, catalogs));
    const createdDate = validDay(detail.entryDate) || validDay(item.created_at);
    const stamp = direct
      ? detail.saleDate
      : detail.wonAt ||
        detail.closedAt ||
        detail.saleDate ||
        detail.stageEnteredAt;
    const saleDate = won
      ? validDay(stamp) || validDay(item.updated_at) || createdDate
      : "";
    return [
      {
        item,
        detail,
        direct,
        won,
        createdDate,
        saleDate,
        stage,
        amount,
        lost:
          !won &&
          /perdid|cancel|desqualif|descart|sem sucesso/.test(normalize(stage)),
        seller: sellers.get(normalize(seller))!,
        origin: text(detail.origin, detail.source) || "Não informada",
        funnel: direct
          ? "Vendas diretas"
          : saleFunnel(detail, catalogs)?.name ||
            text(detail.funnel) ||
            "Sem CRM",
        products: products.map(
          (product) =>
            text(product.product, product.name, product.productName) ||
            "Produto não informado",
        ),
        follows: (Array.isArray(detail.follows) ? detail.follows : []).filter(
          (follow): follow is Detail => !!follow && typeof follow === "object",
        ),
      },
    ];
  });
}

export type AnalyticsPeriod = { start: string; end: string; label: string };
const day = (date: Date) => date.toISOString().slice(0, 10);
const short = (value: string) =>
  value.slice(5, 10).split("-").reverse().join("/");
export function commercialAnalyticsPeriod(
  mode: "month" | "week" | "range",
  value: string,
): AnalyticsPeriod {
  if (mode === "range") {
    const { from, to } = dateRangeBounds(value);
    return { start: from, end: to, label: dateRangeLabel(value) };
  }
  const date = new Date(
    `${mode === "month" ? value.slice(0, 7) + "-01" : value.slice(0, 10)}T12:00:00Z`,
  );
  if (!Number.isFinite(date.getTime()))
    return { start: "", end: "", label: "Período inválido" };
  if (mode === "week") {
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const start = day(date);
    date.setUTCDate(date.getUTCDate() + 6);
    const end = day(date);
    return {
      start,
      end,
      label: `${short(start)} a ${short(end)}/${end.slice(0, 4)}`,
    };
  }
  const start = day(date);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  const end = day(date);
  return { start, end, label: `${start.slice(5, 7)}/${start.slice(0, 4)}` };
}
export function previousCommercialPeriod(
  period: AnalyticsPeriod,
  mode: "month" | "week" | "range",
) {
  if (mode === "range") {
    const length = Math.max(
      1,
      Math.round(
        (Date.parse(period.end) - Date.parse(period.start)) / 86400000,
      ) + 1,
    );
    const end = new Date(Date.parse(period.start) - 86400000);
    const start = new Date(end.getTime() - (length - 1) * 86400000);
    return commercialAnalyticsPeriod("range", `${day(start)}..${day(end)}`);
  }
  const date = new Date(`${period.start}T12:00:00Z`);
  if (mode === "week") date.setUTCDate(date.getUTCDate() - 7);
  else date.setUTCMonth(date.getUTCMonth() - 1);
  return commercialAnalyticsPeriod(mode, day(date));
}
export const inCommercialPeriod = (date: string, period: AnalyticsPeriod) =>
  !!date && date >= period.start && date <= period.end;
export function summarizeCommercialPeriod(
  entries: CommercialAnalyticsEntry[],
  period: AnalyticsPeriod,
) {
  const cohort = entries.filter((entry) =>
    inCommercialPeriod(entry.createdDate, period),
  );
  const sales = entries.filter(
    (entry) => entry.won && inCommercialPeriod(entry.saleDate, period),
  );
  const open = cohort.filter((entry) => !entry.won && !entry.lost);
  const revenue = sales.reduce((sum, entry) => sum + entry.amount, 0);
  const converted = cohort.filter(
    (entry) => entry.won && inCommercialPeriod(entry.saleDate, period),
  );
  return {
    cohort,
    sales,
    open,
    converted,
    revenue,
    pipeline: open.reduce((sum, entry) => sum + entry.amount, 0),
    ticket: sales.length ? Math.round(revenue / sales.length) : 0,
    conversion: cohort.length
      ? Math.round((converted.length / cohort.length) * 100)
      : 0,
  };
}
