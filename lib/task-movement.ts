type Task = {assigneeUserId:string|null;currentDepartmentId:string;typeId:string};
type Status = {id:string;name:string;departmentId:string|null;manualMovement:boolean;active:boolean};
type Type = {id:string;allowedStatusIds:string[]};
type Access = {userId?:string;canEdit:boolean;canManage:boolean;changeStatus:boolean;cancel:boolean;canInteract?:boolean};

export function canDragTask(task:Task,access:Access) {
  return access.canInteract!==false && (Boolean(access.userId && task.assigneeUserId===access.userId) || access.canEdit&&(access.canManage||access.changeStatus));
}

export function canMoveTask(task:Task,status:Status,types:Type[],access:Access) {
  return canDragTask(task,access) && status.active && status.manualMovement
    && (!status.departmentId || status.departmentId===task.currentDepartmentId)
    && (!/cancel/i.test(status.name) || access.canEdit && (access.canManage||access.changeStatus) && (access.canManage||access.cancel))
    && (/aguardando aprova/i.test(status.name) || Boolean(types.find(type=>type.id===task.typeId)?.allowedStatusIds.includes(status.id)));
}
