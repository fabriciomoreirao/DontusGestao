export type RecordPath = string[];
type AnyRecord = Record<string, unknown>;
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
export function recordKey(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return;
  const text = String(value); const match = text.match(uuid);
  return match ? match[0].toLowerCase() : text.replace(/^\.\$/, '');
}
export function rowIdentity(row: unknown): { field: string; key: string } | undefined {
  if (!row || typeof row !== 'object') return;
  const object = row as AnyRecord;
  for (const field of ['id', 'userId', 'token', 'phone', 'name', 'code', 'track', 'version']) {
    const key = recordKey(object[field]); if (key) return { field, key };
  }
}
const roots = ['items','customers','approvals','audit','customerModule','taskModule','agendaModule','suggestionModule','notesModule','diaryModule','noticesModule','access','chatModule'];
export function recordSources(data: unknown) {
  const result = new Map<string, RecordPath[]>();
  function visit(value: unknown, path: string[], depth: number) {
    if (!value || typeof value !== 'object' || depth > 10) return;
    if (Array.isArray(value)) {
      for (const row of value) {
        const identity = rowIdentity(row); if (!identity) continue;
        result.set(identity.key, [...(result.get(identity.key) || []), path]);
        visit(row, [...path, `@${identity.field}:${identity.key}`], depth + 1);
      }
    } else for (const [field, child] of Object.entries(value)) {
      if (forbidden.has(field)) continue;
      if (child && typeof child === 'object') visit(child, [...path, field], depth + 1);
      else if (field === 'description' && typeof child === 'string' && child.startsWith('{')) {
        try { visit(JSON.parse(child), [...path, `$json:${field}`], depth + 1); } catch { /* Plain descriptions are not collections. */ }
      }
    }
  }
  if (data && typeof data === 'object') for (const root of roots) visit((data as AnyRecord)[root], [root], 0);
  return result;
}
export function resolveRecordSource(index: Map<string, RecordPath[]>, keys: string[], module: string) {
  if (!keys.length || new Set(keys).size !== keys.length) return;
  const options = index.get(keys[0]) || [];
  const preferred: Record<string,string> = { tasks:'taskModule',work:'agendaModule',suggestions:'suggestionModule',notes:'notesModule',diary:'diaryModule',admin:'access',catalogs:'customerModule',chat:'chatModule' };
  return options.filter(path => keys.every(key => index.get(key)?.some(candidate => JSON.stringify(candidate) === JSON.stringify(path))))
    .sort((a,b) => Number(b[0] === preferred[module]) - Number(a[0] === preferred[module]) || a.length - b.length)[0];
}
/** Merge fresh page rows without discarding other pages, selections or analytical totals. */
export function mergeRecordPage<T>(data: T, path: RecordPath, rows: unknown[]): T {
  if (path.some(segment => forbidden.has(segment))) return data;
  const incoming = new Map(rows.map(row => [rowIdentity(row)?.key, row])); incoming.delete(undefined);
  function merge(value: unknown, position: number): unknown {
    if (position === path.length) {
      if (!Array.isArray(value)) return value;
      let changed = false;
      const next = value.map(row => {
        const update = incoming.get(rowIdentity(row)?.key); if (!update || typeof update !== 'object') return row;
        const current = row as AnyRecord, fresh = update as AnyRecord;
        if (typeof current.version === 'number' && typeof fresh.version === 'number' && current.version > fresh.version) return row;
        const combined = { ...current, ...fresh };
        if (JSON.stringify(combined) === JSON.stringify(current)) return row;
        changed = true; return combined;
      });
      return changed ? next : value;
    }
    const segment = path[position];
    if (segment.startsWith('@')) {
      if (!Array.isArray(value)) return value;
      const split = segment.indexOf(':'); const field = segment.slice(1, split), key = segment.slice(split + 1);
      if (split < 2 || forbidden.has(field)) return value;
      let changed = false;
      const next = value.map(row => { if (recordKey((row as AnyRecord)[field]) !== key) return row; const updated = merge(row, position + 1); changed ||= updated !== row; return updated; });
      return changed ? next : value;
    }
    if (!value || typeof value !== 'object') return value;
    const object = value as AnyRecord;
    if (segment.startsWith('$json:')) {
      const field = segment.slice(6); if (forbidden.has(field) || typeof object[field] !== 'string') return value;
      try { const old = JSON.parse(object[field] as string); const next = merge(old, position + 1); return old === next ? value : { ...object, [field]: JSON.stringify(next) }; } catch { return value; }
    }
    if (!Object.hasOwn(object, segment)) return value;
    const next = merge(object[segment], position + 1); return next === object[segment] ? value : { ...object, [segment]: next };
  }
  return merge(data, 0) as T;
}
export type RecordPage = { keys: string[]; rows: unknown[]; page: number; pageSize: number; total: number };
export async function fetchRecordPage(path: RecordPath, keys: string[], page: number, pageSize: number, signal: AbortSignal): Promise<RecordPage> {
  const response = await fetch('/api/record-pages', { method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store', signal, body: JSON.stringify({ path, keys, page, pageSize }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || 'Não foi possível carregar esta página.');
  if (!Array.isArray(result.keys) || !Array.isArray(result.rows) || !Number.isSafeInteger(result.total)) throw new Error('A API retornou uma página inválida.');
  return result;
}

export function mergeRecordRows<T>(current: T[], rows: unknown[]): T[] {
  return mergeRecordPage({items:current}, ['items'], rows).items;
}
