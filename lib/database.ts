import { env } from "cloudflare:workers";

let initialization: Promise<void> | null = null;

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'administrator', department TEXT NOT NULL DEFAULT 'Gestão',
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, legal_name TEXT NOT NULL, trade_name TEXT NOT NULL,
    document_masked TEXT NOT NULL DEFAULT '', segment TEXT NOT NULL DEFAULT 'Clínica odontológica',
    status TEXT NOT NULL DEFAULT 'Ativo', owner TEXT NOT NULL DEFAULT 'Não atribuído',
    cs_owner TEXT NOT NULL DEFAULT 'Não atribuído', support_owner TEXT NOT NULL DEFAULT 'Fila de suporte',
    strategic INTEGER NOT NULL DEFAULT 0, clinics_count INTEGER NOT NULL DEFAULT 1,
    monthly_revenue_cents INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS work_items (
    id TEXT PRIMARY KEY, module TEXT NOT NULL, record_type TEXT NOT NULL, title TEXT NOT NULL,
    customer_id TEXT, customer_name TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL DEFAULT 'Não atribuído',
    team TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'P3',
    due_at TEXT, sla_due_at TEXT, amount_cents INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
    origin_type TEXT, origin_id TEXT, created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, customer_id TEXT,
    customer_name TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL, team TEXT NOT NULL,
    starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Agendado',
    meeting_url TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, source_id TEXT NOT NULL, source_title TEXT NOT NULL,
    requester TEXT NOT NULL, approver_role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pendente',
    amount_cents INTEGER NOT NULL DEFAULT 0, justification TEXT NOT NULL DEFAULT '',
    decided_by TEXT, decided_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
    module TEXT NOT NULL, kind TEXT NOT NULL, summary TEXT NOT NULL, actor TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'Compartilhada', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, action TEXT NOT NULL, resource TEXT NOT NULL,
    resource_id TEXT NOT NULL, module TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}',
    result TEXT NOT NULL DEFAULT 'Sucesso', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS decision_items (
    code TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pendente',
    risk TEXT NOT NULL, default_behavior TEXT NOT NULL, owner TEXT NOT NULL DEFAULT 'Product Owner',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS work_items_module_status_idx ON work_items(module, status)`,
  `CREATE INDEX IF NOT EXISTS work_items_customer_idx ON work_items(customer_id)`,
  `CREATE INDEX IF NOT EXISTS customers_status_idx ON customers(status)`,
  `CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events(created_at)`,
];

const decisions = [
  ["V-001", "Destino do Base 44", "Alto", "Manter legado ativo; migração bloqueada"],
  ["V-002", "Nome oficial e product owner", "Médio", "Usar Sistema Integrado de Operações Dontus"],
  ["V-003", "Fonte de verdade por cadastro", "Alto", "Dontus operacional; conflitos exigem revisão"],
  ["V-004", "Calendário e pausa do SLA", "Alto", "Exibir cenários; não pausar automaticamente"],
  ["V-005", "Alçadas financeiras", "Crítico", "Bloquear execução sem política aprovada"],
  ["V-006", "Cliente em haver", "Crítico", "Somente registro; sem consequência financeira"],
  ["V-007", "Critério de grande cliente", "Médio", "Classificação manual aprovada"],
  ["V-008", "Treinamentos e preços", "Alto", "Cobrança bloqueada sem tabela vigente"],
  ["V-009", "Metas comerciais", "Médio", "Carga inicial configurável: 12 mil/10 mil"],
  ["V-010", "Planos e recursos LIA", "Alto", "Growth e Performance configuráveis"],
  ["V-011", "Portal externo do cliente", "Médio", "Fluxos permanecem internos"],
  ["V-012", "Canais e consentimentos", "Alto", "Envio externo desativado até validação"],
  ["V-013", "APIs Sicoob e CelCash", "Crítico", "Somente simulação; emissão bloqueada"],
  ["V-014", "Integração Dontus", "Alto", "Adaptador desativado; evidência manual"],
  ["V-015", "Retenção, anonimização, RPO e RTO", "Crítico", "Exclusão física desativada"],
  ["V-016", "Escopo de migração do legado", "Alto", "Apenas dry-run e reconciliação"],
  ["V-017", "Configurações por papel", "Alto", "Menor privilégio e autorização explícita"],
  ["V-018", "Avisos do Dontus Pay", "Médio", "Fila interna para responsável configurável"],
  ["V-019", "Ambientes e aprovadores de deploy", "Crítico", "Deploy sensível bloqueado"],
  ["V-020", "Falta de retorno em CS/LIA", "Alto", "Permitir bloqueio/pausa com justificativa"],
];

export function getD1(): D1Database {
  if (!env.DB) throw new Error("A persistência D1 não está disponível.");
  return env.DB;
}

export async function ensureDatabase(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    const db = getD1();
    for (const statement of statements) await db.prepare(statement).run();
    for (const [code, title, risk, defaultBehavior] of decisions) {
      await db.prepare(
        `INSERT OR IGNORE INTO decision_items (code, title, risk, default_behavior)
         VALUES (?, ?, ?, ?)`,
      ).bind(code, title, risk, defaultBehavior).run();
    }
  })();
  return initialization;
}

export async function audit(
  actor: string,
  action: string,
  resource: string,
  resourceId: string,
  module: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await getD1().prepare(
    `INSERT INTO audit_events (id, actor_email, action, resource, resource_id, module, details)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), actor, action, resource, resourceId, module, JSON.stringify(details)).run();
}
