import assert from 'node:assert/strict';
import test from 'node:test';
import {belongsToWaitingQueueDepartment,waitingQueueNeedsContact,waitingQueuePendingInUserSector} from '../lib/waitingQueue.ts';

test('a fila compartilhada notifica todos os membros do setor sem depender do remetente salvo como owner',()=>{
  const people=[{id:'ana',email:'ana@test',departmentId:'support',departmentName:'Suporte'},{id:'bia',email:'bia@test',departmentIds:['sales','support'],departmentName:'Comercial'}];
  const detail={kind:'waitingQueue',state:'waiting',departmentId:'support',departmentName:'Suporte',responsibleUserId:'',responsibleName:''};
  for(const person of people)assert.equal(waitingQueueNeedsContact({owner:'Remetente',description:JSON.stringify(detail)},{email:person.email,displayName:person.id,department:person.departmentName},people),true);
  assert.equal(waitingQueueNeedsContact({description:JSON.stringify({...detail,responsibleUserId:'ana'})},{email:'bia@test',displayName:'bia',department:'Comercial'},people),false);
  assert.equal(waitingQueueNeedsContact({description:JSON.stringify({...detail,state:'contacted'})},{email:'ana@test',displayName:'ana',department:'Suporte'},people),false);
});

test('responsible choices include primary and secondary sectors and legacy sector names',()=>{
  const support={departmentId:'support',departmentName:'Suporte'};
  assert.equal(belongsToWaitingQueueDepartment({departmentId:'support'},support),true);
  assert.equal(belongsToWaitingQueueDepartment({departmentId:'sales',departmentIds:['sales','support']},support),true);
  assert.equal(belongsToWaitingQueueDepartment({departmentName:' suporte '},support),true);
  assert.equal(belongsToWaitingQueueDepartment({departmentNames:['SUPORTE']},support),true);
  assert.equal(belongsToWaitingQueueDepartment({departmentId:'sales',departmentName:'Comercial'},support),false);
});

test('missing department IDs do not place unrelated people in the same shared queue',()=>{
  assert.equal(belongsToWaitingQueueDepartment({departmentId:null,departmentName:'Comercial'},{departmentId:'',departmentName:'Suporte'}),false);
  assert.equal(belongsToWaitingQueueDepartment({departmentId:null,departmentName:''},{departmentId:'',departmentName:''}),false);
  assert.equal(belongsToWaitingQueueDepartment({departmentName:'Sucesso do Cliente'},{departmentId:'legacy',departmentName:' SUCESSO DO CLIENTE '}),true);
});

test('o card inicial contabiliza toda a espera do setor, inclusive clientes assumidos por outros colaboradores',()=>{
  const people=[{id:'ana',email:'ana@test',departmentId:'support',departmentName:'Suporte'},
    {id:'bia',email:'bia@test',departmentId:'sales',departmentIds:['sales','cs'],departmentName:'Comercial',departmentNames:['Comercial','CS']}];
  const user={email:'ANA@test',department:'Suporte'};
  const entry=(departmentId,state='waiting',responsibleUserId='')=>({description:JSON.stringify({kind:'waitingQueue',departmentId,departmentName:departmentId==='support'?'Suporte':'CS',state,responsibleUserId})});
  const items=[entry('support'),entry('support','waiting','outro'),entry('cs'),entry('support','contacted')];
  assert.equal(items.filter(item=>waitingQueuePendingInUserSector(item,user,people)).length,2);
  assert.equal(waitingQueuePendingInUserSector(entry('cs'),{email:'bia@test',department:'Comercial'},people),true);
  assert.equal(waitingQueuePendingInUserSector(entry('cs','waiting','ana'),user,people),false);
  assert.equal(waitingQueuePendingInUserSector(entry('cs'),{email:'gestor@test',department:'Suporte',role:'Administrador'},people),false);
});

test('a contagem da fila usa o nome do setor quando o diretório não está disponível e ignora registros inválidos',()=>{
  const user={email:'ana@test',department:'Sucesso do Cliente'};
  const item={team:'Sucesso do Cliente',description:'{"kind":"waitingQueue","state":"waiting"}'};
  assert.equal(waitingQueuePendingInUserSector(item,user,[]),true);
  assert.equal(waitingQueuePendingInUserSector({...item,team:'Comercial'},user,[]),false);
  assert.equal(waitingQueuePendingInUserSector({...item,description:'inválido'},user,[]),false);
  assert.equal(waitingQueuePendingInUserSector({...item,description:'{"kind":"commercialLead"}'},user,[]),false);
});
