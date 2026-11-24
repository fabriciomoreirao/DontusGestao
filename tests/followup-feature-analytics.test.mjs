import assert from 'node:assert/strict';
import test from 'node:test';
import { featureProgress } from '../lib/followup-feature-analytics.ts';

test('distingue uso da base e score Plus, incluindo base padrão e nomes equivalentes',()=>{
  const data=featureProgress({featuresBase:['Agenda','Financeiro'],featuresActive:['agenda'],featuresPlus:['Estoque']});
  assert.equal(data.adoption,50);
  assert.equal(data.score,100);
  assert.deepEqual(data.pending,['Financeiro']);
  assert.equal(featureProgress({featuresActive:['Agenda']},['Agenda','Financeiro']).adoption,50);
  assert.equal(featureProgress({}).adoption,null);
});
test('evolução usa o primeiro score anterior cronológico e não inventa progresso sem histórico',()=>{
  const base={featuresBase:['Agenda','Financeiro'],featuresActive:['Agenda','Financeiro']};
  assert.equal(featureProgress(base).delta,null);
  const later={createdAt:'2026-11-24T12:00:00Z',previousScore:50,score:100,featuresActive:['Agenda','Financeiro']};
  const first={createdAt:'2026-11-01T12:00:00Z',previousScore:0,score:50,featuresActive:['Agenda']};
  const history=[later,first];
  const result=featureProgress({...base,scoreEvolution:history});
  assert.equal(result.delta,100);
  assert.deepEqual(result.added,['Financeiro']);
  assert.deepEqual(history,[later,first]);
  assert.equal(featureProgress({...base,featuresActive:[],scoreEvolution:[later]}).delta,-50);
});
