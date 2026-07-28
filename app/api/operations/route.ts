import { currentUser } from "@/lib/auth";
import { audit, ensureDatabase, getD1 } from "@/lib/database";
import { canTransition, initialStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

type OperationPayload = {
  action?: string;
  [key: string]: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function problem(title: string, status: number, detail: string, errors?: Record<string, string>) {
  return Response.json({
    type: "https://dontus.local/problems/validation",
    title, status, detail, correlationId: crypto.randomUUID(), errors,
  }, { status });
}

async function snapshot() {
  const db = getD1();
  const [
    customers, items, appointments, approvals, decisions, auditRows, moduleCounts,
  ] = await Promise.all([
    db.prepare("SELECT * FROM customers ORDER BY updated_at DESC LIMIT 100").all(),
    db.prepare("SELECT * FROM work_items ORDER BY updated_at DESC LIMIT 250").all(),
    db.prepare("SELECT * FROM appointments ORDER BY starts_at ASC LIMIT 100").all(),
    db.prepare("SELECT * FROM approvals ORDER BY created_at DESC LIMIT 100").all(),
    db.prepare("SELECT * FROM decision_items ORDER BY code ASC").all(),
    db.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 80").all(),
    db.prepare("SELECT module, COUNT(*) AS total FROM work_items GROUP BY module").all(),
  ]);
  return {
    customers: customers.results,
    items: items.results,
    appointments: appointments.results,
    approvals: approvals.results,
    decisions: decisions.results,
    audit: auditRows.results,
    moduleCounts: moduleCounts.results,
  };
}

export async function GET() {
  try {
    await ensureDatabase();
    const user = await currentUser();
    return Response.json({ user, ...(await snapshot()) });
  } catch (error) {
    return problem("Falha ao carregar a operação", 500, error instanceof Error ? error.message : "Erro inesperado");
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const user = await currentUser();
    const payload = await request.json() as OperationPayload;
    const action = text(payload.action);
    const db = getD1();

    if (action === "createCustomer") {
      const legalName = text(payload.legalName);
      const tradeName = text(payload.tradeName) || legalName;
      if (!legalName) return problem("Cliente inválido", 400, "Informe a razão social.", { legalName: "Campo obrigatório" });
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO customers (
          id, legal_name, trade_name, document_masked, segment, status, owner, cs_owner,
          support_owner, strategic, clinics_count, monthly_revenue_cents, created_by
        ) VALUES (?, ?, ?, ?, ?, 'Ativo', ?, ?, 'Fila de suporte', ?, ?, ?, ?)`,
      ).bind(
        id, legalName, tradeName, text(payload.documentMasked), text(payload.segment) || "Clínica odontológica",
        text(payload.owner) || user.displayName, text(payload.csOwner) || "Não atribuído",
        payload.strategic ? 1 : 0, Math.max(1, integer(payload.clinicsCount, 1)),
        Math.max(0, integer(payload.monthlyRevenueCents)), user.email,
      ).run();
      await audit(user.email, "Create", "customer", id, "customers", { tradeName });
      return Response.json({ ok: true, id, ...(await snapshot()) }, { status: 201 });
    }

    if (action === "createWorkItem") {
      const moduleKey = text(payload.module);
      const title = text(payload.title);
      const recordType = text(payload.recordType);
      if (!moduleKey || !title || !recordType) {
        return problem("Registro inválido", 400, "Módulo, tipo e título são obrigatórios.");
      }
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO work_items (
          id, module, record_type, title, customer_id, customer_name, owner, team,
          status, priority, due_at, sla_due_at, amount_cents, description, tags,
          origin_type, origin_id, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id, moduleKey, recordType, title, text(payload.customerId) || null,
        text(payload.customerName), text(payload.owner) || user.displayName,
        text(payload.team), initialStatus(moduleKey), text(payload.priority) || "P3",
        text(payload.dueAt) || null, text(payload.slaDueAt) || null,
        Math.max(0, integer(payload.amountCents)), text(payload.description),
        JSON.stringify(Array.isArray(payload.tags) ? payload.tags : []),
        text(payload.originType) || null, text(payload.originId) || null, user.email,
      ).run();
      await db.prepare(
        `INSERT INTO activities (id, entity_type, entity_id, module, kind, summary, actor)
         VALUES (?, 'work_item', ?, ?, 'Criado', ?, ?)`,
      ).bind(crypto.randomUUID(), id, moduleKey, `${recordType} criado: ${title}`, user.displayName).run();
      await audit(user.email, "Create", "work_item", id, moduleKey, { recordType, title });
      return Response.json({ ok: true, id, ...(await snapshot()) }, { status: 201 });
    }

    if (action === "transitionWorkItem") {
      const id = text(payload.id);
      const nextStatus = text(payload.nextStatus);
      const row = await db.prepare("SELECT * FROM work_items WHERE id = ?").bind(id).first<Record<string, unknown>>();
      if (!row) return problem("Registro não encontrado", 404, "O item pode ter sido removido ou está fora do seu escopo.");
      const moduleKey = String(row.module);
      const current = String(row.status);
      if (!canTransition(moduleKey, current, nextStatus)) {
        return problem("Transição inválida", 409, `Não é permitido mover ${current} para ${nextStatus}.`);
      }
      if (moduleKey === "commercial" && nextStatus === "Ganho" && (!row.customer_id || Number(row.amount_cents) <= 0)) {
        return problem("Venda incompleta", 409, "Para marcar como ganho, vincule cliente e informe valor.");
      }
      if (
        (moduleKey === "cs" && ["Finalizado", "TransferidoSuporte"].includes(nextStatus)) ||
        (moduleKey === "lia" && ["GoLiveAgendado", "Concluida"].includes(nextStatus)) ||
        (moduleKey === "finance" && ["Aprovada", "Paga", "Estornada"].includes(nextStatus))
      ) {
        if (payload.confirmed !== true) {
          return problem("Confirmação obrigatória", 409, "Esta ação sensível exige confirmação explícita e evidência registrada.");
        }
      }
      await db.prepare(
        `UPDATE work_items SET status = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE id = ? AND version = ?`,
      ).bind(nextStatus, id, integer(payload.version, Number(row.version))).run();
      await db.prepare(
        `INSERT INTO activities (id, entity_type, entity_id, module, kind, summary, actor)
         VALUES (?, 'work_item', ?, ?, 'Status alterado', ?, ?)`,
      ).bind(crypto.randomUUID(), id, moduleKey, `${current} → ${nextStatus}`, user.displayName).run();
      await audit(user.email, "Transition", "work_item", id, moduleKey, { from: current, to: nextStatus });
      return Response.json({ ok: true, ...(await snapshot()) });
    }

    if (action === "createAppointment") {
      const startsAt = text(payload.startsAt);
      const endsAt = text(payload.endsAt);
      const owner = text(payload.owner) || user.displayName;
      if (!text(payload.title) || !startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
        return problem("Compromisso inválido", 400, "Informe título, início e término válidos.");
      }
      const conflict = await db.prepare(
        `SELECT id FROM appointments WHERE owner = ? AND status NOT IN ('Cancelado')
         AND starts_at < ? AND ends_at > ? LIMIT 1`,
      ).bind(owner, endsAt, startsAt).first();
      if (conflict) return problem("Conflito de agenda", 409, "O responsável já possui uma reserva neste horário.");
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO appointments (
          id, title, kind, customer_id, customer_name, owner, team, starts_at, ends_at,
          status, meeting_url, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Agendado', ?, ?)`,
      ).bind(
        id, text(payload.title), text(payload.kind) || "Compromisso",
        text(payload.customerId) || null, text(payload.customerName), owner,
        text(payload.team) || "CS", startsAt, endsAt, text(payload.meetingUrl), user.email,
      ).run();
      await audit(user.email, "Create", "appointment", id, "work", { startsAt, owner });
      return Response.json({ ok: true, id, ...(await snapshot()) }, { status: 201 });
    }

    if (action === "decideApproval") {
      const id = text(payload.id);
      const decision = text(payload.decision);
      const row = await db.prepare("SELECT * FROM approvals WHERE id = ?").bind(id).first<Record<string, unknown>>();
      if (!row) return problem("Aprovação não encontrada", 404, "Solicitação indisponível.");
      if (String(row.requester).toLowerCase() === user.email.toLowerCase()) {
        return problem("Autoaprovação bloqueada", 403, "O solicitante não pode aprovar a própria solicitação.");
      }
      if (!["Aprovado", "Reprovado", "Solicitar ajustes"].includes(decision)) {
        return problem("Decisão inválida", 400, "Escolha uma decisão permitida.");
      }
      if (decision !== "Aprovado" && !text(payload.justification)) {
        return problem("Justificativa obrigatória", 400, "Reprovação ou ajuste exige justificativa.");
      }
      await db.prepare(
        `UPDATE approvals SET status = ?, justification = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).bind(decision, text(payload.justification), user.email, id).run();
      await audit(user.email, "Approve", "approval", id, "approvals", { decision });
      return Response.json({ ok: true, ...(await snapshot()) });
    }

    if (action === "seedDemo") {
      const count = await db.prepare("SELECT COUNT(*) AS total FROM customers").first<{ total: number }>();
      if ((count?.total ?? 0) > 0) return problem("Ambiente já possui dados", 409, "A demonstração só pode ser carregada em uma base vazia.");
      const customerRows = [
        ["Sorriso Prime Odontologia Ltda.", "Sorriso Prime", "Clínica premium", 2, 1890000, 1],
        ["Rede Oral Mais S.A.", "Oral Mais", "Rede odontológica", 8, 4650000, 1],
        ["Clínica Aurora Saúde Ltda.", "Aurora Saúde", "Clínica odontológica", 1, 890000, 0],
        ["Instituto Vida Dental Ltda.", "Vida Dental", "Implantodontia", 3, 1520000, 0],
        ["Odonto Center Participações Ltda.", "Odonto Center", "Rede regional", 5, 2380000, 1],
      ];
      const created: Array<{ id: string; name: string }> = [];
      for (const [legalName, tradeName, segment, clinics, revenue, strategic] of customerRows) {
        const id = crypto.randomUUID();
        created.push({ id, name: String(tradeName) });
        await db.prepare(
          `INSERT INTO customers (
            id, legal_name, trade_name, segment, owner, cs_owner, strategic,
            clinics_count, monthly_revenue_cents, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(id, legalName, tradeName, segment, "Marina Costa", "Beatriz Lima", strategic, clinics, revenue, user.email).run();
      }
      const demos = [
        ["commercial", "Oportunidade", "Expansão plano Performance", 0, "Negociacao", "P1", 3200000],
        ["cs", "Onboarding", "Onboarding de 90 dias", 2, "EmAcompanhamento", "P2", 0],
        ["lia", "Projeto LIA", "LIA Performance + CRC", 1, "EmTesteCliente", "P1", 0],
        ["support", "Ticket", "Falha na emissão de nota fiscal", 3, "EmAtendimento", "P1", 0],
        ["ti", "Bug", "Duplicidade no retorno bancário", 4, "EmTriagem", "P0", 0],
        ["finance", "Conta a pagar", "Cloudia — competência julho", 0, "PendenteAprovacao", "P2", 485000],
        ["procurement", "Compra", "Novos notebooks para CS", 1, "EmCotacao", "P3", 1875000],
        ["work", "Tarefa", "Revisar clientes com baixa utilização", 2, "Em andamento", "P2", 0],
      ];
      for (const [module, recordType, title, customerIndex, status, priority, amount] of demos) {
        const customer = created[Number(customerIndex)];
        await db.prepare(
          `INSERT INTO work_items (
            id, module, record_type, title, customer_id, customer_name, owner, team,
            status, priority, due_at, sla_due_at, amount_cents, description, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(), module, recordType, title, customer.id, customer.name,
          module === "ti" ? "Rafael Torres" : "Beatriz Lima", String(module).toUpperCase(),
          status, priority, new Date(Date.now() + 3 * 86400000).toISOString(),
          new Date(Date.now() + 8 * 3600000).toISOString(), amount,
          "Registro de demonstração carregado de forma explícita pelo administrador.", user.email,
        ).run();
      }
      const approvalId = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO approvals (
          id, kind, source_id, source_title, requester, approver_role, amount_cents
        ) VALUES (?, 'Compra', ?, 'Novos notebooks para CS', 'financeiro@dontus.local',
          'Aprovador Financeiro Especial', 1875000)`,
      ).bind(approvalId, crypto.randomUUID()).run();
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
      const end = new Date(start.getTime() + 90 * 60000);
      await db.prepare(
        `INSERT INTO appointments (
          id, title, kind, customer_id, customer_name, owner, team, starts_at, ends_at, meeting_url, created_by
        ) VALUES (?, 'Treinamento inicial Dontus', 'Treinamento', ?, ?, 'Beatriz Lima', 'CS', ?, ?, '', ?)`,
      ).bind(crypto.randomUUID(), created[2].id, created[2].name, start.toISOString(), end.toISOString(), user.email).run();
      await audit(user.email, "Seed", "workspace", "demo", "admin", { customers: created.length, records: demos.length });
      return Response.json({ ok: true, ...(await snapshot()) }, { status: 201 });
    }

    return problem("Ação desconhecida", 400, "A operação solicitada não é suportada.");
  } catch (error) {
    return problem("Falha na operação", 500, error instanceof Error ? error.message : "Erro inesperado");
  }
}
