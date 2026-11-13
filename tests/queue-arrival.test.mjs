import test from 'node:test';import assert from 'node:assert/strict';
import {queueArrivals,QUEUE_ARRIVAL_DURATION} from '../lib/queue-arrival.ts';
import {waitingQueueNeedsContact} from '../lib/waitingQueue.ts';

test('aviso central preserva todas as chegadas da fila e ignora comentários e outros módulos',()=>{
 const notification=(id,module='waitingQueue',category='arrival')=>({id,sourceId:id,title:`Cliente ${id} chegou para você`,module,category});
 const items=[{id:'1',customer_name:'Clínica',team:'Suporte',description:'{"clientCode":"123456","departmentName":"Suporte"}'}];
 assert.deepEqual(queueArrivals([notification('1'),notification('2'),notification('3','lia'),notification('4','waitingQueue','comment')],items),[{id:'1',customerName:'Clínica',clientId:'123456',department:'Suporte'},{id:'2',customerName:'Cliente 2',clientId:'',department:'Seu setor'}]);
 assert.equal(QUEUE_ARRIVAL_DURATION,30000);
});
test('responsável explícito recebe o aviso mesmo fora do setor; compartilhada alcança apenas o setor',()=>{
 const people=[{id:'ana',email:'ana@test',departmentId:'support',departmentName:'Suporte',departmentNames:[]},{id:'bia',email:'bia@test',departmentId:'sales',departmentName:'Comercial',departmentNames:[]}];
 const user=person=>({email:person.email,displayName:person.id,department:person.departmentName});const item=detail=>({description:JSON.stringify({kind:'waitingQueue',state:'waiting',departmentId:'support',departmentName:'Suporte',...detail})});
 assert.equal(waitingQueueNeedsContact(item({responsibleUserId:'bia'}),user(people[1]),people),true);assert.equal(waitingQueueNeedsContact(item({responsibleUserId:'bia'}),user(people[0]),people),false);
 assert.equal(waitingQueueNeedsContact(item({responsibleName:''}),user(people[1]),people),false);assert.equal(waitingQueueNeedsContact(item({responsibleName:''}),user(people[0]),people),true);
});
