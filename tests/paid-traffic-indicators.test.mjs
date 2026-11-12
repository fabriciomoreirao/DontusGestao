import test from 'node:test';
import assert from 'node:assert/strict';
import {paidTrafficCohort,retainedToOnboarding} from '../lib/paid-traffic-indicators.ts';
const item=(id,detail,status='Novo',module='commercial')=>({id,module,title:id,record_type:'Lead comercial',description:JSON.stringify(detail),status,created_at:'2026-11-01T12:00:00Z',updated_at:'2026-11-09T12:00:00Z'});
test('cohort includes only paid traffic and counts a chain once across CRMs',()=>{
 const rows=[item('paid',{funnel:'CRM Tráfego Pago',entryDate:'2026-11-03',qualification:'qualified'}),item('sale',{funnel:'CRM Comercial',sourceQualificationId:'paid',stage:'Ganho',wonAt:'2026-11-08T10:00:00Z'}),item('organic',{funnel:'CRM Comercial',stage:'Ganho'}),item('q',{funnel:'Qualificação',leadQualification:'qualified'})];
 const cohort=paidTrafficCohort(rows);assert.equal(cohort.length,1);assert.equal(cohort[0].date,'2026-11-03');assert.equal(cohort[0].converted,true);assert.equal(cohort[0].otherCrm,true);assert.equal(cohort[0].closedAt,'2026-11-08T10:00:00Z');
});
test('moved paid traffic keeps its origin and disqualification without duplicating copies',()=>{
 const cohort=paidTrafficCohort([item('moved',{funnel:'CRM Comercial',paidTrafficOriginId:'original',paidTrafficEntryDate:'2026-10-30',stage:'Desqualificado'})]);assert.equal(cohort.length,1);assert.equal(cohort[0].id,'original');assert.equal(cohort[0].disqualified,true);assert.equal(cohort[0].otherCrm,true);assert.equal(cohort[0].date,'2026-10-30');
});
test('retention success requires actual forwarding to onboarding, not a final label alone',()=>{
 assert.equal(retainedToOnboarding('lead',{stage:'Finalizado'},[]),false);
 assert.equal(retainedToOnboarding('lead',{onboarding:{sentAt:'2026-11-09'}},[]),true);
 assert.equal(retainedToOnboarding('lead',{},[item('journey',{kind:'csJourney',track:'retention',cycles:[{sourceRetentionLeadId:'lead'}]},'Onboarding','cs')]),true);
 assert.equal(retainedToOnboarding('lead',{},[item('journey',{kind:'csJourney',track:'activation',sourceLeadId:'lead'},'Onboarding','cs')]),false);
});

test('qualificação usa o tipo do registro e atribui uma venda uma vez entre cópias de CRM',()=>{
 const root={...item('q',{funnel:'Facebook',entryDate:'2026-11-03'}),record_type:'Lead de qualificação'};
 const first={...item('sale1',{funnel:'Comercial A',sourceQualificationId:'q',stage:'Ganho',wonAt:'2026-11-08T15:00:00Z'}),amount_cents:125050};
 const copy={...item('sale2',{funnel:'Comercial B',sourceQualificationId:'q',stage:'Venda aprovada',wonAt:'2026-11-09T15:00:00Z'}),amount_cents:125050};
 const cohort=paidTrafficCohort([root,first,copy]);
 assert.equal(cohort.length,1);assert.equal(cohort[0].revenueCents,125050);assert.equal(cohort[0].converted,true);
 assert.equal(cohort[0].originFunnel,'Facebook');assert.equal(cohort[0].closedAt,'2026-11-09T15:00:00Z');
});
test('campanha e região preenchidas no destino aparecem na atribuição de tráfego',()=>{
 const [entry]=paidTrafficCohort([item('paid',{funnel:'Tráfego Pago'}),item('copy',{funnel:'Comercial',sourceQualificationId:'paid',campaignName:'Campanha novembro',region:'Sul',seller:'Ana',stage:'Proposta'})]);
 assert.equal(entry.detail.campaignName,'Campanha novembro');assert.equal(entry.detail.region,'Sul');assert.equal(entry.seller,'Ana');
 assert.equal(entry.outcome,'qualified');assert.equal(entry.otherCrm,true);
});
test('uma origem removida mantém sua atribuição sem duplicar vendas e sem trocar o CRM de origem pelo destino',()=>{
 const rows=['a','b'].map(id=>({...item(id,{funnel:'Comercial',paidTrafficOriginId:'removed',paidTrafficEntryDate:'2026-10-30',stage:'Ganho'}),amount_cents:15000}));
 const [entry]=paidTrafficCohort(rows);assert.equal(paidTrafficCohort(rows).length,1);
 assert.equal(entry.originFunnel,'Tráfego Pago');assert.equal(entry.date,'2026-10-30');assert.equal(entry.revenueCents,15000);
});
test('finalização da retenção não vira venda nova nos indicadores de tráfego',()=>{
 const retention={...item('retention',{sourceLeadId:'paid',funnel:'Retenção',stage:'Concluído'}),record_type:'Lead de retenção',amount_cents:50000};
 const [entry]=paidTrafficCohort([item('paid',{funnel:'Tráfego Pago'}),retention]);
 assert.equal(entry.converted,false);assert.equal(entry.revenueCents,0);
});
test('conversão prevalece sobre uma desqualificação anterior e preserva centavos e quantidades',()=>{
 const [entry]=paidTrafficCohort([item('paid',{funnel:'Tráfego Pago',qualification:'disqualified'}),item('won',{sourceQualificationId:'paid',stage:'Ganho',products:[{product:'Plano',value:123.45,quantity:2}]})]);
 assert.equal(entry.outcome,'converted');assert.equal(entry.disqualified,false);assert.equal(entry.qualified,true);assert.equal(entry.revenueCents,24690);
});
test('competência de entrada usa Brasília e dados legados inválidos não interrompem o painel',()=>{
 const malformed=[{...item('null',{}),description:'null'},{...item('array',{}),description:'[]'},{...item('broken',{}),description:'invalid'}];
 const rows=paidTrafficCohort([...malformed,item('paid',{funnel:'Tráfego Pago',entryDate:'2026-11-01T02:59:59Z'})]);
 assert.equal(rows.length,1);assert.equal(rows[0].date,'2026-10-31');
});
test('o campo de qualificação preenchido como não qualificado aparece no indicador',()=>{
 const [entry]=paidTrafficCohort([item('paid',{funnel:'Tráfego Pago',stage:'Novo',leadQualification:'not-qualified'})]);
 assert.equal(entry.disqualified,true);assert.equal(entry.outcome,'disqualified');
});
