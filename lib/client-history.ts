type RecordData = Record<string, unknown>;

export type HistoryCustomer = {
  id: string; document_masked: string; trade_name: string; legal_name: string;
  phone?: string; email?: string;
};

export type HistoryRecord = {
  id: string; module: string; record_type: string; title: string;
  customer_id: string | null; customer_name: string; description: string;
  owner: string; created_at: string; updated_at: string;
};

const normalized = (value: unknown) => typeof value === "string"
  ? value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR") : "";
const placeholders = new Set(["lead", "lead sem cliente vinculado", "sem cliente vinculado", "nao informado", "nao definida", "registro do sistema"]);
const meaningful = (value: unknown) => Boolean(normalized(value) && !placeholders.has(normalized(value)));
const identifier = (value: unknown) => {
  const key = normalized(value).replace(/^#/, "");
  return /^[\d.\s-]+$/.test(key) ? key.replace(/\D/g, "") : key;
};
const phoneKey = (value: unknown) => {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  const local = digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
  return local.length >= 10 ? local : "";
};

export function clientRecordData(description: string): RecordData {
  try {
    const value: unknown = JSON.parse(description);
    return value && typeof value === "object" && !Array.isArray(value) ? value as RecordData : {};
  } catch { return {}; }
}

function recordIdentity(item: HistoryRecord) {
  const detail = clientRecordData(item.description);
  const onboarding = detail.onboarding && typeof detail.onboarding === "object" ? detail.onboarding as RecordData : {};
  return {
    ids: [item.customer_id, detail.customerId, detail.clientId, detail.sourceClientId, onboarding.clientId].filter(meaningful).map(identifier),
    names: [item.customer_name, detail.customer, detail.customerName, detail.clientName,
      ...(item.module === "commercial" ? [item.title, detail.kind === "directSale" ? detail.name : ""] : [])].filter(meaningful).map(normalized),
    phone: phoneKey(detail.phone || detail.whatsapp),
    email: normalized(detail.email),
    references: [detail.sourceLeadId, detail.sourceJourneyId, detail.sourceQualificationId, detail.sourceEntityId, detail.sourceItemId, detail.linkedCsItemId].filter(meaningful).map(normalized),
  };
}

/** Prefer the actual source record over labels inferred from the card's visible text. */
export function clientRecordQuery(context: { entityId?: string; clientId?: string; customerName?: string; title?: string }, items: HistoryRecord[]) {
  const source = items.find(item => normalized(item.id) === normalized(context.entityId));
  if (source) return source.customer_id || source.id;
  return [context.clientId, context.customerName, context.title].find(meaningful) || "";
}

/** Resolve only identity fields and explicit source links; comments are never identifiers. */
export function resolveClientHistory<C extends HistoryCustomer, R extends HistoryRecord>(query: string, customers: C[], records: R[]): {
  customer: C | undefined; source: R | undefined; items: R[]; belongs: (...values: unknown[]) => boolean;
} {
  const key = normalized(query);
  const source = records.find(item => normalized(item.id) === key);
  const identities = new Map(records.map(item => [item.id, recordIdentity(item)]));
  const customerIds = (customer: C) => [customer.id, customer.document_masked].filter(meaningful).map(identifier);
  const customerNames = (customer: C) => [customer.trade_name, customer.legal_name].filter(meaningful).map(normalized);
  const uniqueCustomer = (matches: C[]) => matches.length === 1 ? matches[0] : undefined;
  const sourceIdentity = source ? identities.get(source.id)! : undefined;
  let customer = uniqueCustomer(customers.filter(entry => customerIds(entry).includes(identifier(query))))
    ?? uniqueCustomer(customers.filter(entry => customerNames(entry).includes(key)));
  if (!customer && sourceIdentity) {
    customer = uniqueCustomer(customers.filter(entry => customerIds(entry).some(id => sourceIdentity.ids.includes(id))));
    if (!customer && !sourceIdentity.ids.length) customer = uniqueCustomer(customers.filter(entry =>
      customerNames(entry).some(name => sourceIdentity.names.includes(name))
      || Boolean(sourceIdentity.phone && phoneKey(entry.phone) === sourceIdentity.phone)
      || Boolean(sourceIdentity.email && normalized(entry.email) === sourceIdentity.email)));
  }
  if (!customer && !source && meaningful(query) && key.length >= 3) {
    customer = uniqueCustomer(customers.filter(entry => customerNames(entry).some(name => name.includes(key))));
  }

  const queryIsId = /^\d{6}$/.test(identifier(query)) || /^[\da-f]{8}-[\da-f-]{27}$/i.test(key);
  const ids = new Set(customer ? customerIds(customer) : sourceIdentity?.ids ?? (queryIsId ? [identifier(query)] : []));
  const uniqueName = (name: string) => customers.filter(entry => customerNames(entry).includes(name)).length <= 1;
  const names = new Set(customer ? customerNames(customer).filter(uniqueName) : sourceIdentity?.names ?? (meaningful(query) ? [key] : []));
  sourceIdentity?.names.filter(uniqueName).forEach(name => names.add(name));
  // An ID may exist only on the won lead while its original qualification still has no ID.
  for (const item of records) {
    const identity = identities.get(item.id)!;
    if (item.module === "commercial" && identity.ids.some(id => ids.has(id))
      && (!customer || !item.customer_id || identifier(item.customer_id) === identifier(customer.id))) {
      identity.names.filter(uniqueName).forEach(name => names.add(name));
    }
  }
  // A shared switchboard or email must not merge two registered customers.
  const phone = phoneKey(customer?.phone) || sourceIdentity?.phone || "";
  const email = normalized(customer?.email) || sourceIdentity?.email || "";
  const phoneIsUnique = phone && customers.filter(entry => phoneKey(entry.phone) === phone).length <= 1;
  const emailIsUnique = email && customers.filter(entry => normalized(entry.email) === email).length <= 1;
  const linked = new Set<string>(source ? [source.id] : []);
  const conflicts = (item: R) => {
    const identity = identities.get(item.id)!;
    // Explicit links take precedence over matching names or contact details.
    return Boolean((customer && item.customer_id && identifier(item.customer_id) !== identifier(customer.id))
      || (ids.size && identity.ids.length && !identity.ids.some(id => ids.has(id))));
  };
  for (const item of records) {
    const identity = identities.get(item.id)!;
    if (conflicts(item)) continue;
    if (identity.ids.some(id => ids.has(id)) || identity.names.some(name => names.has(name))
      || (item.module === "commercial" && ((phoneIsUnique && identity.phone === phone) || (emailIsUnique && identity.email === email)))) linked.add(item.id);
  }
  // Follow conversion/qualification links in both directions, including older leads without a customer ID.
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of records) {
      if (conflicts(item)) continue;
      const references = identities.get(item.id)!.references;
      if (!linked.has(item.id) && !references.some(id => linked.has(id))) continue;
      for (const id of [item.id, ...references]) {
        const target = records.find(entry => normalized(entry.id) === id);
        if (target && !conflicts(target) && !linked.has(target.id)) { linked.add(target.id); changed = true; }
      }
    }
  }
  const items = records.filter(item => linked.has(item.id));
  if (!customer && source) {
    const linkedIds = items.flatMap(item => identities.get(item.id)!.ids);
    const convertedCustomer = uniqueCustomer(customers.filter(entry => customerIds(entry).some(id => linkedIds.includes(id))));
    if (convertedCustomer) return { ...resolveClientHistory(convertedCustomer.id, customers, records), source };
  }
  const aliases = new Set([...(customer ? customerIds(customer) : []), ...ids, ...names]);
  for (const item of items) {
    const identity = identities.get(item.id)!;
    identity.ids.forEach(id => aliases.add(id));
    if (item.module === "commercial") identity.names.forEach(name => aliases.add(name));
  }
  const belongs = (...values: unknown[]) => values.some(value => meaningful(value)
    && [...aliases].some(alias => alias && (identifier(value) === alias || normalized(value).includes(alias))));
  return { customer, source, items, belongs };
}

export type ClientEvolution = { id: string; text: string; author: string; at: string; source: string; type: string; sourceId: string };
const evolutionCollections: Record<string, string> = {
  comments: "Comentário", history: "Movimentação", follows: "Follow-up", interactions: "Interação",
  treatments: "Tratativa", communications: "Comunicação", scoreEvolution: "Evolução de score",
};

export function structuredClientEvolutions(item: HistoryRecord, source = item.module): ClientEvolution[] {
  const found: ClientEvolution[] = [];
  const visit = (value: unknown, collection = "", path = "") => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        const entryPath = `${path}-${index}`;
        const defaultType = evolutionCollections[collection];
        if (defaultType) {
          const data = entry && typeof entry === "object" ? entry as RecordData : {};
          const text = typeof entry === "string" ? entry.trim()
            : String(data.body ?? data.text ?? data.comment ?? data.details ?? data.notes ?? data.summary ?? "").trim();
          if (text) found.push({
            id: String(data.id ?? `${item.id}${entryPath}`), text,
            author: String(data.authorName || data.author || data.by || data.user || data.actor || data.createdBy || item.owner || "Não informado"),
            at: String(data.createdAt || data.at || data.date || data.updatedAt || item.updated_at),
            source, type: String(data.type || data.kind || defaultType), sourceId: item.id,
          });
        }
        visit(entry, collection, entryPath);
      });
      return;
    }
    if (value && typeof value === "object") Object.entries(value as RecordData).forEach(([key, entry]) => visit(entry, key, `${path}-${key}`));
  };
  visit(clientRecordData(item.description));
  return found;
}

export function consolidateClientEvolutions(entries: ClientEvolution[], commercialIds: Set<string>) {
  const seen = new Set<string>();
  return entries.filter(entry => {
    // Qualification copies keep the original entries and timestamps: display them once.
    const scope = commercialIds.has(entry.sourceId) ? "commercial" : entry.sourceId;
    const key = JSON.stringify([scope, entry.at, entry.author, entry.type, entry.text]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
}
