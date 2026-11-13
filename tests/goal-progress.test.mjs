import assert from 'node:assert/strict';
import test from 'node:test';
import {commercialGoalFunnels,goalFunnelName,goalPeriod,goalProgress,isCommercialGoalDepartment} from '../lib/goal-progress.ts';
import {joinComment,splitComment} from '../lib/comment-files.ts';
import {desktopWhatsappUrl} from '../lib/whatsapp.ts';

const goal={kind:'performanceGoal',metric:'salesCount',cadence:'monthly',target:2,employeeId:'ana',employeeName:'Ana',departmentId:'sales',departmentName:'Comercial',periodStart:'2026-11-05',periodEnd:'2026-11-30',active:true};
const sale=(detail={},overrides={})=>({module:'commercial',record_type:'Lead comercial',owner:'Outra pessoa',team:'Comercial',status:'Ganho',amount_cents:15990,description:JSON.stringify({kind:'commercialLead',seller:'Ana',wonAt:'2026-11-06T02:30:00Z',...detail}),created_at:'2026-10-10T12:00:00Z',updated_at:'2026-12-01T12:00:00Z',...overrides});
test('metas usam ganhos do CRM, data da venda em Brasília e vendedor, excluindo retenção e vendas diretas',()=>{
 const records=[sale(),sale({kind:'directSale'}),sale({}, {record_type:'Lead de retenção'}),sale({seller:'Bia'}),sale({wonAt:'2026-11-05T02:30:00Z'}),sale({}, {status:'Proposta'}),sale({}, {team:'Outro'})];
 assert.equal(goalProgress(goal,records),1);
 assert.equal(goalProgress({...goal,metric:'salesValue'},records),159.9);
 assert.equal(goalProgress({...goal,employeeName:'',departmentName:''},records),3);
 assert.equal(goalProgress(goal,[sale({}, {team:'Comercial · CRM'})]),1);
 assert.equal(goalProgress(goal,[sale({}, {team:'Comercialização'})]),0);
});
test('metas de vendas escolhem todos os funis ou apenas o funil específico sem mudar vendedor, setor e datas',()=>{
 const records=[sale({funnel:'LIA'}),sale({funnel:'Clínicas + Módulos'}),sale({funnel:'LIA Plus'}),sale({funnel:'lia',seller:'Bia'}),sale({funnel:'LIA',wonAt:'2026-12-01'}),sale({funnel:'LIA'}, {team:'Outro'}),sale({funnel:'LIA'}, {record_type:'Lead de retenção'}),sale({funnel:'LIA'}, {record_type:'Lead de qualificação'})];
 assert.equal(goalProgress(goal,records),3);
 assert.equal(goalProgress({...goal,funnelId:'lia-id',funnelName:'LIA'},records),1);
 assert.equal(goalProgress({...goal,metric:'salesValue',funnelId:'lia-id',funnelName:'LIA'},records),159.9);
 assert.equal(goalProgress({...goal,funnelName:'Clínicas + Módulos'},records),1);
 assert.equal(goalProgress({...goal,funnelId:'missing'},records),0);
});
test('IDs distinguem funis com o mesmo nome e o catálogo preserva vendas após renomear ou inativar',()=>{
 const scoped={...goal,funnelId:'lia-id',funnelName:'LIA'};
 const catalogs=[{id:'lia-id',name:'LIA Novo',catalog:'funnelStage',description:'{"f":"c"}',active:false}];
 const records=[sale({funnel:'LIA'}),sale({funnel:'LIA Novo'}),sale({funnel:'LIA',funnelId:'other-id'})];
 assert.equal(goalProgress(scoped,records,[],catalogs),2);
 assert.equal(goalFunnelName(scoped,catalogs),'LIA Novo');
 assert.equal(goalProgress(scoped,[sale({funnel:'Outro nome',funnelId:'lia-id'})]),1);
});
test('a seleção oferece apenas funis ativos do CRM comercial e reconhece o time comercial',()=>{
 const catalog=(id,description,active=true)=>({id,name:id,catalog:'funnelStage',description,active});
 const options=commercialGoalFunnels([catalog('comercial','{"f":"c"}'),catalog('legado','{"functionality":"CRM Comercial"}'),catalog('retencao','{"f":"r"}'),catalog('qualificacao','{"f":"q"}'),catalog('desativado','{"f":"c"}',false)]);
 assert.deepEqual(options.map(entry=>entry.id),['comercial','legado']);
 for(const value of ['Comercial','Time Comercial','Equipe Comercial','Comercial · CRM'])assert.equal(isCommercialGoalDepartment(value),true);
 for(const value of ['CS','Financeiro','Comercialização'])assert.equal(isCommercialGoalDepartment(value),false);
});
test('a data inicial não retrocede ao início do mês ou ano e inclui o último dia',()=>{
 assert.deepEqual(goalPeriod('2026-11-15','monthly'),{start:'2026-11-15',end:'2026-11-30'});
 assert.deepEqual(goalPeriod('2026-02-15','annual'),{start:'2026-02-15',end:'2026-12-31'});
 assert.deepEqual(goalPeriod('2028-02-20','monthly'),{start:'2028-02-20',end:'2028-02-29'});
 assert.deepEqual(goalPeriod('2026-11-06','daily'),{start:'2026-11-06',end:'2026-11-06'});
});
test('indicações contam os envios do portal e o setor e colaborador de origem',()=>{
 const referral=sale({}, {module:'referrals',owner:'Destinatário',team:'Outro',description:JSON.stringify({kind:'referral',date:'2026-11-06',senderName:'Ana',senderDepartment:'Comercial'})});
 assert.equal(goalProgress({...goal,metric:'referralCount'},[referral]),1);
 assert.equal(goalProgress({...goal,metric:'salesCount'},[referral]),0);
 assert.equal(goalProgress({...goal,metric:'referralCount',employeeName:'Bia'},[referral]),0);
});
test('médias de score usam funcionalidades Base, Plus e o score da LIA',()=>{
 const cs=sale({}, {module:'cs',owner:'Ana',description:JSON.stringify({kind:'csJourney',startDate:'2026-11-06',featuresBase:['Agenda','Financeiro'],featuresActive:['Agenda'],featuresPlus:['Estoque']})});
 const lia={...cs,module:'lia',description:JSON.stringify({kind:'liaJourney',startDate:'2026-11-06',score:50})};
 assert.equal(goalProgress({...goal,metric:'usageScore'},[cs,lia]),75);
});
test('anexos continuam vinculados ao comentário após trim e não alteram comentários antigos',()=>{
 const files=[{name:'planilha.xlsx',type:'application/octet-stream',size:4,dataUrl:'data:application/octet-stream;base64,dGVzdA=='}];
 assert.deepEqual(splitComment(joinComment('Comentário',files).trim()),{text:'Comentário',files});
 assert.deepEqual(splitComment(joinComment('',files).trim()),{text:'',files});
 assert.deepEqual(splitComment('Comentário antigo'),{text:'Comentário antigo',files:[]});
 assert.deepEqual(splitComment('[[DONTUS_FILES:invalid]]'),{text:'[[DONTUS_FILES:invalid]]',files:[]});
});
test('score de contas estratégicas usa somente unidades ativas',()=>{
 const source=sale({}, {module:'cs',owner:'Ana',description:JSON.stringify({kind:'enterpriseNetwork',startDate:'2026-11-06',units:[{active:true,features:[{name:'Agenda',status:'Em utilização',category:'Base'},{name:'Financeiro',status:'Contratada',category:'Base'}]},{active:false,features:[]}]})});
 assert.equal(goalProgress({...goal,metric:'usageScore'},[source]),50);
 assert.equal(goalProgress({...goal,metric:'usageScore',periodStart:'2026-11-07'},[source]),0);
});
test('atalhos de WhatsApp abrem o aplicativo com número internacional',()=>{
 assert.equal(desktopWhatsappUrl('(11) 99270-6964'),'whatsapp://send?phone=5511992706964');
 assert.equal(desktopWhatsappUrl('+1 415 555 1234'),'whatsapp://send?phone=14155551234');
 assert.equal(desktopWhatsappUrl('0055 11 99270 6964'),'whatsapp://send?phone=5511992706964');
 assert.equal(desktopWhatsappUrl('123'),'');
});
