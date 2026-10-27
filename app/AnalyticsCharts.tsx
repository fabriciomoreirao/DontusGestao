"use client";

import { useId, useState, type CSSProperties } from "react";
import { BarChart3, ChevronDown, TrendingUp } from "lucide-react";
import { analyticsColor, chartScale, distributionEntries } from "@/lib/analytics-charts";

type Entry = { label: string; count: number };
const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(value / 100);
const share = (part: number, total: number) => `${(total ? part / total * 100 : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function TrendChart({ entries, title, currency = false, unit = "registros" }: {
  entries: Array<{ label: string; value: number }>; title: string; currency?: boolean; unit?: string;
}) {
  const id = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);
  const format = currency ? money : number;
  const data = entries.map(entry => ({ ...entry, value: Number.isFinite(entry.value) ? Math.max(0, entry.value) : 0 }));
  const scale = chartScale(data.map(entry => entry.value));
  const compact = scale.maximum >= (currency ? 10_000_000 : 10_000);
  const axisFormat = (value: number) => compact ? new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1,
    ...(currency ? { style: "currency", currency: "BRL" } : {}) }).format(currency ? value / 100 : value) : format(value);
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const peak = data.reduce<typeof data[number] | null>((best, entry) => !best || entry.value > best.value ? entry : best, null);
  const left = currency ? 100 : 58, right = 22, top = 34, bottom = 240, width = 720;
  const step = (width - left - right) / Math.max(1, data.length);
  const x = (index: number) => left + (index + 0.5) * step;
  const y = (value: number) => bottom - value / scale.maximum * (bottom - top);
  const points = data.map((entry, index) => `${x(index)},${y(entry.value)}`).join(" ");
  const area = data.length ? `M${x(0)},${bottom} L${data.map((entry, index) => `${x(index)},${y(entry.value)}`).join(" L")} L${x(data.length - 1)},${bottom} Z` : "";
  return <div className="bi-trend-detail">
    <div className="bi-chart-summary"><span><small>TOTAL NO GRÁFICO</small><strong>{format(total)}{!currency && <em>{unit}</em>}</strong></span><span><TrendingUp size={16} /><small>Pico: <b>{peak && total ? `${peak.label} · ${format(peak.value)}` : "sem movimentação"}</b></small></span></div>
    <div className="bi-plot-scroll"><svg className="bi-trend-svg" viewBox="0 0 720 284" role="img" aria-labelledby={`${id}-title`}>
      <title id={`${id}-title`}>{title}. Total: {format(total)} {currency ? "" : unit}. Consulte os valores na tabela abaixo.</title>
      <defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity=".22" /><stop offset="100%" stopColor="#2563eb" stopOpacity=".02" /></linearGradient></defs>
      {scale.ticks.map(tick => <g key={tick}><line className="bi-grid-line" x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} /><text className="bi-axis-label" x={left - 12} y={y(tick) + 4} textAnchor="end">{axisFormat(tick)}</text></g>)}
      {area && <path d={area} fill={`url(#${id}-fill)`} />}
      {data.map((entry, index) => <g key={`${entry.label}-${index}`} tabIndex={0} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}>
        <title>{entry.label}: {format(entry.value)} {currency ? "" : unit}</title>
        <rect className={`bi-chart-column ${active === index ? "active" : ""}`} x={x(index) - Math.min(30, step * .28)} y={y(entry.value)} width={Math.min(60, step * .56)} height={bottom - y(entry.value)} rx="5" />
        <text className="bi-value-label" x={x(index)} y={y(entry.value) - 12} textAnchor="middle">{axisFormat(entry.value)}</text>
        <text className="bi-axis-label" x={x(index)} y={bottom + 27} textAnchor="middle">{entry.label}</text>
        <rect fill="transparent" x={x(index) - step / 2} y={top} width={step} height={bottom - top + 34} />
      </g>)}
      {data.length > 1 && <polyline points={points} className="bi-chart-line" />}
      {data.map((entry, index) => <circle key={index} cx={x(index)} cy={y(entry.value)} r={active === index ? 6 : 4} className="bi-chart-point" />)}
    </svg></div>
    <div className="bi-chart-footnote" aria-live="polite"><span className="bi-series-key"><i />{title}</span><span>{active === null ? `Base: ${data.length} período(s) · eixo em ${currency ? "reais (R$)" : unit}` : `${data[active].label}: ${format(data[active].value)} ${currency ? "" : unit}`}</span></div>
    <ChartData title={title} rows={data.map(entry => [entry.label, format(entry.value)])} headers={["Período", currency ? "Receita" : "Quantidade"]} />
  </div>;
}

export function DistributionChart({ entries, title, unit = "registros", donut = false }: { entries: Entry[]; title: string; unit?: string; donut?: boolean }) {
  const rows = distributionEntries(entries);
  const total = rows.reduce((sum, entry) => sum + entry.count, 0);
  const max = Math.max(1, ...rows.map(entry => entry.count));
  let cursor = 0;
  const segments = rows.map((entry, index) => { const start = cursor; cursor += entry.count / total * 100; return `${analyticsColor(entry.label, index)} ${start}% ${cursor}%`; });
  if (!total) return <div className="bi-chart-empty"><BarChart3 size={32} /><strong>Sem dados neste recorte</strong><p>Selecione outro período ou ajuste os filtros para analisar a distribuição.</p></div>;
  return <div className="bi-distribution-detail">
    <div className={`bi-distribution-layout ${donut ? "with-donut" : ""}`}>
      {donut && <div className="bi-donut" role="img" aria-label={`${title}: ${number(total)} ${unit}`} style={{ background: `conic-gradient(${segments.join(",")})` }}><span><strong>{number(total)}</strong><small>{unit}</small></span></div>}
      <div className="bi-ranked-bars"><div className="bi-ranked-heading"><span>Categoria</span><span>Quantidade / participação</span></div>{rows.map((entry, index) => <div className="bi-ranked-entry" key={entry.label} style={{ "--series-color": analyticsColor(entry.label, index) } as CSSProperties}>
        <div><span><i />{entry.label}</span><strong>{number(entry.count)}<em>{share(entry.count, total)}</em></strong></div>
        <div className="bi-bar-track" role="img" aria-label={`${entry.label}: ${number(entry.count)} ${unit}, ${share(entry.count, total)} do total`}><i style={{ width: `${entry.count / max * 100}%` }} /></div>
      </div>)}</div>
    </div>
    <p className="bi-chart-footnote">Participação no total do gráfico · base de {number(total)} {unit}. {rows[0] && <span>Maior volume: <b>{rows[0].label}</b> ({share(rows[0].count, total)}).</span>}</p>
    <ChartData title={title} headers={["Categoria", "Quantidade", "Participação"]} rows={rows.map(entry => [entry.label, number(entry.count), share(entry.count, total)])} />
  </div>;
}

function ChartData({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return <details className="bi-chart-data"><summary>Ver dados do gráfico<ChevronDown size={14} /></summary><div><table><caption>{title}</caption><thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => column === 0 ? <th key={column} scope="row">{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div></details>;
}
