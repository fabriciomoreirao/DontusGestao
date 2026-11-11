import assert from 'node:assert/strict';
import test from 'node:test';
import {taskAssignmentAccess} from '../lib/task-assignment.ts';
import {availableTaskDepartments,taskViewingDepartments} from '../lib/task-catalogs.ts';
const task={assigneeUserId:null,currentDepartmentId:'support'};
const ana={id:'ana',active:true,departmentIds:['support'],coordinatorDepartmentIds:[]};
test('qualquer membro ativo do setor pode assumir a fila sem permissão extra',()=>{
 assert.deepEqual(taskAssignmentAccess(task,ana),{canClaim:true,canTransfer:false});
 for(const person of [undefined,{...ana,active:false},{...ana,departmentIds:['finance']}])assert.deepEqual(taskAssignmentAccess(task,person),{canClaim:false,canTransfer:false});
});
test('depois de assumida, apenas o responsável pode trocar o nome, inclusive em outro setor',()=>{
 const assigned={...task,assigneeUserId:'ana'};
 assert.deepEqual(taskAssignmentAccess(assigned,{...ana,departmentIds:['finance']}),{canClaim:false,canTransfer:true});
 assert.deepEqual(taskAssignmentAccess(assigned,{...ana,id:'bia'}),{canClaim:false,canTransfer:false});
 assert.deepEqual(taskAssignmentAccess(assigned,{...ana,active:false}),{canClaim:false,canTransfer:false});
});
test('visualizar um setor por atribuição não libera criação nem setores não atribuídos',()=>{
 const departments=[{id:'support',active:true},{id:'finance',active:true},{id:'sales',active:true},{id:'inactive',active:false}];
 const user={...ana,departmentIds:['finance']};
 assert.deepEqual(taskViewingDepartments(departments,user,false,['support','inactive']).map(d=>d.id),['support','finance']);
 assert.deepEqual(availableTaskDepartments(departments,user,false).map(d=>d.id),['finance']);
 assert.deepEqual(taskViewingDepartments(departments,undefined,false,[]),[]);
});
