import assert from "node:assert/strict";
import test from "node:test";
import { beginKanbanDrag, readKanbanDrop, endKanbanDrag, suppressKanbanClick } from "../lib/kanban-drag.ts";
import { canDragTask,canMoveTask } from "../lib/task-movement.ts";

const transfer=()=>{const values=new Map();return {effectAllowed:"none",setData:(type,value)=>values.set(type.toLowerCase(),value),getData:type=>values.get(type.toLowerCase())||""};};
test("transporta o card de cada quadro com formato nativo e alternativa em texto",()=>{
  for(const type of ["taskId","workItemId","application/x-dontus-work-item","application/x-dontus-candidate","text/suggestion-id","text/plain"]){
    const dataTransfer=transfer();let prevented=false;
    beginKanbanDrag({dataTransfer},type,"record-123");
    assert.equal(dataTransfer.effectAllowed,"move");assert.equal(dataTransfer.getData("text/plain"),"record-123");
    assert.equal(readKanbanDrop({dataTransfer,preventDefault:()=>{prevented=true;}},type),"record-123");
    assert.equal(prevented,true);endKanbanDrag();
  }
});
test("recupera o card quando o navegador não entrega o formato personalizado, sem aceitar outro quadro",()=>{
  const dataTransfer=transfer();beginKanbanDrag({dataTransfer},"taskId","task-1");
  assert.equal(readKanbanDrop({dataTransfer:{getData:()=>""},preventDefault(){}},"taskId"),"task-1");
  assert.equal(readKanbanDrop({dataTransfer,preventDefault(){}},"workItemId"),"");
  endKanbanDrag();
  assert.equal(readKanbanDrop({dataTransfer:{getData:()=>""},preventDefault(){}},"taskId"),"");
  assert.equal(readKanbanDrop({dataTransfer:{getData:type=>type==="text/plain"?"legacy-card":""},preventDefault(){}},"taskId"),"legacy-card");
});
test("o término do arraste evita abrir o card ao soltar, mantendo cliques posteriores",()=>{
  beginKanbanDrag({dataTransfer:transfer()},"taskId","task-1");endKanbanDrag(1000);
  assert.equal(suppressKanbanClick(1001),true);assert.equal(suppressKanbanClick(1251),false);
});

const task={assigneeUserId:"responsible",currentDepartmentId:"support",typeId:"type"};
const status={id:"working",name:"Em andamento",departmentId:null,manualMovement:true,active:true};
const types=[{id:"type",allowedStatusIds:["working","cancel"]}];
const access={userId:"responsible",canEdit:false,canManage:false,changeStatus:false,cancel:false};
test("o responsável move a própria tarefa e outros usuários precisam da permissão de movimentação",()=>{
  assert.equal(canDragTask(task,access),true);assert.equal(canMoveTask(task,status,types,access),true);
  assert.equal(canMoveTask(task,status,types,{...access,userId:"other"}),false);
  assert.equal(canMoveTask(task,status,types,{...access,userId:"other",canEdit:true,changeStatus:true}),true);
  assert.equal(canMoveTask(task,status,types,{...access,userId:"other",canEdit:true}),false);
});
test("o arraste respeita setor, fluxo, etapas ativas, justificativas do servidor e autorização de cancelamento",()=>{
  assert.equal(canMoveTask(task,{...status,departmentId:"development"},types,access),false);
  assert.equal(canMoveTask(task,{...status,manualMovement:false},types,access),false);
  assert.equal(canMoveTask(task,{...status,active:false},types,access),false);
  assert.equal(canMoveTask(task,{...status,id:"unrelated"},types,access),false);
  assert.equal(canMoveTask(task,{...status,id:"approval",name:"Aguardando aprovação"},types,access),true);
  const cancel={...status,id:"cancel",name:"Cancelada"};
  assert.equal(canMoveTask(task,cancel,types,access),false);
  assert.equal(canMoveTask(task,cancel,types,{...access,canEdit:true,changeStatus:true,cancel:true}),true);
});
