export const DEFAULT_PAGE_SIZE = 10;

export function paginate<T>(items: readonly T[], requestedPage: number, pageSize = DEFAULT_PAGE_SIZE) {
  const size = Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE;
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.max(1, Math.min(pages, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const offset = (page - 1) * size;
  return { items: items.slice(offset, offset + size), page, pages, total, start: total ? offset + 1 : 0, end: Math.min(offset + size, total) };
}
