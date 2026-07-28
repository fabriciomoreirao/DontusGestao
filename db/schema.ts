import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("administrator"),
    department: text("department").notNull().default("Gestão"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("users_email_uidx").on(table.email)],
);

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    legalName: text("legal_name").notNull(),
    tradeName: text("trade_name").notNull(),
    documentMasked: text("document_masked").notNull().default(""),
    segment: text("segment").notNull().default("Clínica odontológica"),
    status: text("status").notNull().default("Ativo"),
    owner: text("owner").notNull().default("Não atribuído"),
    csOwner: text("cs_owner").notNull().default("Não atribuído"),
    supportOwner: text("support_owner").notNull().default("Fila de suporte"),
    strategic: integer("strategic", { mode: "boolean" }).notNull().default(false),
    clinicsCount: integer("clinics_count").notNull().default(1),
    monthlyRevenueCents: integer("monthly_revenue_cents").notNull().default(0),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("customers_status_idx").on(table.status),
    index("customers_owner_idx").on(table.owner),
  ],
);

export const workItems = sqliteTable(
  "work_items",
  {
    id: text("id").primaryKey(),
    module: text("module").notNull(),
    recordType: text("record_type").notNull(),
    title: text("title").notNull(),
    customerId: text("customer_id"),
    customerName: text("customer_name").notNull().default(""),
    owner: text("owner").notNull().default("Não atribuído"),
    team: text("team").notNull().default(""),
    status: text("status").notNull(),
    priority: text("priority").notNull().default("P3"),
    dueAt: text("due_at"),
    slaDueAt: text("sla_due_at"),
    amountCents: integer("amount_cents").notNull().default(0),
    description: text("description").notNull().default(""),
    tags: text("tags").notNull().default("[]"),
    originType: text("origin_type"),
    originId: text("origin_id"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("work_items_module_status_idx").on(table.module, table.status),
    index("work_items_customer_idx").on(table.customerId),
    index("work_items_owner_idx").on(table.owner),
    index("work_items_due_idx").on(table.dueAt),
  ],
);

export const appointments = sqliteTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    customerId: text("customer_id"),
    customerName: text("customer_name").notNull().default(""),
    owner: text("owner").notNull(),
    team: text("team").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    status: text("status").notNull().default("Agendado"),
    meetingUrl: text("meeting_url").notNull().default(""),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("appointments_owner_time_idx").on(table.owner, table.startsAt, table.endsAt),
  ],
);

export const approvals = sqliteTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    sourceId: text("source_id").notNull(),
    sourceTitle: text("source_title").notNull(),
    requester: text("requester").notNull(),
    approverRole: text("approver_role").notNull(),
    status: text("status").notNull().default("Pendente"),
    amountCents: integer("amount_cents").notNull().default(0),
    justification: text("justification").notNull().default(""),
    decidedBy: text("decided_by"),
    decidedAt: text("decided_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("approvals_status_idx").on(table.status)],
);

export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    module: text("module").notNull(),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    actor: text("actor").notNull(),
    visibility: text("visibility").notNull().default("Compartilhada"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("activities_entity_idx").on(table.entityType, table.entityId, table.createdAt),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    resourceId: text("resource_id").notNull(),
    module: text("module").notNull(),
    details: text("details").notNull().default("{}"),
    result: text("result").notNull().default("Sucesso"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("audit_resource_idx").on(table.resource, table.resourceId),
    index("audit_created_idx").on(table.createdAt),
  ],
);

export const decisionItems = sqliteTable("decision_items", {
  code: text("code").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull().default("Pendente"),
  risk: text("risk").notNull(),
  defaultBehavior: text("default_behavior").notNull(),
  owner: text("owner").notNull().default("Product Owner"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
