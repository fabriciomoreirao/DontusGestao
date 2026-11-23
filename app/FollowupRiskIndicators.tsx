"use client";

import PaginatedItems from "@/app/PaginatedItems";
import { AlertTriangle, CircleHelp, ExternalLink } from 'lucide-react';
import { customerSuccessScore } from '@/lib/commission-rules';
import { followupVersion, pendingTrainingSteps, type FollowupDetail } from '@/lib/followup-insights';
import { strategicUnitJourney } from '@/lib/enterprise-tracking';
import { enterpriseUnitScore } from '@/lib/enterprise-score';

type Item = {id:string;module:string;title:string;customer_id?:string|null;owner:string;status:string;description?:string;updated_at:string};
type Customer = {id:string;document_masked?:string;product_version?:string};
type Catalog = {catalog:string;name:string;active:boolean;description:string};
type Detail = FollowupDetail & {kind?:string;clientId?:string;sourceLeadId?:string;units?:Unit[]};
type Unit = {id:string;name:string;externalId:string;customerId?:string;active?:boolean;features?:{name:string;status:string;category:string}[]};
const parse = (value?:string):Detail => {try{return JSON.parse(value||'{}')}catch{return {}}};
const phases:Record<string,string>={validation:'Validação',onboarding:'Onboarding',tracking:'Acompanhamento',conference:'Conferência',finished:'Finalizado',unsuccessful:'Sem sucesso',cancelled:'Cancelado',cancelledWithoutTraining:'Cancelado sem treinamento'};
export function followupBaseFeatures(catalogs:Catalog[]) {
  return [...new Set(catalogs.filter(entry=>entry.active && (entry.catalog==='csFeatureBase' || ['csFeature','csFeatureActive','csFeaturePlus'].includes(entry.catalog) && (()=>{try{return JSON.parse(entry.description||'{}').featureBase===true}catch{return false}})())).map(entry=>entry.name))];
}
export default function FollowupRiskIndicators({records,items,customers,catalogs,mode}:{records:Item[];items:Item[];customers:Customer[];catalogs:Catalog[];mode:'critical'|'training'}) {
  const base = followupBaseFeatures(catalogs);
  const customerFor=(id?:string|null,external?:string)=>customers.find(customer=>customer.id===id||Boolean(external&&(customer.id===external||customer.document_masked===external)));
  const journeys=items.map(item=>({...item,description:item.description||'{}'}));
  const rows=records.flatMap(item=>{
    const detail=parse(item.description);
    if(detail.kind==='csJourney') {
      const commercial=items.find(entry=>entry.id===detail.sourceLeadId);
      return [{id:item.id,name:item.title,clientId:detail.clientId||item.customer_id||'—',owner:item.owner,version:followupVersion(detail,customerFor(item.customer_id,detail.clientId),commercial?parse(commercial.description):undefined),phase:phases[detail.phase||'validation']||item.status,score:customerSuccessScore(detail,base),pending:pendingTrainingSteps(detail),network:'',href:`/?mod=cs&csFlow=${detail.track==='retention'?'evolution':'onboarding'}&card=${encodeURIComponent(item.id)}`}];
    }
    if(detail.kind==='enterpriseNetwork') return (detail.units||[]).filter(unit=>unit.active!==false).map(unit=>{
      const match=strategicUnitJourney(unit,item.id,journeys);
      const tracking=match?.detail || {track:'activation'};
      return {id:`${item.id}:${unit.id}`,name:unit.name,clientId:unit.externalId||'—',owner:match?.record ? items.find(entry=>entry.id===match.record.id)?.owner||item.owner : item.owner,version:followupVersion(tracking,customerFor(unit.customerId,unit.externalId)),phase:phases[tracking.phase||'']||'Sem acompanhamento',score:match?customerSuccessScore(tracking):enterpriseUnitScore({features:unit.features||[]},base),pending:pendingTrainingSteps(tracking),network:item.title,href:`/?mod=cs&csFlow=enterprise&card=${encodeURIComponent(item.id)}`};
    });
    return [];
  }).filter(row=>mode==='critical'?row.score<50:row.pending.length>0).sort((a,b)=>a.score-b.score||a.name.localeCompare(b.name,'pt-BR'));
  return <section className="followup-risk-indicators"><header>{mode==='critical'?<CircleHelp/>:<AlertTriangle/>}<div><h2>{mode==='critical'?'Clientes críticos':'Treinamentos em haver'}</h2><p>{mode==='critical'?'Clientes com score abaixo de 50%, conforme os filtros selecionados.':'Kick off e treinamento pendentes. O alinhamento único concluído substitui as duas etapas.'}</p></div><strong>{rows.length} cliente(s)</strong></header><div className="analytical-table-scroll"><table><caption>{mode==='critical'?'Clientes com menos de 50% de score':'Clientes com treinamento em haver'}</caption><thead><tr><th>Cliente / ID</th><th>Versão</th><th>Responsável</th><th>Etapa</th><th>Score</th><th>Pendências de treinamento</th><th>Abrir</th></tr></thead><tbody>{<PaginatedItems label="acompanhamentos" table>{rows.map(row=><tr key={row.id}><td><strong>{row.name}</strong><small>{row.clientId}{row.network&&` · ${row.network}`}</small></td><td>{row.version}</td><td>{row.owner||'Não atribuído'}</td><td>{row.phase}</td><td><b className={row.score<50?'followup-critical-text':''}>{row.score}%</b></td><td>{row.pending.length?row.pending.join(' + '):'Concluído'}</td><td><a href={row.href} aria-label={`Abrir ${row.name}`}><ExternalLink size={16}/></a></td></tr>)}</PaginatedItems>}{!rows.length&&<tr><td colSpan={7}>Nenhum cliente neste recorte.</td></tr>}</tbody></table></div></section>;
}
