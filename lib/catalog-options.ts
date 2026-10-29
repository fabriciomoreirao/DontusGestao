type CatalogEntry = { catalog: string; name: string; active: boolean };

export function activeCatalogEntries<T extends CatalogEntry>(entries: readonly T[], catalog: string | readonly string[]): T[] {
  const keys = typeof catalog === "string" ? [catalog] : catalog;
  const names = new Set<string>();
  return entries.filter(entry => {
    if (!entry.active || !keys.includes(entry.catalog) || !entry.name.trim()) return false;
    const key = entry.name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    if (names.has(key)) return false;
    names.add(key);
    return true;
  });
}

export function catalogFormValue(entries: readonly CatalogEntry[], catalog: string, previous: string, submitted: string): string | null {
  if (!submitted && previous && !activeCatalogEntries(entries, catalog).some(entry => entry.name === previous)) return null;
  return submitted;
}
