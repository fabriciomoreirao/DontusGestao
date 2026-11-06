import assert from 'node:assert/strict';
import test from 'node:test';
import {filterSelectChoices,moveChoice} from '../lib/searchable-select.ts';
import {supportAccessQuery,validAccessPeriod} from '../lib/support-access-indicators.ts';

const choices=[{value:'one',label:'Apresentação comercial',description:'Comercial'},{value:'two',label:'Análise de Bug',description:'Desenvolvimento'},{value:'three',label:'Acompanhamento',description:'Diretoria',disabled:true}];
test('busca motivos por termos sem acentos e pelo setor, conservando os IDs cadastrados',()=>{
 assert.deepEqual(filterSelectChoices(choices,'comercial apresentacao').map(entry=>entry.value),['one']);
 assert.deepEqual(filterSelectChoices(choices,'desenvolvimento bug').map(entry=>entry.value),['two']);
 assert.deepEqual(filterSelectChoices(choices,'termo inexistente'),[]);
 assert.equal(filterSelectChoices(choices,'').length,3);
});
test('navegação do seletor ignora opções desabilitadas e permite retorno ao início',()=>{
 assert.equal(moveChoice(choices,1,1),0);assert.equal(moveChoice(choices,0,-1),1);
 assert.equal(moveChoice([],0,1),-1);assert.equal(moveChoice([{value:'x',label:'X',disabled:true}],0,1),-1);
});
test('histórico e indicadores usam os mesmos filtros, com paginação somente no histórico',()=>{
 const filters={from:'2026-11-05',to:'2026-11-06',responsible:'ana@example.test',reasonId:'one',identification:' 123456 '};
 const analytics=new URLSearchParams(supportAccessQuery(filters));const history=new URLSearchParams(supportAccessQuery(filters,2));
 assert.equal(history.get('page'),'2');assert.equal(analytics.has('page'),false);history.delete('page');assert.equal(history.toString(),analytics.toString());
 assert.equal(analytics.get('identification'),'123456');assert.equal(supportAccessQuery({from:'',to:'',responsible:'',reasonId:'',identification:''}),'');
 assert.equal(validAccessPeriod(filters),true);assert.equal(validAccessPeriod({from:'2026-11-07',to:'2026-11-06'}),false);assert.equal(validAccessPeriod({from:'2026-11-06',to:''}),true);
});
