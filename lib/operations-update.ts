type VersionedRecord = { id: string; version: number; updated_at: string };
export type OperationsChanges<T extends VersionedRecord> = { updatedItems?: T[]; removedItemIds?: string[] };

export function knownWorkItemVersions(items: VersionedRecord[]) {
  return Object.fromEntries(items.map(item => [item.id, item.version]));
}

/** Apply an authorized server delta while retaining unchanged records and their memoized views. */
export function mergeOperationsUpdate<T extends { items: VersionedRecord[] }>(current: T, patch: Partial<T> & OperationsChanges<T["items"][number]>): T {
  const { updatedItems, removedItemIds, ...fields } = patch;
  if (patch.items) return { ...current, ...fields } as T;
  if (!updatedItems?.length && !removedItemIds?.length) return { ...current, ...fields } as T;
  const removed = new Set(removedItemIds);
  const byId = new Map(current.items.filter(item => !removed.has(item.id)).map(item => [item.id, item]));
  for (const item of updatedItems ?? []) {
    const previous = byId.get(item.id);
    if (!removed.has(item.id) && (!previous || item.version > previous.version)) byId.set(item.id, item);
  }
  const items = [...byId.values()].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  return { ...current, ...fields, items } as T;
}
