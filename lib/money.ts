const reais = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export const formatMoney = (cents: number) => reais.format(cents / 100);

export function parseMoneyInput(value: string): number | null {
  let normalized = value.trim().replace(/^R\$\s*/i, "").replace(/[\s\u00a0]/g, "");
  if (!normalized) return 0;
  if (normalized.includes(",")) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),(?:\d{0,2})$/.test(normalized)) return null;
    normalized = normalized.replaceAll(".", "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replaceAll(".", "");
  }
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export const moneyInputValue = (units: number) => units.toLocaleString("pt-BR", {
  useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2,
});
