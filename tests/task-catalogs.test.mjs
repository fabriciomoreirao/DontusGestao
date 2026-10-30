import test from "node:test";
import assert from "node:assert/strict";
import { availableTaskDepartments, initialTaskStatuses, taskInitialSelection, taskTypesForDepartment } from "../lib/task-catalogs.ts";

const departments=[{id:"support",active:true},{id:"new-from-employees",active:true},{id:"inactive",active:false}];
test("acesso total e consulta de outros setores mostram os setores ativos mesmo sem vínculos pessoais",()=>{
  const empty={departmentIds:[],coordinatorDepartmentIds:[]};
  assert.deepEqual(availableTaskDepartments(departments,empty,true).map(entry=>entry.id),["support","new-from-employees"]);
  assert.deepEqual(availableTaskDepartments(departments,undefined,true).map(entry=>entry.id),["support","new-from-employees"]);
  assert.deepEqual(availableTaskDepartments(departments,empty,false),[]);
});
test("o usuário comum mantém a união dos setores de vínculo e coordenação",()=>{
  const user={departmentIds:["support"],coordinatorDepartmentIds:["new-from-employees","inactive"]};
  assert.deepEqual(availableTaskDepartments(departments,user,false).map(entry=>entry.id),["support","new-from-employees"]);
});
test("trocar o setor oferece os tipos ativos vinculados ao setor escolhido",()=>{
  const types=[{id:"backup",active:true,departmentIds:["support"]},{id:"bug",active:true,departmentIds:["new-from-employees"]},{id:"retired",active:false,departmentIds:["support"]}];
  assert.deepEqual(taskTypesForDepartment(types,"support").map(entry=>entry.id),["backup"]);
  assert.deepEqual(taskTypesForDepartment(types,"new-from-employees").map(entry=>entry.id),["bug"]);
  assert.deepEqual(taskTypesForDepartment(types,""),[]);
});
test("a etapa inicial desativada é substituída na edição somente quando há uma primeira etapa explícita e única",()=>{
  const statuses=[{id:"old",active:false,isInitial:true,isFinal:false,acceptsNewTasks:true,departmentId:null},
    {id:"pending",active:true,isInitial:true,isFinal:false,acceptsNewTasks:true,departmentId:null},
    {id:"progress",active:true,isInitial:false,isFinal:false,acceptsNewTasks:true,departmentId:null},
    {id:"final",active:true,isInitial:false,isFinal:true,acceptsNewTasks:false,departmentId:null},
    {id:"other-department",active:true,isInitial:true,isFinal:false,acceptsNewTasks:true,departmentId:"inactive"}];
  const eligible=initialTaskStatuses(statuses,["support"]);
  assert.deepEqual(eligible.map(entry=>entry.id),["pending","progress"]);
  assert.equal(taskInitialSelection(eligible,"old"),"pending");
  assert.equal(taskInitialSelection(eligible,"progress"),"progress");
  assert.equal(taskInitialSelection([...eligible,{...statuses[1],id:"alternative"}],"old"),"");
  assert.equal(initialTaskStatuses([{...statuses[1],departmentId:"support"}],["support","new-from-employees"]).length,0);
});
