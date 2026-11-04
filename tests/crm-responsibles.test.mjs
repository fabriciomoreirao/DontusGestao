import test from 'node:test';
import assert from 'node:assert/strict';
import {isCsEmployee, crmResponsible, crmResponsibleOptions, matchesCrmResponsible} from '../lib/crm-responsibles.ts';
import {waitingQueueSectorKey, waitingQueueSectorOptions} from '../lib/waitingQueue.ts';

test('retenção usa colaboradores ativos de CS inclusive vínculos secundários', () => {
  const person = {id:'1',displayName:'Ana',active:true,departmentName:'Comercial',departmentNames:[]};
  assert.equal(isCsEmployee(person),false);
  for (const name of ['CS','Customer Success','Sucesso do Cliente · Retenção'])
    assert.equal(isCsEmployee({...person,departmentNames:[name]}),true);
  assert.equal(isCsEmployee({...person,active:false,departmentName:'CS'}),false);
});

test('todos os responsáveis exibidos nos cards permanecem filtráveis inclusive nomes antigos', () => {
  const cards = [{owner:'Comercial antigo',description:JSON.stringify({seller:'Bianca Ribeiro'})},
    {owner:'Pedro Rangel',description:'{}'},{owner:'Maynna Santos',description:'legado'},
    {owner:'Outro',description:JSON.stringify({seller:'  bianca ribeiro  '})}];
  const options = crmResponsibleOptions([{displayName:'Colaborador CS'}],cards);
  assert.deepEqual(options,['Bianca Ribeiro','Colaborador CS','Maynna Santos','Pedro Rangel']);
  for (const card of cards) {
    assert.ok(options.some(option=>matchesCrmResponsible(card,option)));
    assert.ok(matchesCrmResponsible(card,crmResponsible(card)));
  }
  assert.equal(matchesCrmResponsible(cards[0],'Comercial antigo'),false);
  assert.equal(matchesCrmResponsible(cards[0],'all'),true);
});

test('filtro por setor inclui filas compartilhadas, atendidas e setores legados sem ID', () => {
  const records=[{departmentId:'cs',departmentName:'CS'},{departmentId:'cs',departmentName:'CS'},
    {departmentId:'com',departmentName:'Comercial'},{departmentId:'',departmentName:'Retenção'},
    {departmentId:'',departmentName:'RETENCAO'}];
  const options=waitingQueueSectorOptions(records);
  assert.equal(options.length,3);
  assert.equal(records.filter(record=>waitingQueueSectorKey(record)==='id:cs').length,2);
  assert.equal(waitingQueueSectorKey(records[3]),waitingQueueSectorKey(records[4]));
});
