import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingTrainingSteps,hasTrainingPending,isCriticalFollowup,splitFollowupHistory,followupVersion} from '../lib/followup-insights.ts';
test('treinamento em haver depende da realização das duas etapas ou do alinhamento único',()=>{
  const detail={track:'activation',phase:'onboarding'};
  assert.deepEqual(pendingTrainingSteps(detail),['Kick off','Treinamento']);
  assert.deepEqual(pendingTrainingSteps({...detail,firstMeetingCompletedAt:'2026-11-01'}),['Treinamento']);
  assert.equal(hasTrainingPending({...detail,firstMeetingAt:'2026-11-01',trainingAt:'2026-11-02'}),true);
  assert.equal(hasTrainingPending({...detail,firstMeetingCompletedAt:'2026-11-01',trainingCompletedAt:'2026-11-02'}),false);
  assert.equal(hasTrainingPending({...detail,singleAlignmentCompletedAt:'2026-11-02'}),false);
  assert.equal(hasTrainingPending({...detail,track:'retention'}),false);
  assert.equal(hasTrainingPending({...detail,phase:'cancelled'}),false);
});
test('clientes com score menor que 50 recebem o mesmo critério de atenção',()=>{
  assert.equal(isCriticalFollowup({featuresBase:['a','b'],featuresActive:['a']}),false);
  assert.equal(isCriticalFollowup({featuresBase:['a','b','c'],featuresActive:['a']}),true);
  assert.equal(isCriticalFollowup({featuresActive:[]},['a','b']),true);
});
test('histórico separa comentários de movimentações sem perder registros legados',()=>{
  const entries=[{text:'Mover',kind:'Atualização',createdAt:'2026-11-01'},{text:'Mensagem',kind:'Comentário',createdAt:'2026-11-02'},{text:'Legado',createdAt:'2026-11-03'},{text:'Mover etapa',type:'Movimentação',createdAt:'2026-11-04'},{text:'Análise',kind:'Análise',createdAt:'2026-11-05'}];
  const result=splitFollowupHistory(entries);
  assert.deepEqual(result.comments.map(row=>row.text),['Análise','Legado','Mensagem']);
  assert.deepEqual(result.movements.map(row=>row.text),['Mover etapa','Mover']);
  assert.equal(result.comments.length+result.movements.length,entries.length);
});
test('versão prefere cadastro atual e identifica plano do sistema sem confundir LIA',()=>{
  assert.equal(followupVersion({productVersion:'Maxi'},{product_version:'Ultra'},{version:'Essencial'}),'Ultra');
  assert.equal(followupVersion({},undefined,{products:[{product:'LIA',plan:'Performance'},{product:'Sistema',plan:'Maxi'}]}),'Maxi');
  assert.equal(followupVersion({},undefined,{products:[{product:'LIA',plan:'Performance'}]}),'Não informada');
});

test('alerta não retroage para acompanhamento e finalização nem para entradas manuais',()=>{
 for(const phase of ['tracking','conference','finished','unsuccessful','cancelled'])assert.equal(hasTrainingPending({track:'activation',phase,sourceLeadId:'old',trainingRequired:true}),false);
 assert.equal(hasTrainingPending({track:'activation',phase:'validation'}),false);
 assert.equal(hasTrainingPending({track:'activation',phase:'activation'}),true);
 assert.equal(hasTrainingPending({track:'activation',phase:'validation',sourceLeadId:'new'}),true);
 assert.equal(hasTrainingPending({track:'activation',phase:'validation',trainingRequired:true}),true);
});
