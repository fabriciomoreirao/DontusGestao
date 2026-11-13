type Task = {assigneeUserId:string|null;currentDepartmentId:string;typeId:string;statusName?:string;completedAt?:string|null};
type Status = {id:string;name:string;kanbanColumn?:string;departmentId:string|null;manualMovement:boolean;active:boolean;isFinal?:boolean};
type Type = {id:string;allowedStatusIds:string[]};
type Access = {userId?:string;canEdit:boolean;canManage:boolean;changeStatus:boolean;cancel:boolean;canInteract?:boolean;canApprove?:boolean};
const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
export const isTaskApprovalStatus=(status:Pick<Status,"name"|"kanbanColumn">)=>[status.name,status.kanbanColumn||""].some(name=>/aguardando\s+aprova/.test(normalize(name)));
const workingStatus=(status:Status)=>!status.isFinal&&!isTaskApprovalStatus(status)&&[status.name,status.kanbanColumn||""].some(name=>/^(?:pendente|aberta?|em (?:andamento|progresso))$/.test(normalize(name)));

export function canDragTask(task:Task,access:Access) {
  const supervisor=access.canManage||access.canApprove;
  if(!supervisor&&(task.completedAt||isTaskApprovalStatus({name:task.statusName||""})))return false;
  return access.canInteract!==false && (Boolean(access.userId && task.assigneeUserId===access.userId) || Boolean(supervisor) || access.canEdit&&access.changeStatus);
}

export function canMoveTask(task:Task,status:Status,types:Type[],access:Access,intent:"move"|"requestApproval"="move") {
  if(!canDragTask(task,access)||!status.active||(status.departmentId&&status.departmentId!==task.currentDepartmentId))return false;
  if(intent==="requestApproval")return isTaskApprovalStatus(status)&&!status.isFinal&&!task.completedAt;
  if(!status.manualMovement||isTaskApprovalStatus(status))return false;
  if(status.isFinal&&!access.canManage&&(!access.canApprove||!isTaskApprovalStatus({name:task.statusName||""})))return false;
  if(/cancel/i.test(status.name)&&!(access.canEdit&&(access.canManage||access.changeStatus)&&(access.canManage||access.cancel)))return false;
  return workingStatus(status)||Boolean(types.find(type=>type.id===task.typeId)?.allowedStatusIds.includes(status.id));
}
