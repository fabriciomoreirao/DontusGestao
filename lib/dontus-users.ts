export type DontusUserSearchEntry = { id: number; name: string; username: string; email: string; isSupervisor: boolean };

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();

export function dontusUsersPage<T extends DontusUserSearchEntry>(users: readonly T[], search: string, type: string, requestedPage: number) {
  const terms = normalize(search).split(/\s+/).filter(Boolean);
  const matching = users.filter(user => {
    const text = normalize(`${user.id} ${user.name} ${user.username} ${user.email}`);
    return terms.every(term => text.includes(term)) && (!type || user.isSupervisor === (type === "supervisor"));
  });
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.max(1, Math.min(totalPages, Math.floor(requestedPage) || 1));
  const offset = (page - 1) * pageSize;
  return { items: matching.slice(offset, offset + pageSize), page, totalPages, total: matching.length,
    start: matching.length ? offset + 1 : 0, end: Math.min(offset + pageSize, matching.length) };
}
