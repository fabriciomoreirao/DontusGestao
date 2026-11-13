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
  assert.equal(canMoveTask(task,{...status,id:"unrelated",name:"Em revisão técnica"},types,access),false);
  assert.equal(canMoveTask(task,{...status,id:"approval",name:"Aguardando aprovação"},types,access),false);
  assert.equal(canMoveTask(task,{...status,id:"approval",name:"Aguardando aprovação"},types,access,"requestApproval"),true);
  const cancel={...status,id:"cancel",name:"Cancelada"};
  assert.equal(canMoveTask(task,cancel,types,access),false);
  assert.equal(canMoveTask(task,cancel,types,{...access,canEdit:true,changeStatus:true,cancel:true}),true);
});

test('etapas configuradas de pendente e progresso aceitam o responsável sem vínculo antigo do tipo',()=>{
 for(const name of ['Pendente','Em progresso','Em andamento','Aberta'])assert.equal(canMoveTask(task,{...status,id:'new-stage',name},[],access),true);
 assert.equal(canMoveTask(task,{...status,id:'new-stage',name:'Outro nome',kanbanColumn:'Em progresso'},[],access),true);
});
test('aprovação só aceita a ação do card e conclusão exige coordenação após aprovação',()=>{
 const approval={...status,id:'approval',name:'Aguardando aprovação',manualMovement:false};
 const final={...status,id:'final',name:'Resolvida',isFinal:true};
 const flow=[{...types[0],allowedStatusIds:[status.id,'final']}];
 assert.equal(canMoveTask(task,approval,flow,access),false);
 assert.equal(canMoveTask(task,approval,flow,access,'requestApproval'),true);
 assert.equal(canMoveTask(task,status,flow,access,'requestApproval'),false);
 assert.equal(canMoveTask(task,final,flow,access),false);
 const pending={...task,statusName:'Aguardando aprovação'};
 assert.equal(canDragTask(pending,access),false);
 assert.equal(canMoveTask(pending,status,flow,access),false);
 assert.equal(canMoveTask(pending,final,flow,{...access,canApprove:true}),true);
 assert.equal(canMoveTask(task,final,flow,{...access,canApprove:true}),false);
 assert.equal(canDragTask({...task,completedAt:'2026-11-13'},access),false);
});
