type Task = {creatorUserId:string;assigneeUserId:string|null;currentDepartmentId:string;sourceDepartmentId:string;participantUserIds:readonly string[]};
type Collaborator = {id:string;active:boolean;departmentIds:readonly string[];coordinatorDepartmentIds:readonly string[]};

export function canInteractWithTask(task:Task,person:Collaborator|undefined,canManage=false) {
  if (!person?.active) return false;
  return canManage || task.creatorUserId===person.id || task.assigneeUserId===person.id
    || task.participantUserIds.includes(person.id)
    || person.coordinatorDepartmentIds.some(id=>id===task.currentDepartmentId||id===task.sourceDepartmentId)
    || !task.assigneeUserId && person.departmentIds.includes(task.currentDepartmentId);
}
