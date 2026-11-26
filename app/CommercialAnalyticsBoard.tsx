"use client";
import DateRangeFilter from "@/app/DateRangeFilter";
import { dateRangeBounds, dateKey, dateRangeLabel } from "@/lib/date-range";

import PaginatedItems from "@/app/PaginatedItems";
import { useMemo, useState } from "react";
import CommercialIndicatorClients from "@/app/CommercialIndicatorClients";
import { ArrowLeft, BarChart3, Filter } from "lucide-react";
import IndicatorTabs from "@/app/IndicatorTabs";
import SearchablePeopleSelect from "@/app/SearchablePeopleSelect";
import { DistributionChart, TrendChart } from "@/app/AnalyticsCharts";
import CommercialTrafficIndicators from "@/app/CommercialTrafficIndicators";
import CommercialGoalSummary from "@/app/CommercialGoalSummary";
import { useFieldIndicatorAnalysis } from "@/app/FieldIndicatorAnalysis";
import { paidTrafficCohort } from "@/lib/paid-traffic-indicators";
import { percentageChange } from "@/lib/analytics-charts";
import {
  commercialAnalyticsEntries,
  commercialAnalyticsPeriod,
  previousCommercialPeriod,
  summarizeCommercialPeriod,
  inCommercialPeriod,
  type AnalyticsCatalog,
  type CommercialAnalyticsItem,
  type CommercialAnalyticsEntry,
} from "@/lib/commercial-analytics";

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value / 100,
  );
const countBy = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
};
type Props = {
  title: string;
  contextKey: string;
  items: CommercialAnalyticsItem[];
  catalogs?: AnalyticsCatalog[];
  onClose: () => void;
};
export default function CommercialAnalyticsBoard({
  title,
  contextKey,
  items,
  catalogs = [],
  onClose,
}: Props) {
  const [drilldown, setDrilldown] = useState<{
    title: string;
    entries: CommercialAnalyticsEntry[];
  } | null>(null);
  const [tab, setTab] = useState(
    contextKey.includes("qualification") ? "campaigns" : "overview",
  );
  const [mode, setMode] = useState<"month" | "week">("month");
  const [month, setMonth] = useState(() =>
    new Date()
      .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
      .slice(0, 7),
  );
  const [week, setWeek] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
  );
  const [seller, setSeller] = useState("all"),
    [funnel, setFunnel] = useState("all"),
    [stage, setStage] = useState("all"),
    [origin, setOrigin] = useState("all");
  const [now] = useState(() => Date.now());
  const combined = tab === "totals" || tab === "direct";
  const source = useMemo(
    () =>
      commercialAnalyticsEntries(
        items,
        combined ? "commercial:combined" : contextKey,
        catalogs,
      ).filter((entry) => tab !== "direct" || entry.direct),
    [items, contextKey, catalogs, combined, tab],
  );
  const fieldRecords = useMemo(
    () => source.map((entry) => entry.item),
    [source],
  );
  const fieldAnalysis = useFieldIndicatorAnalysis(fieldRecords);
  const entries = source.filter(
    (entry) =>
      fieldAnalysis.matches(entry.item) &&
      (seller === "all" || entry.seller === seller) &&
      (funnel === "all" || entry.funnel === funnel) &&
      (stage === "all" || entry.stage === stage) &&
      (origin === "all" || entry.origin === origin),
  );
  const periodMode = mode === "month" ? "range" : "week";
  const bounds = dateRangeBounds(month);
  const sourceDates = source
    .flatMap((entry) => [entry.createdDate, entry.saleDate])
    .filter(Boolean)
    .sort();
  const effectiveRange = `${bounds.from || sourceDates[0] || dateKey(new Date())}..${bounds.to || [dateKey(new Date()), ...sourceDates].sort().at(-1)}`;
  const period = commercialAnalyticsPeriod(
    periodMode,
    mode === "month" ? effectiveRange : week,
  );
  if (mode === "month") period.label = dateRangeLabel(month);
  const previousPeriod = previousCommercialPeriod(period, periodMode);
  const current = summarizeCommercialPeriod(entries, period),
    previous = summarizeCommercialPeriod(entries, previousPeriod);
  const { cohort, sales, open, revenue, pipeline, ticket, conversion } =
    current;
  const visibleRecords = [
    ...new Map(
      [...cohort, ...sales].map((entry) => [entry.item.id, entry]),
    ).values(),
  ];
  const traffic = paidTrafficCohort(items).filter(
    (entry) =>
      inCommercialPeriod(entry.date, period) &&
      (seller === "all" || entry.seller === seller) &&
      (funnel === "all" || entry.originFunnel === funnel) &&
      (origin === "all" ||
        String(
          entry.detail.origin || entry.detail.source || "Não informada",
        ) === origin) &&
      (stage === "all" ||
        String(entry.detail.stage || entry.item.status) === stage) &&
      fieldAnalysis.matches(entry.item),
  );
  const ranking = [
    ...new Set([...cohort, ...sales].map((entry) => entry.seller)),
  ]
    .map((name) => {
      const report = summarizeCommercialPeriod(
        entries.filter((entry) => entry.seller === name),
        period,
      );
      return { name, ...report };
    })
    .sort(
      (a, b) =>
        b.revenue - a.revenue ||
        b.sales.length - a.sales.length ||
        a.name.localeCompare(b.name, "pt-BR"),
    );
  const trend = [];
  let cursor = period;
  for (let index = 0; index < 6; index++) {
    trend.unshift({
      label: cursor.label,
      value: summarizeCommercialPeriod(entries, cursor).revenue,
    });
    cursor = previousCommercialPeriod(cursor, periodMode);
  }
  const stale = open.filter(
    (entry) => now - Date.parse(entry.item.updated_at) > 7 * 86400000,
  );
  const noContact = open.filter(
    (entry) =>
      !entry.follows.some(
        (follow) =>
          !/movimenta|cadastro|resultado/.test(String(follow.type || "")),
      ),
  );
  const hot = open
    .filter((entry) =>
      /quente|hot/.test(String(entry.detail.temperature || "").toLowerCase()),
    )
    .sort((a, b) => b.amount - a.amount);
  const outcome = [
    { label: "Ganhas no período", count: current.converted.length },
    {
      label: "Ganhas depois do período",
      count: cohort.filter((entry) => entry.won && entry.saleDate > period.end)
        .length,
    },
    { label: "Em aberto atualmente", count: open.length },
    {
      label: "Perdidas atualmente",
      count: cohort.filter((entry) => entry.lost).length,
    },
  ];
  const kpis = [
    {
      label: "Receita de vendas ganhas",
      value: money(revenue),
      note: `${sales.length} venda(s) pela data do ganho`,
      change: percentageChange(revenue, previous.revenue),
    },
    {
      label: "Vendas ganhas",
      value: sales.length,
      note: `Ticket médio: ${money(ticket)}`,
      change: percentageChange(sales.length, previous.sales.length),
    },
    {
      label: "Novas oportunidades",
      value: cohort.length,
      note: "Pela data de entrada no CRM",
      change: percentageChange(cohort.length, previous.cohort.length),
    },
    {
      label: "Pipeline das novas oportunidades",
      value: money(pipeline),
      note: `${open.length} em aberto · conversão da entrada: ${conversion}%`,
      change: null,
    },
  ];
  const delta = (value: number | null) =>
    value === null
      ? "Sem base no período anterior"
      : `${value >= 0 ? "+" : ""}${value}% vs ${mode === "week" ? "semana" : "mês"} anterior`;
  const groups = countBy(visibleRecords.map((entry) => entry.funnel)).map(
    (row) => ({
      name: row.label,
      report: summarizeCommercialPeriod(
        entries.filter((entry) => entry.funnel === row.label),
        period,
      ),
    }),
  );
  return (
    <main
      className="operation-bi-page cancellation-bi-style commercial-analytics-page"
      aria-labelledby="operation-bi-title"
    >
      <section className="operation-bi-board commercial-bi-board">
        <header>
          <div>
            <span className="operation-bi-mark">
              <BarChart3 />
            </span>
            <span>
              <small>INDICADORES · CRM</small>
              <h1 id="operation-bi-title">{title}</h1>
              <p>Receita pelo ganho; oportunidades pela entrada no CRM.</p>
            </span>
          </div>
          <button
            className="operation-bi-back"
            onClick={onClose}
            aria-label="Voltar para a funcionalidade"
          >
            <ArrowLeft />
            <span>Voltar</span>
          </button>
        </header>
        <IndicatorTabs
          id="commercial"
          value={tab}
          onChange={(value) => {
            setTab(value);
            setFunnel("all");
            setStage("all");
          }}
          tabs={[
            { id: "overview", label: "Visão geral" },
            { id: "funnel", label: "Funil e receita" },
            { id: "team", label: "Equipe e oportunidades" },
            { id: "campaigns", label: "Tráfego e campanhas" },
            { id: "fields", label: "Campos preenchidos" },
            { id: "direct", label: "Vendas diretas" },
            { id: "totals", label: "Totais em conjunto" },
          ]}
        />
        <section className="operation-bi-filters commercial-analytics-filters">
          <Filter />
          <label>
            Visualização
            <select
              aria-label="Periodicidade dos indicadores"
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as "month" | "week")
              }
            >
              <option value="month">Período</option>
              <option value="week">Semanal</option>
            </select>
          </label>
          {mode === "month" ? (
            <DateRangeFilter
              value={month}
              onChange={setMonth}
              label="Período dos indicadores"
            />
          ) : (
            <label>
              Semana de
              <input
                type="date"
                aria-label="Semana dos indicadores"
                value={week}
                onChange={(event) => {
                  if (event.target.value) setWeek(event.target.value);
                }}
              />
            </label>
          )}
          <label>
            CRM
            <select
              aria-label="Filtrar indicadores por CRM"
              value={funnel}
              onChange={(event) => setFunnel(event.target.value)}
            >
              <option value="all">Todos</option>
              {[
                ...new Set(
                  tab === "campaigns"
                    ? paidTrafficCohort(items).map(
                        (entry) => entry.originFunnel,
                      )
                    : source.map((entry) => entry.funnel),
                ),
              ]
                .sort()
                .map((name) => (
                  <option key={name}>{name}</option>
                ))}
            </select>
          </label>
          <label>
            Vendedor
            <SearchablePeopleSelect
              searchLabel="Vendedor"
              value={seller}
              onChange={(event) => setSeller(event.target.value)}
            >
              <option value="all">Todos</option>
              {[...new Set(source.map((entry) => entry.seller))]
                .sort()
                .map((name) => (
                  <option key={name}>{name}</option>
                ))}
            </SearchablePeopleSelect>
          </label>
          <label>
            Etapa
            <select
              value={stage}
              onChange={(event) => setStage(event.target.value)}
            >
              <option value="all">Todas</option>
              {[...new Set(source.map((entry) => entry.stage))]
                .sort()
                .map((name) => (
                  <option key={name}>{name}</option>
                ))}
            </select>
          </label>
          <label>
            Origem
            <select
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
            >
              <option value="all">Todas</option>
              {[...new Set(source.map((entry) => entry.origin))]
                .sort()
                .map((name) => (
                  <option key={name}>{name}</option>
                ))}
            </select>
          </label>
          <button
            onClick={() => {
              setSeller("all");
              setFunnel("all");
              setStage("all");
              setOrigin("all");
            }}
          >
            Limpar
          </button>
        </section>
        <p className="commercial-period-note">
          <strong>
            {mode === "week" ? "Semana" : "Mês"}: {period.label}
          </strong>
          <span>
            Conversão = oportunidades que entraram e foram ganhas no mesmo
            período ÷ entradas. Totais em conjunto reúne o CRM e as vendas
            diretas, sem incluir cópias da qualificação.
          </span>
        </p>
        <section
          role="tabpanel"
          id={`commercial-panel-${tab}`}
          aria-labelledby={`commercial-tab-${tab}`}
          className="indicator-panel"
        >
          {tab === "fields" ? (
            fieldAnalysis.panel(visibleRecords.map((entry) => entry.item))
          ) : tab === "campaigns" ? (
            <CommercialTrafficIndicators entries={traffic} />
          ) : (
            <>
              <section className="commercial-analysis-kpis">
                {kpis.map((kpi, index) => (
                  <button
                    type="button"
                    key={kpi.label}
                    aria-label={`Ver clientes: ${kpi.label}`}
                    onClick={() =>
                      setDrilldown({
                        title: kpi.label,
                        entries:
                          index < 2 ? sales : index === 2 ? cohort : open,
                      })
                    }
                  >
                    <small>{kpi.label}</small>
                    <strong>{kpi.value}</strong>
                    <span>{kpi.note}</span>
                    {kpi.change !== null && <em>{delta(kpi.change)}</em>}
                    <small>Ver clientes por CRM →</small>
                  </button>
                ))}
              </section>
              {(tab === "overview" ||
                tab === "funnel" ||
                tab === "direct" ||
                tab === "totals") && (
                <section className="commercial-bi-charts">
                  <Chart
                    title={`Receita · últimos 6 ${mode === "week" ? "semanas" : "meses"}`}
                  >
                    <TrendChart
                      title="Receita de vendas ganhas"
                      entries={trend}
                      currency
                    />
                  </Chart>
                  <Chart
                    title={
                      tab === "direct" || tab === "totals"
                        ? "Receita por vendedor"
                        : "Situação das novas oportunidades"
                    }
                  >
                    {tab === "direct" || tab === "totals" ? (
                      <RevenueBars
                        rows={ranking.map((row) => ({
                          name: row.name,
                          revenue: row.revenue,
                          sales: row.sales.length,
                        }))}
                      />
                    ) : (
                      <DistributionChart
                        title="Resultados das oportunidades que entraram no período"
                        entries={outcome}
                        unit="oportunidades"
                        donut
                      />
                    )}
                  </Chart>
                  {tab === "funnel" && (
                    <>
                      <Chart title="Etapas das novas oportunidades">
                        <DistributionChart
                          title="Oportunidades por etapa"
                          entries={countBy(cohort.map((entry) => entry.stage))}
                        />
                      </Chart>
                      <Chart title="Origem das novas oportunidades">
                        <DistributionChart
                          title="Origem das oportunidades"
                          entries={countBy(cohort.map((entry) => entry.origin))}
                          donut
                        />
                      </Chart>
                    </>
                  )}
                </section>
              )}
              {tab === "team" && (
                <>
                  <section className="commercial-bi-charts">
                    <Chart title="Receita por vendedor">
                      <RevenueBars
                        rows={ranking.map((row) => ({
                          name: row.name,
                          revenue: row.revenue,
                          sales: row.sales.length,
                        }))}
                      />
                    </Chart>
                    <Chart title="Novas oportunidades por vendedor">
                      <DistributionChart
                        title="Novas oportunidades por vendedor"
                        entries={ranking.map((row) => ({
                          label: row.name,
                          count: row.cohort.length,
                        }))}
                        unit="oportunidades"
                      />
                    </Chart>
                  </section>
                  <section className="commercial-team-table analytical-table-scroll">
                    <table>
                      <caption>Desempenho da equipe · {period.label}</caption>
                      <thead>
                        <tr>
                          <th>Vendedor</th>
                          <th>Entradas</th>
                          <th>Ganhos</th>
                          <th>Receita</th>
                          <th>Ticket médio</th>
                          <th>Conversão da entrada</th>
                          <th>Em aberto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {
                          <PaginatedItems label="registros comerciais" table>
                            {ranking.map((row) => (
                              <tr key={row.name}>
                                <th>{row.name}</th>
                                <td>{row.cohort.length}</td>
                                <td>
                                  <button
                                    className="indicator-cell-link"
                                    onClick={() =>
                                      setDrilldown({
                                        title: `Vendas de ${row.name}`,
                                        entries: row.sales,
                                      })
                                    }
                                  >
                                    {row.sales.length}
                                  </button>
                                </td>
                                <td>
                                  <button
                                    className="indicator-cell-link"
                                    onClick={() =>
                                      setDrilldown({
                                        title: `Receita de ${row.name}`,
                                        entries: row.sales,
                                      })
                                    }
                                  >
                                    {money(row.revenue)}
                                  </button>
                                </td>
                                <td>{money(row.ticket)}</td>
                                <td>{row.conversion}%</td>
                                <td>{row.open.length}</td>
                              </tr>
                            ))}
                          </PaginatedItems>
                        }
                        {!ranking.length && (
                          <tr>
                            <td colSpan={7}>
                              Sem movimentação no período selecionado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </section>
                  <section className="commercial-bi-charts">
                    <Chart title="Oportunidades que exigem atenção">
                      <div className="commercial-attention-counters">
                        <span>
                          <b>{stale.length}</b> sem atualização há mais de 7
                          dias
                        </span>
                        <span>
                          <b>{noContact.length}</b> sem contato registrado
                        </span>
                        <span>
                          <b>{hot.length}</b> oportunidades quentes
                        </span>
                      </div>
                      <OpportunityTable
                        entries={[
                          ...new Map(
                            [...stale, ...noContact, ...hot].map((entry) => [
                              entry.item.id,
                              entry,
                            ]),
                          ).values(),
                        ]}
                      />
                    </Chart>
                    <Chart
                      title={`Comparação com ${mode === "week" ? "a semana" : "o mês"} anterior`}
                    >
                      <div className="commercial-comparison">
                        {[
                          {
                            name: "Receita",
                            current: money(revenue),
                            previous: money(previous.revenue),
                            delta: percentageChange(revenue, previous.revenue),
                          },
                          {
                            name: "Ganhos",
                            current: sales.length,
                            previous: previous.sales.length,
                            delta: percentageChange(
                              sales.length,
                              previous.sales.length,
                            ),
                          },
                          {
                            name: "Novas oportunidades",
                            current: cohort.length,
                            previous: previous.cohort.length,
                            delta: percentageChange(
                              cohort.length,
                              previous.cohort.length,
                            ),
                          },
                        ].map((row) => (
                          <article key={row.name}>
                            <strong>{row.name}</strong>
                            <span>
                              {row.current}
                              <small>Anterior: {row.previous}</small>
                            </span>
                            <b>{delta(row.delta)}</b>
                          </article>
                        ))}
                      </div>
                    </Chart>
                  </section>
                </>
              )}
              {(tab === "totals" || tab === "direct") && (
                <div className="analytical-table-scroll">
                  <table>
                    <caption>Totais por origem · {period.label}</caption>
                    <thead>
                      <tr>
                        <th>Origem</th>
                        <th>Entradas</th>
                        <th>Vendas ganhas</th>
                        <th>Receita</th>
                        <th>Ticket médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {
                        <PaginatedItems label="registros comerciais" table>
                          {groups.map((row) => (
                            <tr key={row.name}>
                              <th>{row.name}</th>
                              <td>{row.report.cohort.length}</td>
                              <td>{row.report.sales.length}</td>
                              <td>{money(row.report.revenue)}</td>
                              <td>{money(row.report.ticket)}</td>
                            </tr>
                          ))}
                        </PaginatedItems>
                      }
                    </tbody>
                    <tfoot>
                      <tr>
                        <th>Total</th>
                        <td>{cohort.length}</td>
                        <td>{sales.length}</td>
                        <td>{money(revenue)}</td>
                        <td>{money(ticket)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              {(tab === "overview" || tab === "totals" || tab === "direct") && (
                <section className="commercial-sales-audit">
                  <h2>Vendas que compõem o total</h2>
                  <p>
                    Uma linha por venda ganha, com a data e o valor usados no
                    cálculo.
                  </p>
                  <div className="analytical-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th>Vendedor</th>
                          <th>CRM / origem</th>
                          <th>Data do ganho</th>
                          <th>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {
                          <PaginatedItems label="registros comerciais" table>
                            {sales.map((entry) => (
                              <tr key={entry.item.id}>
                                <td>
                                  {entry.item.customer_name || entry.item.title}
                                </td>
                                <td>{entry.seller}</td>
                                <td>{entry.funnel}</td>
                                <td>
                                  {entry.saleDate
                                    .split("-")
                                    .reverse()
                                    .join("/")}
                                </td>
                                <td>{money(entry.amount)}</td>
                              </tr>
                            ))}
                          </PaginatedItems>
                        }
                        {!sales.length && (
                          <tr>
                            <td colSpan={5}>
                              Nenhuma venda ganha neste recorte.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {tab === "overview" && (
                <CommercialGoalSummary
                  items={items}
                  catalogs={catalogs}
                  start={period.start}
                  end={period.end}
                  seller={seller}
                  funnel={funnel}
                />
              )}
            </>
          )}
        </section>
      </section>
      {drilldown && (
        <CommercialIndicatorClients
          title={drilldown.title}
          period={period.label}
          entries={drilldown.entries}
          onClose={() => setDrilldown(null)}
        />
      )}
    </main>
  );
}
function Chart({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article>
      <header>{title}</header>
      {children}
    </article>
  );
}
function RevenueBars({
  rows,
}: {
  rows: { name: string; revenue: number; sales: number }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.revenue));
  return (
    <div className="commercial-revenue-bars">
      {rows.map((row) => (
        <article key={row.name}>
          <header>
            <strong>{row.name}</strong>
            <b>{money(row.revenue)}</b>
          </header>
          <div
            role="img"
            aria-label={`${row.name}: ${money(row.revenue)}, ${row.sales} venda(s)`}
          >
            <i style={{ width: `${(row.revenue / max) * 100}%` }} />
          </div>
          <small>
            {row.sales} venda(s) ·{" "}
            {money(row.sales ? Math.round(row.revenue / row.sales) : 0)} de
            ticket médio
          </small>
        </article>
      ))}
      {!rows.length && <p>Sem vendas no período selecionado.</p>}
    </div>
  );
}
function OpportunityTable({
  entries,
}: {
  entries: CommercialAnalyticsEntry[];
}) {
  return (
    <div className="analytical-table-scroll">
      <table>
        <thead>
          <tr>
            <th>Oportunidade</th>
            <th>Responsável</th>
            <th>Etapa</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          {
            <PaginatedItems label="registros comerciais" table>
              {entries.map((entry) => (
                <tr key={entry.item.id}>
                  <td>{entry.item.title}</td>
                  <td>{entry.seller}</td>
                  <td>{entry.stage}</td>
                  <td>{money(entry.amount)}</td>
                </tr>
              ))}
            </PaginatedItems>
          }
          {!entries.length && (
            <tr>
              <td colSpan={4}>
                Nenhuma oportunidade exige atenção neste recorte.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
