type Employee = { id: string; displayName: string; active: boolean; departmentName: string; departmentNames?: string[] };
type Card = { owner: string; description: string };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export function isCsEmployee(employee: Employee) {
  return employee.active && [employee.departmentName, ...(employee.departmentNames ?? [])].some(name =>
    /^(cs|customer success|sucesso do cliente)(\b|$)/.test(normalize(name)));
}

export function crmResponsible(card: Card) {
  try {
    const detail = JSON.parse(card.description);
    if (typeof detail?.seller === "string" && detail.seller.trim()) return detail.seller.trim();
  } catch { /* Registros antigos podem não conter JSON. */ }
  return card.owner.trim();
}

export function crmResponsibleOptions(people: Array<{ displayName: string }>, cards: Card[]) {
  const names = new Map<string, string>();
  for (const name of [...cards.map(crmResponsible), ...people.map(person => person.displayName)]) {
    if (name.trim() && !names.has(normalize(name))) names.set(normalize(name), name.trim());
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function matchesCrmResponsible(card: Card, selected: string) {
  return selected === "all" || normalize(crmResponsible(card)) === normalize(selected);
}
