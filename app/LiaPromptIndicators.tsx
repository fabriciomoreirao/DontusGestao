"use client";
import { useMemo, useState } from "react";
import { Activity, CheckCircle2, Clock3, Users } from "lucide-react";
import { DistributionChart, TrendChart } from "@/app/AnalyticsCharts";
import SearchablePeopleSelect from "@/app/SearchablePeopleSelect";
import { filterLiaPrompts, liaPromptEntries, liaPromptMetrics, liaPromptDistribution, liaPromptMonthlyVolume, LIA_PROMPT_STATUSES, type LiaPromptFilters, type LiaPromptItem } from "@/lib/lia-prompt-indicators";

export default function LiaPromptIndicators({ items }: { items: LiaPromptItem[] }) {
  const entries = useMemo(() => liaPromptEntries(items), [items]);
  const [filters, setFilters] = useState<LiaPromptFilters>({});
  const patch = (key: keyof LiaPromptFilters, value: string) => setFilters(current => ({ ...current, [key]: value }));
  const scoped = filterLiaPrompts(entries, filters), metrics = liaPromptMetrics(scoped);
  const options = (field: "responsible" | "reviewer" | "type") => [...new Set(entries.map(entry => entry[field]))].sort();
  const cards = [{ label: "Ajustes registrados", value: metrics.total, note: `${metrics.clients} cliente(s) atendido(s)` }, { label: "Em conferência", value: metrics.conference, note: "aguardando decisão" },
    { label: "Aprovados", value: metrics.approved, note: `${metrics.approvalRate}% das decisões` }, { label: "Reprovados", value: metrics.rejected, note: "devolvidos para ajustes" },
    { label: "Testados", value: metrics.tested, note: `${metrics.total ? Math.round(metrics.tested / metrics.total * 100) : 0}% dos ajustes` }, { label: "Não testados", value: metrics.total - metrics.tested, note: "sem teste confirmado" },
    { label: "Aguardando envio", value: metrics.pending, note: "na etapa de ajustes" }, { label: "Tempo médio de conferência", value: metrics.averageReviewHours === null ? "—" : `${metrics.averageReviewHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`, note: "do envio até a decisão" }];
  return <div className="lia-prompt-indicators"><section className="lia-prompt-bi-filters" aria-label="Filtros dos ajustes de prompts">
    <label>De<input type="date" value={filters.from ?? ""} onChange={event => patch("from", event.target.value)} /></label><label>Até<input type="date" value={filters.to ?? ""} onChange={event => patch("to", event.target.value)} /></label>
    <label>Responsável pelo ajuste<SearchablePeopleSelect searchLabel="Filtrar responsável pelos prompts" value={filters.responsible ?? "all"} onChange={event => patch("responsible", event.target.value)}><option value="all">Todos</option>{options("responsible").map(name => <option key={name}>{name}</option>)}</SearchablePeopleSelect></label>
    <label>Conferente<SearchablePeopleSelect searchLabel="Filtrar conferente dos prompts" value={filters.reviewer ?? "all"} onChange={event => patch("reviewer", event.target.value)}><option value="all">Todos</option>{options("reviewer").map(name => <option key={name}>{name}</option>)}</SearchablePeopleSelect></label>
    <label>Tipo de ajuste<select value={filters.type ?? "all"} onChange={event => patch("type", event.target.value)}><option value="all">Todos</option>{options("type").map(name => <option key={name}>{name}</option>)}</select></label>
    <label>Status do ajuste<select value={filters.status ?? "all"} onChange={event => patch("status", event.target.value)}><option value="all">Todos</option>{Object.entries(LIA_PROMPT_STATUSES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    <label>Teste realizado<select value={filters.tested ?? "all"} onChange={event => patch("tested", event.target.value)}><option value="all">Todos</option><option value="yes">Sim</option><option value="no">Não</option></select></label><button type="button" className="secondary-button" onClick={() => setFilters({})}>Limpar filtros dos prompts</button>
  </section><section className="operation-bi-kpis">{cards.map((card, index) => <article key={card.label}>{index % 4 === 0 ? <Activity /> : index % 4 === 1 ? <Clock3 /> : index % 4 === 2 ? <CheckCircle2 /> : <Users />}<span><small>{card.label}</small><strong>{card.value}</strong><em>{card.note}</em></span></article>)}</section>
    <section className="lia-prompt-bi-charts"><article className="operation-bi-panel"><h2>Ajustes por mês</h2><TrendChart entries={liaPromptMonthlyVolume(scoped)} title="Evolução dos ajustes de prompts" unit="ajustes" /></article>
      {([['status','Situação dos ajustes'],['type','Tipos de ajuste'],['responsible','Ajustes por responsável'],['reviewer','Ajustes por conferente'],['tested','Cobertura de testes']] as const).map(([field,title]) => <article className="operation-bi-panel" key={field}><h2>{title}</h2><DistributionChart title={title} entries={liaPromptDistribution(scoped, field)} /></article>)}
    </section><section className="lia-client-table"><table><caption>{scoped.length} ajuste(s) nos filtros selecionados</caption><thead><tr><th>Data</th><th>ID do cliente</th><th>Tipo</th><th>Responsável</th><th>Conferente</th><th>Status</th><th>Testado</th></tr></thead><tbody>{scoped.slice().sort((a,b) => b.date.localeCompare(a.date)).map(entry => <tr key={entry.item.id}><td>{entry.date ? entry.date.split("-").reverse().join("/") : "—"}</td><td>{entry.clientId || "—"}</td><td>{entry.type}</td><td>{entry.responsible}</td><td>{entry.reviewer}</td><td>{LIA_PROMPT_STATUSES[entry.status as keyof typeof LIA_PROMPT_STATUSES]}</td><td>{entry.tested ? "Sim" : "Não"}</td></tr>)}</tbody></table>{!scoped.length && <p className="empty-state">Nenhum ajuste de prompt nos filtros selecionados.</p>}</section>
  </div>;
}
