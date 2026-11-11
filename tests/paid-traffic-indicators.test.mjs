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
