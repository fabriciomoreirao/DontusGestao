"use client";
import { BarChart3, Building2, CalendarDays, CheckCircle2, History, RefreshCw, UsersRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { dontusIntegrationApi as api } from "@/lib/dontus-integration-api";
import { supportAccessQuery, type AccessFilters } from "@/lib/support-access-indicators";
import { AccessPanelHeading, type SupportAccessReason } from "./SupportAccessPanels";
import SupportAccessFilters from "./SupportAccessFilters";
import { DistributionChart, TrendChart } from "./AnalyticsCharts";

type Metric={key:string;label:string;count:number};
type Indicators={total:number;clients:number;collaborators:number;reasons:number;averagePerDay:number;activeDays:number;from:string;to:string;firstAccessAt:string|null;lastAccessAt:string|null;granularity:"day"|"month"|"year";trend:Metric[];byResponsible:Metric[];byReason:Metric[];byClient:Metric[];byHour:Metric[];byWeekday:Metric[]};
type Props={filters:AccessFilters;applied:AccessFilters;onFilters:(value:AccessFilters)=>void;onApply:(event:FormEvent)=>void;onClear:()=>void;onBack:()=>void;responsible:{email:string;name:string}[];reasons:SupportAccessReason[];validationError:string};
const date=(value:string)=>value.split("-").reverse().join("/");
const stamp=(value:string|null)=>value?new Date(value).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"—";
export default function SupportAccessIndicators({filters,applied,onFilters,onApply,onClear,onBack,responsible,reasons,validationError}:Props){
 const [data,setData]=useState<Indicators|null>(null);const [busy,setBusy]=useState(true);const [error,setError]=useState("");const [revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();setBusy(true);setError("");void api<Indicators>(`access/indicators?${supportAccessQuery(applied)}`,undefined,controller.signal).then(result=>{if(!controller.signal.aborted)setData(result)}).catch(error=>{if(!controller.signal.aborted){setData(null);setError(error instanceof Error?error.message:"Não foi possível carregar os indicadores.")}}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});return()=>controller.abort()},[applied,revision]);
 const bars=(rows:Metric[])=>rows.map(row=>({label:row.label,count:row.count}));
 return <section className="support-access-page support-access-indicators" aria-busy={busy}>
   <AccessPanelHeading title="Indicadores de acesso" onBack={onBack} backLabel="Voltar ao histórico de acesso" actions={<button type="button" className="secondary-button" onClick={()=>setRevision(value=>value+1)} disabled={busy}><RefreshCw size={17} aria-hidden="true"/>Atualizar</button>}>Volume de acessos, motivos e utilização por colaborador. Horários de Brasília.</AccessPanelHeading>
   <section className="support-access-panel"><div className="support-access-title"><BarChart3 size={18} aria-hidden="true"/>Análise dos acessos às bases</div><SupportAccessFilters filters={filters} onChange={onFilters} onApply={onApply} onClear={onClear} responsible={responsible} reasons={reasons} busy={busy}/>{validationError&&<p className="dontus-integration-error" role="alert">{validationError}</p>}</section>
   {busy?<div className="access-indicator-loading" role="status"><span>Carregando indicadores de todo o período…</span><div>{[0,1,2,3].map(value=><i key={value}/>)}</div></div>:error?<section className="support-access-panel access-indicator-empty" role="alert"><h2>Não foi possível consultar os acessos</h2><p>{error}</p><button type="button" className="primary-button" onClick={()=>setRevision(value=>value+1)}>Tentar novamente</button></section>:data&&<>
   <div className="access-indicator-period"><span><CalendarDays size={17} aria-hidden="true"/>{date(data.from)} a {date(data.to)}</span><span><CheckCircle2 size={16} aria-hidden="true"/>Todos os registros que correspondem aos filtros</span></div>
   <section className="access-indicator-kpis" aria-label="Resumo dos acessos">
     <article><span className="access-metric-icon"><History aria-hidden="true"/></span><div><small>Acessos registrados</small><strong>{data.total.toLocaleString("pt-BR")}</strong><p>{data.averagePerDay.toLocaleString("pt-BR",{maximumFractionDigits:2})} acessos por dia no período</p></div></article>
     <article><span className="access-metric-icon"><Building2 aria-hidden="true"/></span><div><small>Clientes acessados</small><strong>{data.clients.toLocaleString("pt-BR")}</strong><p>Bases distintas consultadas</p></div></article>
     <article><span className="access-metric-icon"><UsersRound aria-hidden="true"/></span><div><small>Colaboradores</small><strong>{data.collaborators.toLocaleString("pt-BR")}</strong><p>Responsáveis com acessos registrados</p></div></article>
     <article><span className="access-metric-icon"><BarChart3 aria-hidden="true"/></span><div><small>Motivos utilizados</small><strong>{data.reasons.toLocaleString("pt-BR")}</strong><p>{data.activeDays} dia(s) com acessos</p></div></article>
   </section>
   {data.total===0?<section className="support-access-panel access-indicator-empty"><BarChart3 size={36} aria-hidden="true"/><h2>Nenhum acesso neste recorte</h2><p>Ajuste o período, responsável, motivo ou identificação do cliente para consultar outros registros.</p></section>:<>
   <section className="access-indicator-charts"><article className="support-access-panel access-chart-wide"><header><h2>Evolução dos acessos</h2><p>{data.granularity==="day"?"Quantidade por dia":data.granularity==="month"?"Quantidade por mês":"Quantidade por ano"}, incluindo períodos sem acessos.</p></header><TrendChart title="Acessos ao longo do período" entries={data.trend.map(entry=>({label:entry.label,value:entry.count}))} unit="acessos"/></article>
     <article className="support-access-panel"><header><h2>Acessos por responsável</h2><p>Distribuição dos acessos entre os colaboradores.</p></header><DistributionChart title="Acessos por responsável" entries={bars(data.byResponsible)} unit="acessos"/></article>
     <article className="support-access-panel"><header><h2>Motivos de acesso</h2><p>Motivos registrados no momento de cada acesso.</p></header><DistributionChart title="Acessos por motivo" entries={bars(data.byReason)} unit="acessos" donut/></article>
     <article className="support-access-panel"><header><h2>Clientes mais acessados</h2><p>Identificação da base e quantidade de acessos.</p></header><DistributionChart title="Acessos por cliente" entries={bars(data.byClient)} unit="acessos"/></article>
     <article className="support-access-panel"><header><h2>Distribuição na semana</h2><p>Dia da semana em que o acesso foi registrado.</p></header><DistributionChart title="Acessos por dia da semana" entries={bars(data.byWeekday)} unit="acessos"/></article>
     <article className="support-access-panel access-chart-wide"><header><h2>Horários com maior movimento</h2><p>Distribuição por hora, no horário de Brasília.</p></header><TrendChart title="Acessos por horário" entries={data.byHour.map(entry=>({label:entry.label,value:entry.count}))} unit="acessos"/></article>
   </section><footer className="access-indicator-footnote"><span>Primeiro acesso: {stamp(data.firstAccessAt)}</span><span>Último acesso: {stamp(data.lastAccessAt)}</span></footer></>}
   </>}
 </section>;
}
