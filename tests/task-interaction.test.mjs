import test from 'node:test';
import assert from 'node:assert/strict';
import {canInteractWithTask} from '../lib/task-interaction.ts';
import {canDragTask} from '../lib/task-movement.ts';

const task={creatorUserId:'creator',assigneeUserId:'owner',sourceDepartmentId:'sales',currentDepartmentId:'support',participantUserIds:['participant']};
const person={id:'viewer',active:true,departmentIds:['support'],coordinatorDepartmentIds:[]};
test('colega do setor consulta tarefa atribuída sem obter permissão de alteração ou movimentação',()=>{
  assert.equal(canInteractWithTask(task,person),false);
  assert.equal(canDragTask(task,{userId:'viewer',canEdit:true,canManage:false,changeStatus:true,cancel:true,canInteract:false}),false);
  for(const id of ['creator','owner','participant'])assert.equal(canInteractWithTask(task,{...person,id}),true);
  assert.equal(canInteractWithTask(task,{...person,coordinatorDepartmentIds:['support']}),true);
  assert.equal(canInteractWithTask(task,person,true),true);
});
test('mantém a fila sem responsável disponível para o setor e protege tarefas de outros setores',()=>{
  assert.equal(canInteractWithTask({...task,assigneeUserId:null},person),true);
  assert.equal(canInteractWithTask({...task,assigneeUserId:null},{...person,departmentIds:['finance']}),false);
  assert.equal(canInteractWithTask(task,{...person,active:false},true),false);
});
