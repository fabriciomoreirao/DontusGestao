"use client";

import PaginatedItems from "@/app/PaginatedItems";
import DateRangeFilter from "@/app/DateRangeFilter";
import "./retention-indicators.css";
import { useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock3,
  Filter,
  Gauge,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import SearchablePeopleSelect from "@/app/SearchablePeopleSelect";
import IndicatorTabs from "@/app/IndicatorTabs";
import { DistributionChart } from "@/app/AnalyticsCharts";
import { useFieldIndicatorAnalysis } from "@/app/FieldIndicatorAnalysis";
import {
  retentionEntries,
  matchesRetentionPeriod,
  summarizeRetention,
  type RetentionEntry,
} from "@/lib/retention-indicators";
type Item = RetentionEntry["item"];
const percent = (part: number, total: number) =>
  total ? `${Math.round((part / total) * 100)}%` : "0%";
export default function RetentionIndicatorsBoard({
  title,
  contextKey,
  items,
  catalogs = [],
  initialPeriod = "",
  onClose,
}: {
  title: string;
  contextKey: string;
  items: Item[];
  catalogs?: Array<{ catalog: string; name: string; description: string }>;
  initialPeriod?: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "versions" | "team" | "fields">(
    "overview",
  );
  const [period, setPeriod] = useState(initialPeriod);
  const [owner, setOwner] = useState("all");
  const [version, setVersion] = useState("all");
  const [crm, setCrm] = useState("all");
  const flowEntries = useMemo(
    () => retentionEntries(items, contextKey, catalogs),
    [items, contextKey, catalogs],
  );
  const crmOptions = [
    ...new Set(
      flowEntries.map((entry) => String(entry.detail.funnel || "Sem CRM")),
    ),
  ];
  const rawEntries = useMemo(
    () => flowEntries.filter((entry) => crm === "all" || entry.crm === crm),
    [flowEntries, crm],
  );
  const fieldRecords = useMemo(
    () => rawEntries.map((entry) => entry.item),
    [rawEntries],
  );
  const fieldAnalysis = useFieldIndicatorAnalysis(fieldRecords);
  const { matches } = fieldAnalysis;
  const all = useMemo(
    () => rawEntries.filter((entry) => matches(entry.item)),
    [rawEntries, matches],
  );
  const scoped = useMemo(
    () =>
      all.filter(
        (entry) =>
          matchesRetentionPeriod(entry, period) &&
          (owner === "all" || entry.seller === owner) &&
          (version === "all" || entry.version === version),
      ),
    [all, period, owner, version],
  );
  const report = useMemo(() => summarizeRetention(scoped), [scoped]);
  const {
    total,
    success,
    failure,
    process,
    conversion,
    versionRows,
    ownerRows,
    funnel,
  } = report;
  const versions = useMemo(
    () => [...new Set(all.map((entry) => entry.version))].sort(),
    [all],
  );
  const owners = useMemo(
    () => [...new Set(all.map((entry) => entry.seller))].sort(),
    [all],
  );
  const maxOwner = Math.max(1, ...ownerRows.map((entry) => entry.total));
  return (
    <main
      className="operation-bi-page cancellation-bi-style"
      aria-labelledby="operation-bi-title"
    >
      <section className="operation-bi-board retention-bi-board">
        <header>
          <div>
            <span className="operation-bi-mark">
              <TrendingUp />
            </span>
            <span>
              <small>INDICADORES · CRM RETENÇÃO</small>
              <h1 id="operation-bi-title">{title}</h1>
              <p>
                Análise de conversão, desempenho do funil, versões e
                responsáveis.
              </p>
            </span>
          </div>
          <button
            className="operation-bi-back"
            onClick={onClose}
            aria-label="Voltar para CRM Retenção"
          >
            <ArrowLeft />
            <span>Voltar</span>
          </button>
        </header>
        <section className="operation-bi-filters retention-bi-filters">
          <Filter />
          <label>
            CRM
            <select
              aria-label="Filtrar indicadores de retenção por CRM"
              value={crm}
              onChange={(event) => setCrm(event.target.value)}
            >
              <option value="all">Todos os CRMs</option>
              {crmOptions.sort().map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <DateRangeFilter
            value={period}
            onChange={setPeriod}
            label="Período dos indicadores de retenção"
            showClear={false}
          />
          <label>
            Responsável
            <SearchablePeopleSelect
              searchLabel="Responsável"
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
            >
              <option value="all">Todos</option>
              {owners.map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </SearchablePeopleSelect>
          </label>
          <label>
            Versão
            <select
              value={version}
              onChange={(event) => setVersion(event.target.value)}
            >
              <option value="all">Todas</option>
              {versions.map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              setPeriod("");
              setOwner("all");
              setVersion("all");
              setCrm("all");
            }}
          >
            Limpar
          </button>
          <strong>{total} cliente(s)</strong>
        </section>
        <IndicatorTabs
          id="retention"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "overview", label: "Visão geral" },
            { id: "versions", label: "Versões" },
            { id: "team", label: "Responsáveis" },
            { id: "fields", label: "Campos preenchidos" },
          ]}
        />
        <p className="analytics-method-note">
          O período considera a criação ou a última atualização do card, como no
          kanban. Sucesso inclui a etapa de envio para onboarding, as etapas
          configuradas como ganho e os encaminhamentos registrados.
        </p>
        <section
          role="tabpanel"
          id={`retention-panel-${tab}`}
          aria-labelledby={`retention-tab-${tab}`}
          className="indicator-panel"
        >
          {tab === "fields" &&
            fieldAnalysis.panel(scoped.map((entry) => entry.item))}
          {tab === "overview" && (
            <>
              <section className="retention-bi-kpis">
                <article className="total">
                  <span>
                    <UsersRound />
                  </span>
                  <small>Total</small>
                  <strong>{total}</strong>
                  <em>clientes no funil</em>
                </article>
                <article className="process">
                  <span>
                    <Activity />
                  </span>
                  <small>Em processo</small>
                  <strong>{process}</strong>
                  <em>{percent(process, total)} do total</em>
                </article>
                <article className="success">
                  <span>
                    <CheckCircle2 />
                  </span>
                  <small>Sucesso</small>
                  <strong>{success}</strong>
                  <em>{percent(success, total)} do total</em>
                </article>
                <article className="failure">
                  <span>
                    <Clock3 />
                  </span>
                  <small>Sem sucesso</small>
                  <strong>{failure}</strong>
                  <em>{percent(failure, total)} do total</em>
                </article>
                <article className="conversion">
                  <span>
                    <Gauge />
                  </span>
                  <small>Conversão</small>
                  <strong>
                    {conversion.toLocaleString("pt-BR", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                    %
                  </strong>
                  <em>sucesso sobre o total</em>
                </article>
              </section>
              <section className="retention-bi-panel retention-funnel-panel">
                <header>
                  <span>
                    <BarChart3 />
                    Distribuição no funil
                  </span>
                  <b>QUANTIDADE E PARTICIPAÇÃO</b>
                </header>
                <DistributionChart
                  title="Etapas do funil de retenção"
                  entries={funnel}
                  unit="clientes"
                  donut
                />
              </section>
            </>
          )}
          {tab === "versions" && (
            <section className="retention-bi-panel retention-version-panel">
              <header>
                <span>
                  <BarChart3 />
                  Distribuição por versão
                </span>
                <b>{versionRows.length} versão(ões)</b>
              </header>
              <div className="retention-bi-table">
                <div className="head">
                  <span>Versão</span>
                  <span>Total</span>
                  <span>Em processo</span>
                  <span>Sucesso</span>
                  <span>Sem sucesso</span>
                  <span>Conversão</span>
                </div>
                {versionRows.length ? (
                  <PaginatedItems label="registros de retenção">
                    {versionRows.map((entry) => (
                      <div key={entry.name}>
                        <strong>{entry.name}</strong>
                        <b>{entry.total}</b>
                        <span>{entry.process}</span>
                        <span className="positive">{entry.success}</span>
                        <span className="negative">{entry.failure}</span>
                        <em>
                          {entry.conversion.toLocaleString("pt-BR", {
                            maximumFractionDigits: 1,
                          })}
                          %
                        </em>
                      </div>
                    ))}
                  </PaginatedItems>
                ) : (
                  <p>Sem dados de versão para o filtro atual.</p>
                )}
              </div>
            </section>
          )}
          {tab === "team" && (
            <section className="retention-bi-bottom">
              <article className="retention-bi-panel">
                <header>
                  <span>
                    <UsersRound />
                    Conversão por responsável
                  </span>
                  <b>{ownerRows.length} responsável(is)</b>
                </header>
                <div className="retention-owner-bars">
                  {ownerRows.length ? (
                    ownerRows.map((entry) => (
                      <div key={entry.name}>
                        <strong>{entry.name}</strong>
                        <span>
                          <i
                            className="process"
                            style={{
                              width: `${(entry.process / maxOwner) * 100}%`,
                            }}
                          />
                          <i
                            className="success"
                            style={{
                              width: `${(entry.success / maxOwner) * 100}%`,
                            }}
                          />
                          <i
                            className="failure"
                            style={{
                              width: `${(entry.failure / maxOwner) * 100}%`,
                            }}
                          />
                        </span>
                        <b>
                          {entry.conversion.toLocaleString("pt-BR", {
                            maximumFractionDigits: 1,
                          })}
                          %
                        </b>
                      </div>
                    ))
                  ) : (
                    <p>Sem responsáveis no filtro atual.</p>
                  )}
                  <footer>
                    <span>
                      <i className="process" />
                      Em processo
                    </span>
                    <span>
                      <i className="success" />
                      Sucesso
                    </span>
                    <span>
                      <i className="failure" />
                      Sem sucesso
                    </span>
                  </footer>
                </div>
              </article>
              <article className="retention-bi-panel">
                <header>
                  <span>
                    <UsersRound />
                    Detalhamento por responsável
                  </span>
                  <b>{total} cliente(s)</b>
                </header>
                <div className="retention-bi-table owner-table">
                  <div className="head">
                    <span>Responsável</span>
                    <span>Total</span>
                    <span>Processo</span>
                    <span>Sucesso</span>
                    <span>Sem sucesso</span>
                    <span>Conversão</span>
                  </div>
                  {ownerRows.length ? (
                    <PaginatedItems label="registros de retenção">
                      {ownerRows.map((entry) => (
                        <div key={entry.name}>
                          <strong>{entry.name}</strong>
                          <b>{entry.total}</b>
                          <span>{entry.process}</span>
                          <span className="positive">{entry.success}</span>
                          <span className="negative">{entry.failure}</span>
                          <em>
                            {entry.conversion.toLocaleString("pt-BR", {
                              maximumFractionDigits: 1,
                            })}
                            %
                          </em>
                        </div>
                      ))}
                    </PaginatedItems>
                  ) : (
                    <p>Sem dados para detalhar.</p>
                  )}
                </div>
              </article>
            </section>
          )}
        </section>
      </section>
    </main>
  );
}
