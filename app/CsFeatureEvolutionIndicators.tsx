"use client";

import { useMemo, useState } from "react";
import DateRangeFilter from "@/app/DateRangeFilter";
import { RecordPageSize } from "@/app/PaginatedItems";
import { paginate } from "@/lib/pagination";
import SearchablePeopleSelect from "@/app/SearchablePeopleSelect";
import {
  csFeatureEvolution,
  filterCsFeatureEvolution,
} from "@/lib/cs-feature-evolution";
import "./cs-feature-evolution.css";

type Item = {
  id: string;
  title: string;
  customer_name?: string;
  owner: string;
  description?: string;
};
const deltaLabel = (delta: number) => `${delta > 0 ? "+" : ""}${delta} p.p.`;
export default function CsFeatureEvolutionIndicators({
  items,
}: {
  items: Item[];
}) {
  const [period, setPeriod] = useState("");
  const [responsible, setResponsible] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const rows = useMemo(() => csFeatureEvolution(items), [items]);
  const owners = [...new Set(rows.map((row) => row.responsible))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const visible = filterCsFeatureEvolution(rows, period, responsible, query);
  const paged = paginate(visible, page, pageSize);
  const clients = new Set(visible.map((row) => row.itemId)).size;
  const improved = visible.filter((row) => row.delta > 0).length;
  const collaborators = new Set(visible.map((row) => row.responsible)).size;
  return (
    <section
      className="cs-feature-evolution"
      aria-label="Histórico de evolução de features"
    >
      <div className="analytics-filter-row cs-feature-evolution-filters">
        <DateRangeFilter
          value={period}
          onChange={(value) => {
            setPeriod(value);
            setPage(1);
          }}
          label="Período da evolução"
          showClear={false}
        />
        <label>
          Responsável
          <SearchablePeopleSelect
            searchLabel="Responsável pela evolução"
            value={responsible}
            onChange={(event) => {
              setResponsible(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos os responsáveis</option>
            {owners.map((owner) => (
              <option key={owner}>{owner}</option>
            ))}
          </SearchablePeopleSelect>
        </label>
        <label>
          Pesquisar cliente ou autor
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Nome, ID ou quem registrou"
          />
        </label>
        <button
          className="secondary-button"
          onClick={() => {
            setPeriod("");
            setResponsible("all");
            setQuery("");
            setPage(1);
          }}
        >
          Limpar
        </button>
      </div>
      <p className="analytics-method-note">
        O período considera a data de cada alteração de features. O responsável
        é preservado no registro da evolução; em registros antigos sem essa
        informação, é usado o responsável atual do card. A coluna “Registrado
        por” identifica quem fez o ajuste.
      </p>
      <div className="operation-bi-kpis">
        {[
          ["Registros de evolução", visible.length],
          ["Clientes", clients],
          ["Evoluções positivas", improved],
          ["Responsáveis", collaborators],
        ].map(([label, value]) => (
          <article key={label}>
            <span>
              <small>{label}</small>
              <strong>{value}</strong>
            </span>
          </article>
        ))}
      </div>
      <RecordPageSize
        value={pageSize}
        onChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        label="evoluções de features"
      />
      <div className="analytics-table-scroll">
        <table className="analytics-data-table">
          <caption>Histórico de evolução de features por colaborador</caption>
          <thead>
            <tr>
              {[
                "Data",
                "Cliente / ID",
                "Acompanhamento",
                "Responsável",
                "Registrado por",
                "Score anterior",
                "Score registrado",
                "Evolução",
                "Base contratada",
                "Em uso",
                "Plus",
                "Resumo",
              ].map((label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.items.map((row) => (
              <tr key={row.id}>
                <td>
                  {new Date(row.snapshot.createdAt).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                </td>
                <td>
                  <strong>{row.clientName}</strong>
                  <small>{row.clientId}</small>
                </td>
                <td>{row.track}</td>
                <td>
                  {row.responsible}
                  {row.inferredResponsible && (
                    <small>Responsável atual · registro antigo</small>
                  )}
                </td>
                <td>{row.actor}</td>
                <td>{row.snapshot.previousScore}%</td>
                <td>{row.snapshot.score}%</td>
                <td>{deltaLabel(row.delta)}</td>
                <td>
                  {row.snapshot.featuresBase?.join(", ") || "Não informado"}
                </td>
                <td>{row.snapshot.featuresActive?.join(", ") || "Nenhuma"}</td>
                <td>{row.snapshot.featuresPlus?.join(", ") || "Nenhuma"}</td>
                <td>{row.snapshot.summary || "Alteração de features"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav
        className="record-pagination"
        aria-label="Páginas de evoluções de features"
      >
        <span role="status" aria-live="polite">
          {paged.start}–{paged.end} de {paged.total} evoluções
        </span>
        <div>
          <button
            type="button"
            disabled={paged.page <= 1}
            onClick={() => setPage(paged.page - 1)}
          >
            Anterior
          </button>
          <span aria-label={`Página ${paged.page} de ${paged.pages}`}>
            {paged.page}/{paged.pages}
          </span>
          <button
            type="button"
            disabled={paged.page >= paged.pages}
            onClick={() => setPage(paged.page + 1)}
          >
            Seguinte
          </button>
        </div>
      </nav>
      {!visible.length && (
        <p className="empty-copy" role="status">
          Nenhuma evolução de features para os filtros selecionados.
        </p>
      )}
    </section>
  );
}
