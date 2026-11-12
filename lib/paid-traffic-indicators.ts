import {commercialIndicatorFlow,commercialSaleDate} from './commercial-indicators.ts';
type RecordItem = {id: string; module: string; record_type: string; description?: string; created_at: string; updated_at: string; status: string; title: string;owner?:string;amount_cents?:number};
const norm=(value:unknown)=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const read=(raw?:string):Record<string,unknown>=>{try{const value=JSON.parse(raw||"{}");return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}};
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const number=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
export function paidTrafficCohort<T extends RecordItem>(items:T[]) {
 const commercial=items.filter(item=>item.module==="commercial").map(item=>({item,detail:read(item.description)}));
 const roots=commercial.filter(({item,detail})=>commercialIndicatorFlow(item)==='qualification'||/trafego pago/.test(norm([detail.funnel,detail.crmName,detail.sourceCrm,detail.originCrm].join(" "))) || Boolean(detail.paidTrafficOriginId)||Boolean(detail.sourceQualificationId));
 const distinct=new Map<string,typeof roots[number]>();
 for(const root of roots){const id=String(root.detail.paidTrafficOriginId||root.detail.sourceQualificationId||root.item.id);if(!distinct.has(id)||root.item.id===id)distinct.set(id,root)}
 return [...distinct].map(([id,root])=>{
  const chain=new Set([id,root.item.id]);let expanded=true;
  while(expanded){expanded=false;for(const entry of commercial)if(!chain.has(entry.item.id)&&[entry.detail.sourceQualificationId,entry.detail.sourceLeadId,entry.detail.paidTrafficOriginId].some(parent=>chain.has(String(parent)))){chain.add(entry.item.id);expanded=true}}
  const rows=commercial.filter(entry=>chain.has(entry.item.id));
  const eventDate=(row:typeof root)=>Date.parse(text(row.detail.wonAt)||text(row.detail.closedAt)||text(row.detail.saleDate)||row.item.updated_at)||0;
  const won=rows.filter(({item,detail})=>commercialIndicatorFlow(item)!=='retention'&&(detail.kind==="directSale"||Boolean(detail.wonAt)||/ganho|vendid|fechad|contrat|conclu/.test(norm(detail.stage||item.status)))).sort((a,b)=>eventDate(b)-eventDate(a)||a.item.id.localeCompare(b.item.id))[0];
  const disqualified=rows.some(({detail})=>detail.qualification==="disqualified"||detail.leadQualification==="not-qualified"||detail.leadQualification==="disqualified"||/desqualific/.test(norm(detail.stage)));
  const qualified=Boolean(won)||rows.some(({detail})=>detail.qualification==="qualified"||detail.leadQualification==="qualified"||Boolean(detail.sourceQualificationId));
  const lost=rows.some(({item,detail})=>/perdid|descart|sem sucesso/.test(norm(detail.stage||item.status)));
  const closed=won||rows.filter(({item,detail})=>/perdid|descart|sem sucesso|desqualific/.test(norm(detail.stage||item.status))).sort((a,b)=>b.item.updated_at.localeCompare(a.item.updated_at))[0];
  const detail={...root.detail};const latest=[...rows].sort((a,b)=>b.item.updated_at.localeCompare(a.item.updated_at));
  for(const field of ['campaignName','campaignId','region','source','seller'])if(!text(detail[field]))detail[field]=(field==='seller'?root.item.owner:'')||latest.map(row=>text(row.detail[field])).find(Boolean)||'';
  const originFunnel=text(root.detail.originCrm)||text(root.detail.sourceCrm)||text(root.detail.crmName)||(root.item.id!==id?(root.detail.paidTrafficOriginId?'Tráfego Pago':'Qualificação'):text(root.detail.funnel)||'Sem CRM');
  const date=commercialSaleDate({saleDate:text(root.detail.paidTrafficEntryDate)||text(root.detail.entryDate)||root.item.created_at},root.item.created_at);
  const closedAt=closed?String(closed.detail.wonAt||closed.detail.closedAt||closed.detail.saleDate||closed.item.updated_at):'';
  const days=closedAt?(Date.parse(closedAt)-Date.parse(date+'T00:00:00-03:00'))/86400000:NaN;
  const products=Array.isArray(won?.detail.products)?won.detail.products:[];
  const productTotal=products.reduce((sum,product)=>sum+number(product?.unitValue??product?.value)*Math.max(1,number(product?.quantity))*100,0);
  const revenueCents=won?Math.max(0,Math.round(number(won.detail.totalCents??won.detail.valueCents??won.item.amount_cents??productTotal))):0;
  const outcome=won?'converted':lost?'lost':disqualified&&!qualified?'disqualified':qualified?'qualified':'pending';
  return {id,item:root.item,detail,date,qualified,converted:Boolean(won),lost,disqualified:disqualified&&!qualified,
   closedAt,revenueCents,originFunnel,outcome,seller:text(detail.seller)||root.item.owner||'Não atribuído',daysToClose:Number.isFinite(days)?Math.max(0,Math.round(days)):null,
   otherCrm:rows.some(({detail})=>Boolean(detail.funnel)&&norm(detail.funnel)!==norm(originFunnel))};
 });
}
export function retainedToOnboarding(id:string,detail:Record<string,unknown>,items:RecordItem[]){
 if(detail.onboarding && typeof detail.onboarding==="object" && Boolean((detail.onboarding as Record<string,unknown>).sentAt))return true;
 return items.some(item=>{const journey=read(item.description);return item.module==="cs"&&journey.kind==="csJourney"&&journey.track==="retention"&&(journey.sourceLeadId===id || (Array.isArray(journey.cycles)&&journey.cycles.some(cycle=>cycle?.sourceRetentionLeadId===id)))});
}
