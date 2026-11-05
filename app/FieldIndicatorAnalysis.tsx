"use client";
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { DistributionChart } from "./AnalyticsCharts";
import { groupIndicatorRecords, indicatorFields, indicatorValues, matchesIndicatorFilters, type IndicatorFilter, type IndicatorRecord } from "@/lib/field-indicators";

export function useFieldIndicatorAnalysis(records: IndicatorRecord[]) {
  const [filters, setFilters] = useState<IndicatorFilter[]>([]);
  const [field, setField] = useState("status");
  const [split, setSplit] = useState("");
  const fields = useMemo(() => indicatorFields(records), [records]);
  const validKeys = new Set(fields.map(entry => entry.key));
  const activeFilters = filters.filter(filter => validKeys.has(filter.field));
  const dimension = validKeys.has(field) ? field : "status";
  const secondary = validKeys.has(split) && split !== dimension ? split : "";
  const matches = (item: IndicatorRecord) => matchesIndicatorFilters(item, activeFilters);
  const panel = (scoped: IndicatorRecord[]) => {
    const groups = groupIndicatorRecords(scoped, dimension, secondary);
    const title = `${fields.find(entry => entry.key === dimension)?.label || "Status"}${secondary ? ` por ${fields.find(entry => entry.key === secondary)?.label}` : ""}`;
    return <section className="field-indicator-analysis"><header><div><h2>Indicadores por campos preenchidos</h2><p>Combine os filtros abaixo com o período e as opções desta página. Todos os indicadores acompanham a seleção.</p></div><strong>{scoped.length} registro(s)</strong></header><div className="field-indicator-controls"><label>Agrupar por<select value={dimension} onChange={event => setField(event.target.value)}>{fields.map(entry => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label><label>Cruzar com<select value={secondary} onChange={event => setSplit(event.target.value)}><option value="">Sem cruzamento</option>{fields.filter(entry => entry.key !== dimension).map(entry => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label><button className="secondary-button" type="button" onClick={() => setFilters(current => [...current, { field: dimension, value: "" }])}><Plus size={15} /> Adicionar filtro</button>{filters.length > 0 && <button type="button" className="secondary-button" onClick={() => setFilters([])}>Limpar filtros de campos</button>}</div><div className="field-indicator-filter-list">{activeFilters.map((filter, index) => <div key={index}><select aria-label={`Campo do filtro ${index + 1}`} value={filter.field} onChange={event => setFilters(current => current.map((entry, i) => i === index ? { field: event.target.value, value: "" } : entry))}>{fields.map(entry => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select><select aria-label={`Valor do filtro ${index + 1}`} value={filter.value} onChange={event => setFilters(current => current.map((entry, i) => i === index ? { ...entry, value: event.target.value } : entry))}><option value="">Todas as opções</option>{[...new Set(records.flatMap(item => indicatorValues(item, filter.field)))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(value => <option key={value}>{value}</option>)}</select><button className="icon-button" aria-label={`Remover filtro ${index + 1}`} onClick={() => setFilters(current => current.filter((_, i) => i !== index))}><X size={16} /></button></div>)}</div><div className="field-indicator-results"><div><DistributionChart title={title} entries={groups.map(group => ({ label: group.label, count: group.count }))} /></div><div className="field-indicator-table"><table><thead><tr><th>{title}</th><th>Quantidade</th><th>Participação</th><th>Valor</th></tr></thead><tbody>{groups.map(group => <tr key={group.label}><th scope="row">{group.label}</th><td>{group.count}</td><td>{scoped.length ? (group.count / scoped.length * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : 0}%</td><td>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(group.amountCents / 100)}</td></tr>)}</tbody></table>{!groups.length && <p>Nenhum registro corresponde aos filtros selecionados.</p>}</div></div><small>Campos com várias opções contam cada registro uma vez por opção. As participações podem somar mais de 100%.</small></section>;
  };
  return { matches, panel };
}
