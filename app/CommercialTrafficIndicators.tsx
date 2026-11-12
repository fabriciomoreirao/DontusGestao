"use client";

import {useEffect,useState} from "react";
import {Activity,CheckCircle2,Clock3,Gauge,Target,TrendingUp,UsersRound,WalletCards} from "lucide-react";
import {DistributionChart,TrendChart} from "@/app/AnalyticsCharts";
import {paidTrafficCohort} from "@/lib/paid-traffic-indicators";
import {commercialSaleDate} from "@/lib/commercial-indicators";

type Entry=ReturnType<typeof paidTrafficCohort>[number];
const money=(cents:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100);
const date=(value:string)=>value?commercialSaleDate({saleDate:value},value).split("-").reverse().join("/"):"Em aberto";
const outcomeLabels:Record<string,string>={converted:"Venda realizada",lost:"Perdido",disqualified:"Desqualificado",qualified:"Em negociação",pending:"Aguardando qualificação"};
function counts(entries:Entry[],label:(entry:Entry)=>string){
  const values=new Map<string,number>();for(const entry of entries){const name=label(entry);values.set(name,(values.get(name)||0)+1);}
  return [...values].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count);
}

export default function CommercialTrafficIndicators({entries}:{entries:Entry[]}){
  const [limit,setLimit]=useState(40);
  useEffect(()=>setLimit(40),[entries]);
  const converted=entries.filter(entry=>entry.converted),qualified=entries.filter(entry=>entry.qualified),disqualified=entries.filter(entry=>entry.disqualified);
  const revenue=converted.reduce((sum,entry)=>sum+entry.revenueCents,0);
  const closingDays=converted.flatMap(entry=>entry.daysToClose===null?[]:[entry.daysToClose]);
  const ratio=(value:number)=>`${entries.length?Math.round(value/entries.length*100):0}%`;
  const active=entries.filter(entry=>entry.outcome==="qualified"||entry.outcome==="pending");
  const kpis=[
    {label:"Leads recebidos",value:entries.length,note:"Entradas no período selecionado",icon:UsersRound},
    {label:"Qualificados",value:qualified.length,note:`${ratio(qualified.length)} passaram pela qualificação`,icon:CheckCircle2},
    {label:"Desqualificados",value:disqualified.length,note:`${ratio(disqualified.length)} dos leads recebidos`,icon:Target},
    {label:"Vendas geradas",value:converted.length,note:"Ganhos na origem ou em outro CRM",icon:TrendingUp},
    {label:"Taxa de conversão",value:ratio(converted.length),note:"Vendas ÷ leads recebidos",icon:Gauge},
    {label:"Receita atribuída",value:money(revenue),note:`Ticket médio: ${money(Math.round(revenue/Math.max(1,converted.length)))}`,icon:WalletCards},
    {label:"Em acompanhamento",value:active.length,note:"Aguardando qualificação ou negociação",icon:Activity},
    {label:"Tempo médio até venda",value:closingDays.length?`${Math.round(closingDays.reduce((a,b)=>a+b,0)/closingDays.length)} dias`:"—",note:"Da entrada do lead ao fechamento",icon:Clock3},
  ];
  const campaign=(entry:Entry)=>String(entry.detail.campaignName||"Sem campanha");
  const weeks=Array.from({length:5},(_,index)=>({label:`${index+1}ª semana`,value:entries.filter(entry=>Math.min(5,Math.ceil(Number(entry.date.slice(8,10))/7))===index+1).length}));
  const campaignRevenue=new Map<string,number>();for(const entry of converted)campaignRevenue.set(campaign(entry),(campaignRevenue.get(campaign(entry))||0)+entry.revenueCents);
  return <section className="commercial-traffic-indicators">
    <p className="traffic-period-note">Leads que entraram no período selecionado. A conversão e a receita acompanham o resultado nos outros CRMs, contando cada lead uma vez.</p>
    <section className="traffic-kpis" aria-label="Resumo dos indicadores de tráfego">{kpis.map(kpi=>{const Icon=kpi.icon;return <article key={kpi.label}><span className="traffic-kpi-icon"><Icon size={18}/></span><small>{kpi.label}</small><strong>{kpi.value}</strong><span className="traffic-kpi-note">{kpi.note}</span></article>})}</section>
    <section className="commercial-bi-charts traffic-charts">
      <article><header>Entrada de leads por semana</header><TrendChart title="Leads recebidos por semana" entries={weeks} unit="leads"/></article>
      <article><header>Situação atual dos leads</header><DistributionChart title="Situação dos leads de tráfego" entries={counts(entries,entry=>outcomeLabels[entry.outcome])} unit="leads" donut/></article>
      <article><header>Leads por campanha</header><DistributionChart title="Leads por campanha" entries={counts(entries,campaign)} unit="leads"/></article>
      <article><header>Distribuição por região</header><DistributionChart title="Leads por região" entries={counts(entries,entry=>String(entry.detail.region||"Não informada"))} unit="leads" donut/></article>
      <article><header>Receita por campanha</header><TrendChart title="Receita atribuída às campanhas" entries={[...campaignRevenue].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value)} currency/></article>
      <article><header>Leads por responsável</header><DistributionChart title="Leads por responsável" entries={counts(entries,entry=>entry.seller)} unit="leads"/></article>
    </section>
    <div className="commercial-totals-table traffic-leads-table"><table><caption>Detalhamento dos leads de tráfego</caption><thead><tr><th>Lead</th><th>CRM de origem</th><th>Campanha</th><th>Região</th><th>Responsável</th><th>Situação</th><th>Entrada</th><th>Fechamento</th><th>Receita</th></tr></thead><tbody>{entries.slice(0,limit).map(entry=><tr key={entry.id}><th scope="row">{entry.item.title}</th><td>{entry.originFunnel}</td><td>{campaign(entry)}</td><td>{String(entry.detail.region||"Não informada")}</td><td>{entry.seller}</td><td>{outcomeLabels[entry.outcome]}</td><td>{date(entry.date)}</td><td>{date(entry.closedAt)}</td><td>{entry.converted?money(entry.revenueCents):"—"}</td></tr>)}{!entries.length&&<tr><td colSpan={9}>Nenhum lead de tráfego no período e filtros selecionados.</td></tr>}</tbody></table>{entries.length>limit&&<button type="button" className="secondary-button" onClick={()=>setLimit(value=>value+40)}>Ver mais leads ({entries.length-limit})</button>}</div>
  </section>;
}
