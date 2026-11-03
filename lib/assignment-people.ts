type Person = {id:string;email:string;active:boolean;blockedAt?:string|null;departmentId?:string|null;departmentIds?:string[];departmentName:string;departmentNames?:string[]};
const normalize=(value:string)=>value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");

export function assignmentPerson<T extends { id:string; email:string; displayName:string }>(people:T[], identity:{ id?:string; email?:string; displayName?:string }) {
  if (identity.id) return people.find(person => person.id === identity.id);
  if (identity.email) return people.find(person => normalize(person.email) === normalize(identity.email!));
  const matches = people.filter(person => identity.displayName && normalize(person.displayName) === normalize(identity.displayName));
  return matches.length === 1 ? matches[0] : undefined;
}

export function reminderRecipients<T extends Person>(people:T[],user:{email:string;department:string}) {
  const self=people.find(person=>normalize(person.email)===normalize(user.email));
  const departmentIds=new Set([self?.departmentId,...(self?.departmentIds??[])].filter(Boolean));
  const departmentNames=new Set([user.department,self?.departmentName??"",...(self?.departmentNames??[])].map(normalize).filter(Boolean));
  return people.filter(person=>person.active&&!person.blockedAt&&(normalize(person.email)===normalize(user.email)
    ||[person.departmentId,...(person.departmentIds??[])].some(id=>id&&departmentIds.has(id))
    ||[person.departmentName,...(person.departmentNames??[])].some(name=>departmentNames.has(normalize(name)))));
}
