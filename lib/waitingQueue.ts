export type DepartmentQueueMode = "conventional" | "linked";

export function belongsToWaitingQueueDepartment(person: {departmentId?:string|null;departmentIds?:string[];departmentName?:string;departmentNames?:string[]}, department:{departmentId:string;departmentName:string}) {
  const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase("pt-BR");
  const names=[person.departmentName??"",...(person.departmentNames??[])];
  return Boolean(department.departmentId && [person.departmentId,...(person.departmentIds??[])].includes(department.departmentId))
    || Boolean(department.departmentName.trim() && names.some(name=>normalize(name)===normalize(department.departmentName)));
}

export function waitingQueueNeedsContact(item:{description:string;team?:string;owner?:string},user:{email:string;displayName:string;department:string},people:Array<{id:string;email:string;departmentId?:string|null;departmentIds?:string[];departmentName:string;departmentNames?:string[]}>) {
  const normalize=(value:string)=>value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
  try {
    const detail=JSON.parse(item.description);
    if(detail.kind!=="waitingQueue"||detail.state==="contacted")return false;
    const self=people.find(person=>normalize(person.email)===normalize(user.email));
    if(!belongsToWaitingQueueDepartment(self??{departmentName:user.department},{departmentId:detail.departmentId??"",departmentName:detail.departmentName||item.team||""}))return false;
    if(detail.responsibleUserId)return detail.responsibleUserId===self?.id;
    if(typeof detail.responsibleName==="string"&&!detail.responsibleName.trim())return true;
    const name=normalize(typeof detail.responsibleName==="string"?detail.responsibleName:item.owner??"");
    return !name||/^(fila compartilhada|sem responsavel|nao atribuido)$/.test(name)||name===normalize(user.displayName);
  } catch {return false;}
}

const QUEUE_MODE_MARKER = /\s*\[\[dontus-fila:(conventional|linked)\]\]\s*/gi;

export function departmentQueueMode(description?: string | null): DepartmentQueueMode {
  const match = String(description ?? "").match(/\[\[dontus-fila:(conventional|linked)\]\]/i);
  return match?.[1]?.toLowerCase() === "linked" ? "linked" : "conventional";
}

export function cleanDepartmentDescription(description?: string | null) {
  return String(description ?? "").replace(QUEUE_MODE_MARKER, " ").replace(/\s{2,}/g, " ").trim();
}

export function serializeDepartmentDescription(description: string, mode: DepartmentQueueMode) {
  const clean = cleanDepartmentDescription(description);
  return `${clean}${clean ? " " : ""}[[dontus-fila:${mode}]]`;
}
