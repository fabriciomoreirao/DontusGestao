import { normalizeWorkspaceSearch } from "./workspace-navigation.ts";

type SearchRecord = { customer_id?: string | null; title: string; customer_name: string; record_type: string; description: string };
const cache = new WeakMap<SearchRecord, string>();

/** Binary attachments are not searchable text and can be several megabytes long. */
export function recordSearchText(record: SearchRecord) {
  const existing = cache.get(record);
  if (existing !== undefined) return existing;
  const description = record.description.replace(/data:[^;,\s"\\]+;base64,[A-Za-z0-9+/=\r\n]+/g, "");
  const text = normalizeWorkspaceSearch(`${record.customer_id ?? ""} ${record.title} ${record.customer_name} ${record.record_type} ${description}`);
  cache.set(record, text);
  return text;
}
