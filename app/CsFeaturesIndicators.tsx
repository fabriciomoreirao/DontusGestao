"use client";
import { useState } from 'react';
import PaginatedItems from '@/app/PaginatedItems';
import { TrendChart } from '@/app/AnalyticsCharts';
import { parseJourney } from '@/app/CustomerSuccessJourneyModule';
import { csPhaseLabels, featureNames, featureProgress } from '@/lib/followup-feature-analytics';

type Item={id:string;title:string;customer_name?:string;owner:string;description?:string};
type Catalog={catalog:string;name:string;description:string;active:boolean};
export default function CsFeaturesIndicators({items,catalogs=[]}:{items:Item[];catalogs?:Catalog[]}) {
  const [phase,setPhase]=useState('all');
  const [query,setQuery]=useState('');
  const defaultBase=featureNames(catalogs.filter(c=>{
    if(!c.active)return false;
    if(c.catalog==='csFeatureBase')return true;
    try{return ['csFeature','csFeatureActive','csFeaturePlus'].includes(c.catalog)&&JSON.parse(c.description||'{}').featureBase===true}catch{return false}
  }).map(c=>c.name));
  const rows=items.flatMap(item=>{const journey=parseJourney(item.description||'');return journey?[{item,journey,progress:featureProgress(journey,defaultBase)}]:[]});
  const visible=rows.filter(({item,journey})=>(phase==='all'||journey.phase===phase)&&(!query||`${item.title} ${item.customer_name} ${journey.clientId} ${item.owner}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))));
  const informed=visible.filter(r=>r.progress.adoption!==null);
  const evolved=visible.filter(r=>(r.progress.delta??0)>0);
  const snapshots=visible.flatMap(r=>r.progress.history);
  const months=[...new Set(snapshots.map(s=>s.createdAt.slice(0,7)))].sort();
  const features=[...new Set(visible.flatMap(r=>[...r.progress.base,...r.progress.active]))];
  return <section className="cs-features-indicators">
    <div className="analytics-filter-row"><label>Pesquisar cliente<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nome, ID ou responsável"/></label><label>Etapa<select value={phase} onChange={e=>setPhase(e.target.value)}><option value="all">Todas as etapas</option>{Object.entries(csPhaseLabels).map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></label><strong>{visible.length} cliente(s)</strong></div>
    <div className="operation-bi-kpis">{[['Clientes',visible.length,'Todas as etapas do recorte'],['Uso das features base',informed.length?`${Math.round(informed.reduce((s,r)=>s+(r.progress.adoption??0),0)/informed.length)}%`:'—',`${informed.length} cliente(s) com base informada`],['Clientes em evolução',evolved.length,'Score maior que o início do histórico'],['Registros de evolução',snapshots.length,'Alterações de features salvas']].map(([label,value,note])=><article key={label}><span><small>{label}</small><strong>{value}</strong><em>{note}</em></span></article>)}</div>
    <div className="analytics-chart-grid"><section className="analytics-chart-panel"><h3>Adoção de funcionalidades</h3><div className="feature-adoption-bars">{features.map(label=>{const count=visible.filter(r=>r.progress.active.some(f=>f.toLocaleLowerCase("pt-BR")===label.toLocaleLowerCase("pt-BR"))).length;const percent=visible.length?Math.round(count/visible.length*100):0;return <div key={label}><span>{label}</span><strong>{percent}% · {count}/{visible.length} clientes</strong><progress value={percent} max={100} aria-label={`${label}: ${percent}% dos clientes`}/></div>})}{!features.length&&<p>Nenhuma funcionalidade informada neste recorte.</p>}</div></section><section className="analytics-chart-panel"><h3>Evolução dos scores registrados</h3>{months.length?<TrendChart aggregation="average" title="Score médio dos registros de evolução" unit="% de score registrado" entries={months.map(month=>{const records=snapshots.filter(s=>s.createdAt.startsWith(month));return {label:month.split('-').reverse().join('/'),value:Math.round(records.reduce((s,r)=>s+r.score,0)/records.length)}})}/>:<p>Sem histórico de evolução registrado neste recorte.</p>}</section></div>
    <div className="analytics-table-scroll"><table className="analytics-data-table"><thead><tr>{['Cliente / ID','Acompanhamento','Etapa','Responsável','Features base','Em uso','Plus','Uso da base','Score','Evolução','Próximas funcionalidades / histórico'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody><PaginatedItems table label="clientes" resetKey={`${phase}:${query}`}>{visible.map(({item,journey,progress:p})=><tr key={item.id}><td><strong>{item.customer_name||item.title}</strong><small>{journey.clientId||item.id}</small></td><td>{journey.track==='retention'?'Retenção':'Ativação'}</td><td>{csPhaseLabels[journey.phase]||journey.phase}</td><td>{item.owner||'Não atribuído'}</td><td>{p.base.join(', ')||'Não informado'}</td><td>{p.active.join(', ')||'Nenhuma'}</td><td>{p.plus.join(', ')||'Nenhuma'}</td><td>{p.adoption===null?'Não informado':`${p.adoption}%`}</td><td>{p.score}%</td><td>{p.delta===null?'Sem histórico':`${p.delta>0?'+':''}${p.delta} p.p.`}{p.added.length>0&&<small>Novas em uso: {p.added.join(', ')}</small>}</td><td>{p.pending.join(', ')||'Base em uso'}{p.history.length>0&&<details><summary>Ver evolução ({p.history.length})</summary>{p.history.map((s,i)=><p key={i}>{new Date(s.createdAt).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}: {s.previousScore}% → {s.score}%<br/>{s.summary}</p>)}</details>}</td></tr>)}</PaginatedItems></tbody></table></div>{!visible.length&&<p className="empty-copy">Nenhum cliente para os filtros selecionados.</p>}
    <p className="analytics-method-note">Uso da base = funcionalidades base em uso ÷ funcionalidades base previstas. O score inclui Plus. Evolução em pontos percentuais desde o primeiro score anterior registrado; clientes sem histórico aparecem como “Sem histórico”.</p>
  </section>;
}
