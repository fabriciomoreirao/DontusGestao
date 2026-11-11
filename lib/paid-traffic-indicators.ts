type RecordItem = {id: string; module: string; record_type: string; description?: string; created_at: string; updated_at: string; status: string; title: string};
const norm=(value:unknown)=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const read=(raw?:string):Record<string,unknown>=>{try{return JSON.parse(raw||"{}")}catch{return {}}};
export function paidTrafficCohort<T extends RecordItem>(items:T[]) {
 const commercial=items.filter(item=>item.module==="commercial").map(item=>({item,detail:read(item.description)}));
 const roots=commercial.filter(({detail})=>/trafego pago/.test(norm([detail.funnel,detail.crmName,detail.sourceCrm,detail.originCrm].join(" "))) || Boolean(detail.paidTrafficOriginId));
 const distinct=new Map<string,typeof roots[number]>();
 for(const root of roots){const id=String(root.detail.paidTrafficOriginId||root.item.id);if(!distinct.has(id)||root.item.id===id)distinct.set(id,root)}
 return [...distinct].map(([id,root])=>{
  const chain=new Set([id,root.item.id]);let expanded=true;
  while(expanded){expanded=false;for(const entry of commercial)if(!chain.has(entry.item.id)&&[entry.detail.sourceQualificationId,entry.detail.sourceLeadId,entry.detail.paidTrafficOriginId].some(parent=>chain.has(String(parent)))){chain.add(entry.item.id);expanded=true}}
  const rows=commercial.filter(entry=>chain.has(entry.item.id));
  const won=rows.find(({item,detail})=>detail.kind==="directSale"||/ganho|vendid|fechad|contrat|conclu/.test(norm(detail.stage||item.status)));
  const disqualified=rows.some(({detail})=>detail.qualification==="disqualified"||/desqualific/.test(norm(detail.stage)));
  const qualified=rows.some(({detail})=>detail.qualification==="qualified"||detail.leadQualification==="qualified"||Boolean(detail.sourceQualificationId));
  const lost=rows.some(({item,detail})=>/perdid|descart|sem sucesso/.test(norm(detail.stage||item.status)));
  const closed=won||rows.filter(({item,detail})=>/perdid|descart|sem sucesso|desqualific/.test(norm(detail.stage||item.status))).sort((a,b)=>b.item.updated_at.localeCompare(a.item.updated_at))[0];
  return {id,item:root.item,detail:root.detail,date:String(root.detail.paidTrafficEntryDate||root.detail.entryDate||root.item.created_at).slice(0,10),qualified,converted:Boolean(won),lost,disqualified,
   closedAt: closed?String(closed.detail.wonAt||closed.detail.closedAt||closed.detail.saleDate||closed.item.updated_at):"",
   otherCrm:rows.some(({detail})=>Boolean(detail.funnel)&&!/trafego pago/.test(norm(detail.funnel)))};
 });
}
export function retainedToOnboarding(id:string,detail:Record<string,unknown>,items:RecordItem[]){
 if(detail.onboarding && typeof detail.onboarding==="object" && Boolean((detail.onboarding as Record<string,unknown>).sentAt))return true;
 return items.some(item=>{const journey=read(item.description);return item.module==="cs"&&journey.kind==="csJourney"&&journey.track==="retention"&&(journey.sourceLeadId===id || (Array.isArray(journey.cycles)&&journey.cycles.some(cycle=>cycle?.sourceRetentionLeadId===id)))});
}
