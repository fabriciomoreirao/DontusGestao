"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import IndicatorTabs from "./IndicatorTabs";
import SearchablePeopleSelect from "./SearchablePeopleSelect";
import { useFieldIndicatorAnalysis } from "./FieldIndicatorAnalysis";
import type { CancellationDetail } from "./CancellationsModule";
import { cancellationReversalOwner, cancellationResponsibleName, cancellationResponsibilitySummary, cancellationRoles, type CancellationRole } from "@/lib/cancellation-responsibility";

type Entry = { item: { id: string; title: string; owner: string; status: string; team: string }; detail: CancellationDetail };
type Props = { records: Entry[]; employees: Array<{ displayName: string; departmentName: string }>; month: string; sector: string; onMonth: (value: string) => void; onSector: (value: string) => void; onBack: () => void };
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const rate = (converted: number, total: number) => `${(total ? converted / total * 100 : 0).toFixed(1).replace(".", ",")}%`;
const indicatorRecord = (entry: Entry) => ({ id: entry.item.id, module: "cancellations", record_type: "Solicitação de cancelamento", owner: cancellationReversalOwner(entry.detail, entry.item.owner), team: entry.item.team, status: entry.item.status, amount_cents: entry.detail.monthlyValueCents, description: JSON.stringify(entry.detail), created_at: entry.detail.requestDate, updated_at: entry.detail.requestDate });

export default function CancellationIndicators({ records, employees, month, sector, onMonth, onSector, onBack }: Props) {
  const fieldAnalysis = useFieldIndicatorAnalysis(records.map(indicatorRecord));
  const [tab, setTab] = useState<"overview" | "reasons" | "responsibles" | "clients" | "fields">("overview");
  const [responsibles, setResponsibles] = useState<Record<CancellationRole, string>>({ seller: "", csOwner: "", reversalOwner: "" });
  const getSector = (entry: Entry) => employees.find(employee => employee.displayName === cancellationReversalOwner(entry.detail, entry.item.owner))?.departmentName || entry.item.team || "Sem setor";
  const sectors = [...new Set(records.map(getSector))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const scoped = records.filter(entry => (sector === "all" || getSector(entry) === sector) && cancellationRoles.every(role => !responsibles[role.key] || cancellationResponsibleName(entry, role.key) === responsibles[role.key]));
  const period = scoped.filter(entry => (!month || entry.detail.requestMonth === month) && fieldAnalysis.matches(indicatorRecord(entry)));
  const converted = period.filter(entry => entry.item.status === "Convertido");
  const lost = period.filter(entry => entry.item.status === "Não convertido");
  const progress = period.filter(entry => !["Convertido", "Não convertido"].includes(entry.item.status));
  const recovered = converted.reduce((sum, entry) => sum + entry.detail.monthlyValueCents, 0);
  const atRiskMrr = progress.reduce((sum,entry)=>sum+entry.detail.monthlyValueCents,0);
  const lostMrr = lost.reduce((sum, entry) => sum + entry.detail.monthlyValueCents, 0);
  const reasonCounts = [...new Set(period.map(entry => entry.detail.reason || "Não informado"))].map(name => ({ name, value: period.filter(entry => (entry.detail.reason || "Não informado") === name).length })).sort((a, b) => b.value - a.value);
  const year = month ? Number(month.slice(0, 4)) : new Date().getFullYear();
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, "0")}`;
    const rows = scoped.filter(entry => entry.detail.requestMonth === key && fieldAnalysis.matches(indicatorRecord(entry)));
    return { label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(`${key}-02T12:00:00`)), total: rows.length, converted: rows.filter(entry => entry.item.status === "Convertido").length, lost: rows.filter(entry => entry.item.status === "Não convertido").length };
  });
  const max = Math.max(1, ...monthly.map(entry => entry.total));

  return <section className="cancellation-indicators">
    <header className="module-page-header"><div className="module-page-title"><span className="module-page-title-icon"><BarChart3 /></span><span className="module-page-copy"><span className="eyebrow">BI · CANCELAMENTOS</span><h1>Controle de Cancelamentos {year}</h1><p>Solicitações, reversões e impacto mensal por vendedor, responsável CS e responsável pela reversão.</p></span></div><div className="module-page-actions cancellation-indicator-filters"><select aria-label="Setor da reversão" value={sector} onChange={event => onSector(event.target.value)}><option value="all">Todos os setores</option>{sectors.map(value => <option value={value} key={value}>{value}</option>)}</select><input aria-label="Mês das solicitações" type="month" value={month} onChange={event => onMonth(event.target.value)} /><button className="secondary-button" onClick={onBack}>Voltar</button></div></header>
    <div className="cancellation-responsibility-filters">{cancellationRoles.map(role => <label key={role.key}>{role.label}<SearchablePeopleSelect searchLabel={`Filtrar por ${role.label.toLowerCase()}`} value={responsibles[role.key]} onChange={event => setResponsibles(current => ({ ...current, [role.key]: event.target.value }))}><option value="">Todos</option>{[...new Set(records.map(entry => cancellationResponsibleName(entry, role.key)))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(name => <option key={name}>{name}</option>)}</SearchablePeopleSelect></label>)}</div>
    <IndicatorTabs id="cancellation" value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Visão geral" }, { id: "reasons", label: "Motivos e impacto" }, { id: "responsibles", label: "Responsáveis" }, { id: "clients", label: "Clientes" }, { id: "fields", label: "Campos preenchidos" }]} />
    <section role="tabpanel" id={`cancellation-panel-${tab}`} aria-labelledby={`cancellation-tab-${tab}`} className="indicator-panel">
      {tab === "fields" ? fieldAnalysis.panel(period.map(indicatorRecord)) : <>
      <section className="cancellation-bi-kpis"><article><small>Solicitações no período</small><strong>{period.length}</strong></article><article className="good"><small>Taxa de reversão</small><strong>{rate(converted.length, period.length)}</strong></article><article className="warning"><small>MRR em risco</small><strong>{money(atRiskMrr)}</strong></article><article className="blue"><small>MRR recuperado</small><strong>{money(recovered)}</strong></article><article className="bad"><small>MRR perdido</small><strong>{money(lostMrr)}</strong></article><article className="good"><small>Convertidos</small><strong>{converted.length}</strong></article><article className="bad"><small>Não convertidos</small><strong>{lost.length}</strong></article><article className="warn"><small>Em andamento</small><strong>{progress.length}</strong></article><article><small>Ticket médio perdido</small><strong>{money(lost.length ? Math.round(lostMrr / lost.length) : 0)}</strong></article></section>
      {(tab === "overview" || tab === "reasons") && <section className="cancellation-bi-grid">
        {tab === "overview" && <article><header><h2>Evolução mensal das solicitações</h2><span><i className="requests" />Solicitações<i className="converted" />Convertidos<i className="lost" />Não convertidos</span></header><div className="cancellation-month-chart">{monthly.map(entry => <div key={entry.label}><span className="chart-bars"><i className="requests" style={{ height: `${entry.total / max * 100}%` }} title={`${entry.total} solicitações`} /><i className="converted" style={{ height: `${entry.converted / max * 100}%` }} title={`${entry.converted} convertidos`} /><i className="lost" style={{ height: `${entry.lost / max * 100}%` }} title={`${entry.lost} não convertidos`} /></span><small>{entry.label}</small></div>)}</div></article>}
        {tab === "reasons" && <article><header><h2>Cancelamentos por motivo</h2></header><div className="cancellation-reason-chart">{reasonCounts.map(entry => <div key={entry.name}><span>{entry.name}</span><i><b style={{ width: `${entry.value / Math.max(1, reasonCounts[0]?.value || 1) * 100}%` }} /></i><strong>{entry.value}</strong></div>)}{!period.length && <p className="empty-copy">Nenhuma solicitação para os filtros selecionados.</p>}</div></article>}
      </section>}
      {tab === "responsibles" && <div className="cancellation-responsibility-reports">{cancellationRoles.map(role => <section className="cancellation-responsibility-report" key={role.key}><header><h2>{role.title}</h2><p>{role.description}</p></header><div className="cancellation-report-scroll"><table><thead><tr><th>{role.label}</th><th>Solicitações</th><th>Convertidos</th><th>Não convertidos</th><th>Em andamento</th><th>Taxa de reversão</th><th>MRR recuperado</th><th>MRR perdido</th></tr></thead><tbody>{cancellationResponsibilitySummary(period, role.key).map(row => <tr key={row.name}><th scope="row">{row.name}</th><td>{row.total}</td><td>{row.converted}</td><td>{row.lost}</td><td>{row.progress}</td><td>{rate(row.converted, row.total)}</td><td>{money(row.recoveredMrr)}</td><td>{money(row.lostMrr)}</td></tr>)}</tbody></table></div>{!period.length && <p className="empty-copy">Nenhuma solicitação para os filtros selecionados.</p>}</section>)}</div>}
      {tab === "clients" && <section className="cancellation-responsibility-report"><div className="cancellation-report-scroll"><table className="cancellation-client-responsibilities"><thead><tr><th>Cliente</th><th>Vendedor</th><th>Responsável CS</th><th>Responsável pela reversão</th><th>Motivo</th><th>Plano</th><th>Status</th><th>MRR</th></tr></thead><tbody>{period.map(entry => <tr data-reminder-entity-id={entry.item.id} key={entry.item.id}><th scope="row"><strong>{entry.detail.customerName || entry.item.title}</strong><small>ID {entry.detail.clientId}{entry.detail.protocol ? ` · ${entry.detail.protocol}` : ""}</small></th>{cancellationRoles.map(role => <td key={role.key}>{cancellationResponsibleName(entry, role.key)}</td>)}<td>{entry.detail.reason}</td><td>{entry.detail.plan}</td><td>{entry.item.status}</td><td>{money(entry.detail.monthlyValueCents)}</td></tr>)}</tbody></table></div>{!period.length && <p className="empty-copy">Nenhuma solicitação para os filtros selecionados.</p>}</section>}
      </>}
    </section>
  </section>;
}
