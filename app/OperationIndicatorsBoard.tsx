"use client";

import { Activity, BarChart3, CheckCircle2, Clock3, Filter, Gauge, Lightbulb, TrendingUp, UsersRound, WalletCards, X } from "lucide-react";
import { useMemo, useState } from "react";

type Item = {
  id: string; module: string; record_type: string; title: string; customer_name?: string; owner: string; team: string;
  status: string; amount_cents: number; description?: string; created_at: string; updated_at: string;
};
type Employee = { id: string; displayName: string; departmentName: string; active: boolean; photoDataUrl?: string };
type Detail = Record<string, unknown>;
type Metric = { label: string; value: string | number; note: string };
type CountEntry = { label: string; count: number };
type ChartConfig = {
  trendTitle: string;
  statusTitle: string;
  statusUnit: string;
  ownerTitle: string;
  ownerUnit: string;
  categoryTitle: string;
  categoryUnit: string;
  statuses: CountEntry[];
  owners: CountEntry[];
  categories: CountEntry[];
};

const clean = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cents / 100);
const percent = (part: number, total: number) => total ? `${Math.round(part / total * 100)}%` : "0%";
const finished = (status: unknown) => /conclu|finaliz|aprov|ganho|feito|resolvid|contrat|liberad|sucesso/i.test(clean(status));
const rejected = (status: unknown) => /reprov|cancel|perdid|descart|sem retorno/i.test(clean(status));
const parse = (raw?: string): Detail => { try { return JSON.parse(raw || "{}") as Detail; } catch { return {}; } };
const numberOf = (...values: unknown[]) => { const value = values.find((entry) => Number.isFinite(Number(entry))); return value === undefined ? 0 : Number(value); };
const stringOf = (...values: unknown[]) => String(values.find((entry) => typeof entry === "string" && entry.trim()) ?? "");
const arrayOf = (value: unknown) => Array.isArray(value) ? value : [];
const dateKey = (value: string) => value.slice(0, 10);
const monthKey = (value: string) => value.slice(0, 7);
const monthLabel = (key: string) => { const [year, month] = key.split("-"); return `${month}/${year.slice(2)}`; };
const durationDays = (item: Item) => Math.max(0, Math.round((new Date(item.updated_at).getTime() - new Date(item.created_at).getTime()) / 86_400_000));

function scoreOf(detail: Detail) {
  const explicit = numberOf(detail.healthScore, detail.health_score, detail.usageScore, detail.usagePercent, detail.percentage, detail.score);
  if (explicit > 0) return Math.min(100, explicit <= 1 ? explicit * 100 : explicit);
  const base = arrayOf(detail.featuresBase ?? detail.baseFeatures ?? detail.features);
  const active = arrayOf(detail.featuresActive ?? detail.activeFeatures ?? detail.featuresInUse);
  if (!base.length) return 0;
  const names = new Set(active.map((entry) => clean(typeof entry === "object" && entry ? (entry as Detail).name : entry)));
  return Math.round(base.filter((entry) => names.has(clean(typeof entry === "object" && entry ? (entry as Detail).name : entry))).length / base.length * 100);
}

function scopeItems(items: Item[], module: string, contextKey: string) {
  if (module === "recruitment") return items.filter((item) => item.module === "admin" && /processo seletivo|candidato/i.test(item.record_type));
  if (module === "commercial") return items.filter((item) => {
    if (item.module !== "commercial") return false;
    const detail = parse(item.description);
    const flow = clean(detail.flow ?? detail.crmFlow ?? detail.kind ?? item.record_type);
    return contextKey.includes("retention") ? /retention|retencao/.test(flow) : !/retention|retencao/.test(flow);
  });
  if (module === "cs") return items.filter((item) => {
    if (item.module !== "cs") return false;
    const detail = parse(item.description);
    const kind = clean(detail.kind);
    if (contextKey.includes("enterprise")) return /enterprise/.test(kind) || /rede|unidade/.test(clean(item.record_type));
    if (contextKey.includes("evolution")) return /retention|retencao/.test(clean(detail.track ?? detail.flow ?? item.record_type));
    return !/enterprise|retention|retencao/.test(clean(`${kind} ${detail.track ?? ""}`));
  });
  if (module === "lia") return items.filter((item) => item.module === "lia" && item.record_type !== "Ajuste de Prompt");
  return items.filter((item) => item.module === module);
}

function topValue(values: string[]) {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Sem dados";
}

function counted(values: string[], limit = 6): CountEntry[] {
  const counts = new Map<string, number>();
  values.map((value) => value.trim()).filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, limit);
}

function normalizedStage(value: unknown, fallback = "Sem status") {
  const raw = stringOf(value) || fallback;
  const key = clean(raw);
  const known: Record<string, string> = {
    waiting: "Em espera", contacted: "Contato feito", approved: "Aprovada", rejected: "Reprovada",
    pending: "Pendente", tracking: "Em acompanhamento", conference: "Conferência", active: "Ativa", inactive: "Inativa",
  };
  return known[key] || raw;
}

function chartConfigFor(module: string, contextKey: string, rows: Item[]): ChartConfig {
  const details = rows.map((item) => ({ item, detail: parse(item.description) }));
  const defaults: ChartConfig = {
    trendTitle: "Movimentação mensal (6 meses)", statusTitle: "Distribuição por status", statusUnit: "etapas",
    ownerTitle: "Movimentação por responsável", ownerUnit: "responsáveis", categoryTitle: "Participação por setor", categoryUnit: "setores",
    statuses: counted(rows.map((item) => item.status || "Sem status")),
    owners: counted(rows.map((item) => item.owner || "Não atribuído")),
    categories: counted(rows.map((item) => item.team || "Sem setor")),
  };
  if (module === "waitingQueue") return {
    ...defaults, trendTitle: "Clientes encaminhados por mês", statusTitle: "Conversão de contatos", statusUnit: "situações",
    ownerTitle: "Contatos por responsável", ownerUnit: "responsáveis do contato", categoryTitle: "Clientes por setor", categoryUnit: "setores",
    statuses: counted(details.map(({ item, detail }) => normalizedStage(detail.state, /espera|aguard/i.test(item.status) ? "Em espera" : "Contato feito"))),
    owners: counted(details.map(({ detail }) => stringOf(detail.contactedByName, detail.contactOwner, detail.responsibleName) || "Sem responsável")),
    categories: counted(details.map(({ item, detail }) => stringOf(detail.departmentName, detail.department, detail.destinationSector, item.team) || "Sem setor")),
  };
  if (module === "support") return {
    ...defaults, trendTitle: "Atendimentos por mês", statusTitle: "Solução dos atendimentos", statusUnit: "situações",
    ownerTitle: "Atendimentos por responsável", ownerUnit: "responsáveis", categoryTitle: "Problemas e situações", categoryUnit: "categorias",
    statuses: counted(details.map(({ item, detail }) => normalizedStage(detail.solutionStatus ?? detail.status, item.status || "Sem status"))),
    owners: counted(rows.map((item) => item.owner || "Não atribuído")),
    categories: counted(details.map(({ item, detail }) => stringOf(detail.problem, detail.situation, detail.requestType, detail.subject, item.record_type) || "Não informado")),
  };
  if (module === "commercial") return {
    ...defaults, trendTitle: "Vendas e oportunidades por mês", statusTitle: "Funil comercial", statusUnit: "etapas",
    ownerTitle: "Vendas por colaborador", ownerUnit: "vendedores", categoryTitle: "Produtos e planos", categoryUnit: "produtos",
    statuses: counted(details.map(({ item, detail }) => normalizedStage(detail.stage, item.status || "Sem etapa"))),
    owners: counted(details.map(({ item, detail }) => stringOf(detail.sellerName, detail.seller, item.owner) || "Não atribuído")),
    categories: counted(details.flatMap(({ item, detail }) => {
      const products = arrayOf(detail.products).map((product) => typeof product === "object" && product ? stringOf((product as Detail).name, (product as Detail).productName, (product as Detail).planName) : stringOf(product)).filter(Boolean);
      return products.length ? products : [stringOf(detail.productName, detail.planName, item.record_type) || "Não informado"];
    })),
  };
  if (module === "cs" && contextKey.includes("enterprise")) {
    const networks = details.filter(({ item, detail }) => /enterprise/.test(clean(detail.kind)) || /rede/.test(clean(item.record_type)));
    const units = networks.flatMap(({ item, detail }) => arrayOf(detail.units).map((unit) => ({ network: item.title, unit: (typeof unit === "object" && unit ? unit : {}) as Detail })));
    return {
      ...defaults, trendTitle: "Redes cadastradas por mês", statusTitle: "Unidades por status", statusUnit: "status",
      ownerTitle: "Redes por responsável", ownerUnit: "responsáveis", categoryTitle: "Unidades por rede", categoryUnit: "redes",
      statuses: counted(units.map(({ unit }) => normalizedStage(unit.status, "Sem status"))),
      owners: counted(networks.map(({ item }) => item.owner || "Não atribuído")),
      categories: networks.map(({ item, detail }) => ({ label: item.title, count: arrayOf(detail.units).length })).sort((a, b) => b.count - a.count).slice(0, 6),
    };
  }
  if (module === "cs" || module === "lia") return {
    ...defaults, trendTitle: module === "lia" ? "Entradas no acompanhamento LIA" : "Clientes iniciados por mês",
    statusTitle: module === "lia" ? "Clientes por etapa LIA" : "Distribuição de status final", statusUnit: "etapas",
    ownerTitle: "Carteira por colaborador", ownerUnit: "responsáveis",
    categoryTitle: module === "lia" ? "Origem e tipo da solicitação" : "Clientes por versão", categoryUnit: module === "lia" ? "origens" : "versões",
    statuses: counted(details.map(({ item, detail }) => normalizedStage(detail.finalStatus ?? detail.phase ?? detail.stage, item.status || "Sem status"))),
    owners: counted(rows.map((item) => item.owner || "Não atribuído")),
    categories: counted(details.map(({ item, detail }) => module === "lia"
      ? stringOf(detail.requestType, detail.origin, detail.source, item.team, item.record_type) || "Não informado"
      : stringOf(detail.versionName, detail.version, detail.planName, item.record_type) || "Não informada")),
  };
  if (module === "recruitment") return {
    ...defaults, trendTitle: "Candidatos recebidos por mês", statusTitle: "Candidatos por etapa", statusUnit: "etapas",
    ownerTitle: "Processos por responsável", ownerUnit: "responsáveis", categoryTitle: "Candidatos por vaga", categoryUnit: "vagas",
    statuses: counted(details.filter(({ item }) => /candidato/i.test(item.record_type)).map(({ item, detail }) => normalizedStage(detail.stage, item.status || "Sem etapa"))),
    owners: counted(rows.filter((item) => /processo seletivo/i.test(item.record_type)).map((item) => item.owner || "Não atribuído")),
    categories: counted(details.filter(({ item }) => /candidato/i.test(item.record_type)).map(({ item, detail }) => stringOf(detail.vacancyName, detail.processTitle, detail.position, item.team) || "Vaga não informada")),
  };
  if (module === "commissions") return {
    ...defaults, trendTitle: "Comissões lançadas por mês", statusTitle: "Resultado da conferência", statusUnit: "decisões",
    ownerTitle: "Comissões por colaborador", ownerUnit: "colaboradores", categoryTitle: "Comissões por origem", categoryUnit: "origens",
    statuses: counted(details.map(({ item, detail }) => normalizedStage(detail.decision, item.status || "Pendente"))),
    owners: counted(details.map(({ item, detail }) => stringOf(detail.collaboratorName, detail.employeeName, item.owner) || "Não atribuído")),
    categories: counted(details.map(({ detail }) => {
      const scope = clean(detail.scope);
      return scope === "lia" ? "LIA" : /success|sucesso|customer/.test(scope) ? "Sucesso do Cliente" : "Comercial";
    })),
  };
  if (module === "goals") return {
    ...defaults, trendTitle: "Metas criadas por mês", statusTitle: "Situação das metas", statusUnit: "situações",
    ownerTitle: "Metas por colaborador", ownerUnit: "colaboradores", categoryTitle: "Metas por periodicidade", categoryUnit: "periodicidades",
    statuses: counted(details.map(({ item, detail }) => Boolean(detail.active ?? true) && !finished(item.status) ? "Em andamento" : "Concluída")),
    owners: counted(rows.map((item) => item.owner || "Não atribuído")),
    categories: counted(details.map(({ detail }) => normalizedStage(detail.cadence ?? detail.frequency ?? detail.period, "Sem periodicidade"))),
  };
  if (module === "referrals") return {
    ...defaults, trendTitle: "Indicações enviadas por mês", statusTitle: "Etapa das indicações", statusUnit: "etapas",
    ownerTitle: "Indicações por colaborador", ownerUnit: "colaboradores", categoryTitle: "Indicações por módulo", categoryUnit: "módulos",
    statuses: counted(details.map(({ item, detail }) => normalizedStage(detail.phase, item.status || "Em acompanhamento"))),
    owners: counted(details.map(({ item, detail }) => stringOf(detail.referrerName, detail.senderName, item.owner) || "Não atribuído")),
    categories: counted(details.map(({ item, detail }) => stringOf(detail.moduleName, detail.productName, item.record_type) || "Não informado")),
  };
  if (module === "diary") return {
    ...defaults, trendTitle: "Atividades do diário por mês", statusTitle: "Conclusão das atividades", statusUnit: "status",
    ownerTitle: "Atividades por responsável", ownerUnit: "responsáveis", categoryTitle: "Origem das atividades", categoryUnit: "origens",
    statuses: counted(rows.map((item) => normalizedStage(item.status))), categories: counted(details.map(({ item, detail }) => stringOf(detail.source, item.record_type) || "Manual")),
  };
  if (module === "tasks") return {
    ...defaults, trendTitle: "Tarefas criadas por mês", statusTitle: "Status das tarefas", statusUnit: "status",
    ownerTitle: "Tarefas por responsável", ownerUnit: "responsáveis", categoryTitle: "Tarefas por tipo", categoryUnit: "tipos",
    statuses: counted(rows.map((item) => normalizedStage(item.status))), categories: counted(rows.map((item) => item.record_type || "Sem tipo")),
  };
  if (module === "work") return {
    ...defaults, trendTitle: "Compromissos por mês", statusTitle: "Status da agenda", statusUnit: "status",
    ownerTitle: "Compromissos por responsável", ownerUnit: "responsáveis", categoryTitle: "Tipos de compromisso", categoryUnit: "tipos",
    statuses: counted(rows.map((item) => normalizedStage(item.status))), categories: counted(rows.map((item) => item.record_type || "Sem tipo")),
  };
  if (module === "suggestions") return {
    ...defaults, trendTitle: "Sugestões recebidas por mês", statusTitle: "Aprovação das sugestões", statusUnit: "decisões",
    ownerTitle: "Sugestões por responsável", ownerUnit: "responsáveis", categoryTitle: "Prioridades e riscos", categoryUnit: "categorias",
    statuses: counted(rows.map((item) => normalizedStage(item.status))), categories: counted(details.map(({ item, detail }) => Boolean(detail.cancellationRisk) ? "Risco de cancelamento" : Boolean(detail.strategicClient) ? "Cliente estratégico" : item.priority || "Normal")),
  };
  if (module === "access") return {
    ...defaults, trendTitle: "Acessos externos por mês", statusTitle: "Resultado dos acessos", statusUnit: "resultados",
    ownerTitle: "Acessos por colaborador", ownerUnit: "colaboradores", categoryTitle: "Sistemas e recursos acessados", categoryUnit: "sistemas",
    statuses: counted(rows.map((item) => normalizedStage(item.status))), categories: counted(rows.map((item) => item.record_type || item.team || "Sistema externo")),
  };
  if (module === "marketing") return {
    ...defaults, trendTitle: "Solicitações de marketing por mês", statusTitle: "Etapas do kanban", statusUnit: "etapas",
    ownerTitle: "Demandas por responsável", ownerUnit: "responsáveis", categoryTitle: "Demandas por canal", categoryUnit: "canais",
    statuses: counted(details.map(({ item, detail }) => normalizedStage(detail.stage, item.status || "Sem etapa"))),
    categories: counted(details.map(({ item, detail }) => stringOf(detail.channel, detail.type, detail.requestType, item.record_type) || "Não informado")),
  };
  if (module === "ti") return {
    ...defaults, trendTitle: "Demandas de desenvolvimento por mês", statusTitle: "Etapas de desenvolvimento", statusUnit: "etapas",
    ownerTitle: "Demandas por responsável", ownerUnit: "responsáveis", categoryTitle: "Demandas por tipo", categoryUnit: "tipos",
    statuses: counted(details.map(({ item, detail }) => normalizedStage(detail.processStage ?? detail.stage, item.status || "Sem etapa"))),
    categories: counted(details.map(({ item, detail }) => stringOf(detail.developmentType, detail.type, item.record_type) || "Não informado")),
  };
  return defaults;
}

function metricsFor(module: string, contextKey: string, rows: Item[]): Metric[] {
  const details = rows.map((item) => ({ item, detail: parse(item.description) }));
  const done = rows.filter((item) => finished(item.status));
  const values = rows.reduce((sum, item) => sum + numberOf(item.amount_cents), 0);
  const owners = new Set(rows.map((item) => item.owner).filter(Boolean)).size;
  const teams = new Set(rows.map((item) => item.team).filter(Boolean)).size;
  const generic: Metric[] = [
    { label: "Volume total", value: rows.length, note: `${done.length} concluído(s)` },
    { label: "Taxa de conclusão", value: percent(done.length, rows.length), note: "sobre os registros filtrados" },
    { label: "Em andamento", value: rows.length - done.length, note: "aguardando evolução" },
    { label: "Responsáveis", value: owners, note: `${teams} setor(es)` },
    { label: "Movimentação", value: money(values), note: "valor no período" },
    { label: "Ticket médio", value: rows.length ? money(Math.round(values / rows.length)) : money(0), note: "média por registro" },
    { label: "Ciclo médio", value: `${rows.length ? Math.round(rows.reduce((sum, item) => sum + durationDays(item), 0) / rows.length) : 0}d`, note: "entre criação e atualização" },
    { label: "Sem atribuição", value: rows.filter((item) => !item.owner).length, note: "itens sem responsável" },
  ];
  if (module === "waitingQueue") {
    const waiting = details.filter(({ item, detail }) => clean(detail.state || item.status) === "waiting" || /espera|aguard/.test(clean(item.status))).length;
    const contacted = rows.length - waiting;
    const senders = new Set(details.map(({ item, detail }) => stringOf(detail.senderName, detail.sentBy, item.owner)).filter(Boolean)).size;
    const contacts = new Set(details.map(({ detail }) => stringOf(detail.contactedByName, detail.contactOwner, detail.responsibleName)).filter(Boolean)).size;
    return [
      { label: "Encaminhados", value: rows.length, note: "clientes no período" }, { label: "Em espera", value: waiting, note: "aguardando contato" },
      { label: "Contato realizado", value: contacted, note: percent(contacted, rows.length) }, { label: "% de contatos", value: percent(contacted, rows.length), note: `${contacted} de ${rows.length}` },
      { label: "Responsáveis do envio", value: senders, note: "colaboradores distintos" }, { label: "Responsáveis do contato", value: contacts, note: "quem concluiu o contato" },
      { label: "Setores", value: teams, note: "filas com movimentação" }, { label: "Clientes estratégicos", value: details.filter(({ detail }) => Boolean(detail.strategic || detail.isStrategic)).length, note: "prioridade especial" },
    ];
  }
  if (module === "support") {
    const solved = details.filter(({ item, detail }) => finished(detail.solutionStatus ?? detail.status ?? item.status)).length;
    const unique = new Set(rows.map((item) => item.customer_name || item.title).filter(Boolean)).size;
    const calls = details.filter(({ detail }) => /ligacao|telefone|phone/.test(clean(`${detail.contactType ?? ""} ${detail.channel ?? ""}`))).length;
    const avgMinutes = details.length ? Math.round(details.reduce((sum, { detail }) => sum + numberOf(detail.durationMinutes, detail.duration), 0) / details.length) : 0;
    return [
      { label: "Total atendimentos", value: rows.length, note: `${(rows.length / Math.max(1, new Set(rows.map((item) => dateKey(item.created_at))).size)).toFixed(1)}/dia` },
      { label: "Clientes únicos", value: unique, note: "clientes distintos no período" }, { label: "Solucionados", value: solved, note: percent(solved, rows.length) },
      { label: "% de solução", value: percent(solved, rows.length), note: `${solved} atendimentos concluídos` }, { label: "Setores", value: teams, note: "setores envolvidos" },
      { label: "Ligações", value: calls, note: percent(calls, rows.length) }, { label: "Duração média", value: `${avgMinutes} min`, note: "média registrada" }, { label: "Responsáveis", value: owners, note: "colaboradores ativos" },
    ];
  }
  if (module === "commercial") {
    const sales = details.filter(({ item, detail }) => detail.kind === "directSale" || /ganho|venda|contrat/.test(clean(item.status)));
    const saleValue = sales.reduce((sum, { item, detail }) => sum + numberOf(detail.totalCents, detail.valueCents, item.amount_cents), 0);
    const products = details.flatMap(({ detail }) => arrayOf(detail.products).map((product) => stringOf(typeof product === "object" && product ? (product as Detail).name : product, typeof product === "object" && product ? (product as Detail).productName : ""))).filter(Boolean);
    const direct = details.filter(({ detail }) => detail.kind === "directSale").length;
    const routed = details.filter(({ detail }) => Boolean(detail.followUpTrack || detail.onboarding || detail.routedTo)).length;
    return [
      { label: "Total de vendas", value: sales.length, note: money(saleValue) }, { label: "Ticket médio", value: sales.length ? money(Math.round(saleValue / sales.length)) : money(0), note: "por venda aprovada" },
      { label: "Plano mais contratado", value: topValue(products), note: `${products.length} produto(s) vendidos` }, { label: "Venda direta", value: direct, note: percent(direct, Math.max(1, sales.length)) },
      { label: "Vendas novas", value: Math.max(0, sales.length - direct), note: "originadas no CRM" }, { label: "Encaminhados", value: routed, note: "para acompanhamento" },
      { label: "Conversão", value: percent(sales.length, rows.length), note: `${sales.length} de ${rows.length} oportunidades` }, { label: "Vendedores", value: owners, note: "com movimentação no período" },
    ];
  }
  if (module === "cs" || module === "lia") {
    if (module === "cs" && contextKey.includes("enterprise")) {
      const networks = details.filter(({ detail, item }) => /enterprise/.test(clean(detail.kind)) || /rede/.test(clean(item.record_type)));
      const units = networks.flatMap(({ detail }) => arrayOf(detail.units));
      const unitScores = units.map((unit) => scoreOf((typeof unit === "object" && unit ? unit : {}) as Detail));
      const interactions = networks.reduce((sum, { detail }) => sum + arrayOf(detail.history).length, 0) + units.reduce((sum, unit) => sum + arrayOf(typeof unit === "object" && unit ? (unit as Detail).interactions : []).length, 0);
      const avg = unitScores.length ? Math.round(unitScores.reduce((sum, score) => sum + score, 0) / unitScores.length) : 0;
      return [
        { label: "Total de redes", value: networks.length, note: "redes cadastradas" }, { label: "Total de unidades", value: units.length, note: "vinculadas às redes" },
        { label: "Em acompanhamento", value: units.filter((unit) => !finished((unit as Detail).status)).length, note: percent(units.filter((unit) => !finished((unit as Detail).status)).length, units.length) },
        { label: "Finalizadas", value: units.filter((unit) => finished((unit as Detail).status)).length, note: "unidades concluídas" }, { label: "Health score médio", value: `${avg}%`, note: "média das unidades" },
        { label: "Interações registradas", value: interactions, note: "em todas as unidades" }, { label: "Redes c/ responsável", value: networks.filter(({ item }) => item.owner).length, note: percent(networks.filter(({ item }) => item.owner).length, networks.length) },
        { label: "Unidades sem interação", value: units.filter((unit) => arrayOf((unit as Detail).interactions).length === 0).length, note: "pedem atenção" },
      ];
    }
    const scores = details.map(({ detail }) => scoreOf(detail));
    const avg = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
    const complete = rows.filter((item) => finished(item.status)).length;
    return [
      { label: "Total de clientes", value: rows.length, note: `${rows.length - complete} em acompanhamento` }, { label: "Em acompanhamento", value: rows.length - complete, note: percent(rows.length - complete, rows.length) },
      { label: "Finalizados", value: complete, note: percent(complete, rows.length) }, { label: "Concluídos c/ sucesso", value: rows.filter((item) => /sucesso/.test(clean(item.status))).length, note: "resultado positivo" },
      { label: "Health score médio", value: `${avg}%`, note: `${scores.filter((score) => score > 0).length} com score` }, { label: "Health alto (≥75%)", value: scores.filter((score) => score >= 75).length, note: "utilização saudável" },
      { label: "Health baixo (<50%)", value: scores.filter((score) => score < 50).length, note: "clientes em risco" }, { label: module === "lia" ? "Etapas ativas" : "Dias médios", value: module === "lia" ? new Set(rows.map((item) => item.status)).size : `${rows.length ? Math.round(rows.reduce((sum, item) => sum + durationDays(item), 0) / rows.length) : 0}d`, note: module === "lia" ? "no fluxo LIA" : "em acompanhamento" },
    ];
  }
  if (module === "recruitment") {
    const processes = rows.filter((item) => /processo seletivo/i.test(item.record_type)); const candidates = rows.filter((item) => /candidato/i.test(item.record_type));
    const hired = candidates.filter((item) => /contrat|aprov/.test(clean(item.status))).length; const rejectedCount = candidates.filter((item) => rejected(item.status)).length;
    return [
      { label: "Processos ativos", value: processes.filter((item) => !finished(item.status)).length, note: `${processes.length} no total` }, { label: "Processos finalizados", value: processes.filter((item) => finished(item.status)).length, note: percent(processes.filter((item) => finished(item.status)).length, processes.length) },
      { label: "Candidatos", value: candidates.length, note: "nos processos filtrados" }, { label: "Contratações", value: hired, note: percent(hired, candidates.length) },
      { label: "Taxa de contratação", value: percent(hired, candidates.length), note: "candidatos convertidos" }, { label: "Reprovados", value: rejectedCount, note: percent(rejectedCount, candidates.length) },
      { label: "Média por processo", value: processes.length ? (candidates.length / processes.length).toFixed(1) : "0", note: "candidatos por vaga" }, { label: "Etapas ocupadas", value: new Set(candidates.map((item) => item.status)).size, note: "fases com candidatos" },
    ];
  }
  if (module === "commissions") {
    const approved = details.filter(({ detail, item }) => clean(detail.decision || item.status) === "approved" || /aprov/.test(clean(item.status)));
    const denied = details.filter(({ detail, item }) => clean(detail.decision || item.status) === "rejected" || /reprov/.test(clean(item.status)));
    const value = (list: typeof details) => list.reduce((sum, { detail, item }) => sum + numberOf(detail.commissionCents, detail.proposedCents, item.amount_cents), 0);
    return [
      { label: "Valor aprovado", value: money(value(approved)), note: `${approved.length} lançamento(s)` }, { label: "Valor reprovado", value: money(value(denied)), note: `${denied.length} lançamento(s)` },
      { label: "Aprovações", value: approved.length, note: percent(approved.length, rows.length) }, { label: "Reprovações", value: denied.length, note: percent(denied.length, rows.length) },
      { label: "Pendentes", value: Math.max(0, rows.length - approved.length - denied.length), note: "aguardando análise" }, { label: "Média aprovada", value: approved.length ? money(Math.round(value(approved) / approved.length)) : money(0), note: "por acompanhamento" },
      { label: "Colaboradores", value: owners, note: "com comissão no período" }, { label: "Comissões LIA", value: details.filter(({ detail }) => clean(detail.scope) === "lia").length, note: "clientes da carteira LIA" },
    ];
  }
  if (module === "goals") {
    const progress = details.map(({ detail, item }) => Math.min(100, numberOf(detail.progress, detail.progressPercent, item.status === "Concluída" ? 100 : 0))); const achieved = progress.filter((value) => value >= 100).length;
    return [
      { label: "Metas criadas", value: rows.length, note: "no período filtrado" }, { label: "Metas batidas", value: achieved, note: percent(achieved, rows.length) },
      { label: "Em progresso", value: rows.length - achieved, note: "ainda ativas" }, { label: "Progresso médio", value: `${progress.length ? Math.round(progress.reduce((sum, value) => sum + value, 0) / progress.length) : 0}%`, note: "realização consolidada" },
      { label: "Metas diárias", value: details.filter(({ detail }) => /daily|diaria/.test(clean(detail.frequency ?? detail.period))).length, note: "cadastros ativos" }, { label: "Metas semanais", value: details.filter(({ detail }) => /weekly|semanal/.test(clean(detail.frequency ?? detail.period))).length, note: "cadastros ativos" },
      { label: "Metas mensais", value: details.filter(({ detail }) => /monthly|mensal/.test(clean(detail.frequency ?? detail.period))).length, note: "cadastros ativos" }, { label: "Colaboradores", value: owners, note: "com metas vinculadas" },
    ];
  }
  if (module === "referrals") {
    const phases = (phase: string) => details.filter(({ detail }) => clean(detail.phase) === phase); const approved = phases("approved"); const denied = phases("rejected");
    return [
      { label: "Indicações enviadas", value: rows.length, note: "total no período" }, { label: "Em acompanhamento", value: phases("tracking").length, note: "aguardando evolução" },
      { label: "Em conferência", value: phases("conference").length, note: "aguardando decisão" }, { label: "Aprovadas", value: approved.length, note: percent(approved.length, rows.length) },
      { label: "Reprovadas", value: denied.length, note: percent(denied.length, rows.length) }, { label: "Clientes contrataram", value: details.filter(({ detail }) => Boolean(detail.hired)).length, note: "flag de contratação" },
      { label: "Configurados", value: details.filter(({ detail }) => Boolean(detail.configured)).length, note: "implantação concluída" }, { label: "Comissões aprovadas", value: money(approved.reduce((sum, { detail }) => sum + numberOf(detail.commissionCents), 0)), note: "valor consolidado" },
    ];
  }
  if (module === "diary") {
    const completed = rows.filter((item) => finished(item.status)).length; const agenda = details.filter(({ detail }) => clean(detail.source) === "agenda").length;
    return [{ label: "Atividades", value: rows.length, note: "no período" }, { label: "Concluídas", value: completed, note: percent(completed, rows.length) }, { label: "Pendentes", value: rows.length - completed, note: "aguardando execução" }, { label: "Vindas da agenda", value: agenda, note: percent(agenda, rows.length) }, { label: "Manuais", value: rows.length - agenda, note: "registradas no diário" }, { label: "Taxa de conclusão", value: percent(completed, rows.length), note: "atividades finalizadas" }, { label: "Dias com atividade", value: new Set(rows.map((item) => dateKey(item.created_at))).size, note: "dias movimentados" }, { label: "Tipos", value: new Set(rows.map((item) => item.record_type)).size, note: "categorias distintas" }];
  }
  if (module === "tasks") {
    const completed = rows.filter((item) => finished(item.status)).length; const cancelled = details.filter(({ detail }) => Boolean(detail.cancelled)).length; const overdue = details.filter(({ detail }) => /overdue|atras/.test(clean(detail.slaState))).length;
    return [{ label: "Total de tarefas", value: rows.length, note: "no período" }, { label: "Concluídas", value: completed, note: percent(completed, rows.length) }, { label: "Em andamento", value: rows.length - completed - cancelled, note: "tarefas ativas" }, { label: "Atrasadas", value: overdue, note: "fora do SLA" }, { label: "Canceladas", value: cancelled, note: percent(cancelled, rows.length) }, { label: "Responsáveis", value: owners, note: "com tarefas" }, { label: "Protocolos", value: details.filter(({ detail }) => Boolean(detail.protocol)).length, note: "protocolos emitidos" }, { label: "Ciclo médio", value: `${rows.length ? Math.round(rows.reduce((sum, item) => sum + durationDays(item), 0) / rows.length) : 0}d`, note: "criação até atualização" }];
  }
  if (module === "work") {
    const completed = rows.filter((item) => finished(item.status)).length; const kickoff = rows.filter((item) => /kick off|kickoff/i.test(item.title)).length; const training = rows.filter((item) => /treinamento/i.test(item.title)).length;
    return [{ label: "Compromissos", value: rows.length, note: "no período" }, { label: "Concluídos", value: completed, note: percent(completed, rows.length) }, { label: "Agendados", value: rows.length - completed, note: "agenda futura/ativa" }, { label: "Kick offs", value: kickoff, note: "originados do Comercial" }, { label: "Treinamentos", value: training, note: "agendados pelo acompanhamento" }, { label: "Responsáveis", value: owners, note: "com agenda" }, { label: "Setores", value: teams, note: "calendários movimentados" }, { label: "Tipos", value: new Set(rows.map((item) => item.record_type)).size, note: "categorias distintas" }];
  }
  if (module === "suggestions") {
    const approved = rows.filter((item) => /aprov|aceit|conclu/.test(clean(item.status))).length; const denied = rows.filter((item) => rejected(item.status)).length;
    return [{ label: "Sugestões recebidas", value: rows.length, note: "no período" }, { label: "Aprovadas", value: approved, note: percent(approved, rows.length) }, { label: "Reprovadas", value: denied, note: percent(denied, rows.length) }, { label: "Em análise", value: Math.max(0, rows.length - approved - denied), note: "aguardando decisão" }, { label: "Clientes estratégicos", value: details.filter(({ detail }) => Boolean(detail.strategicClient)).length, note: "sugestões prioritárias" }, { label: "Risco de cancelamento", value: details.filter(({ detail }) => Boolean(detail.cancellationRisk)).length, note: "pedem atenção" }, { label: "Comentários", value: details.reduce((sum, { detail }) => sum + numberOf(detail.comments), 0), note: "interações registradas" }, { label: "Responsáveis", value: owners, note: "avaliadores" }];
  }
  if (module === "access") {
    const success = rows.filter((item) => finished(item.status) || /success|sucesso|ok/.test(clean(item.status))).length; const failed = rows.filter((item) => /fail|erro|negad|bloque/.test(clean(item.status))).length;
    return [{ label: "Acessos realizados", value: rows.length, note: "sistemas externos" }, { label: "Com sucesso", value: success, note: percent(success, rows.length) }, { label: "Falhas", value: failed, note: percent(failed, rows.length) }, { label: "Colaboradores", value: owners, note: "com movimentação" }, { label: "Sistemas externos", value: new Set(rows.map((item) => item.record_type)).size, note: "recursos distintos" }, { label: "Setores", value: teams, note: "origens dos acessos" }, { label: "Média por colaborador", value: owners ? (rows.length / owners).toFixed(1) : "0", note: "acessos por pessoa" }, { label: "Dias com acesso", value: new Set(rows.map((item) => dateKey(item.created_at))).size, note: "atividade registrada" }];
  }
  return generic;
}

function GenericOperationIndicatorsBoard({ title, module, contextKey = "", items, employees, onClose }: { title: string; module: string; contextKey?: string; items: Item[]; employees: Employee[]; onClose: () => void }) {
  const base = useMemo(() => scopeItems(items, module, contextKey), [items, module, contextKey]);
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [owner, setOwner] = useState("all"); const [team, setTeam] = useState("all"); const [status, setStatus] = useState("all");
  const scoped = useMemo(() => base.filter((item) => (!from || dateKey(item.created_at) >= from) && (!to || dateKey(item.created_at) <= to) && (owner === "all" || (item.owner || "Não atribuído") === owner) && (team === "all" || (item.team || "Sem setor") === team) && (status === "all" || (item.status || "Sem status") === status)), [base, from, to, owner, team, status]);
  const metrics = metricsFor(module, contextKey, scoped);
  const charts = useMemo(() => chartConfigFor(module, contextKey, scoped), [module, contextKey, scoped]);
  const statuses = charts.statuses; const categories = charts.categories; const collaborators = charts.owners;
  const maxStatus = Math.max(1, ...statuses.map((entry) => entry.count)); const maxCategory = Math.max(1, ...categories.map((entry) => entry.count));
  const months = Array.from({ length: 6 }, (_, index) => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - (5 - index)); const key = date.toLocaleDateString("en-CA").slice(0, 7); return { key, label: monthLabel(key), count: scoped.filter((item) => monthKey(item.created_at) === key).length }; });
  const maxMonth = Math.max(1, ...months.map((entry) => entry.count)); const completion = scoped.filter((item) => finished(item.status)).length;
  const insights = [
    scoped.length ? `${scoped.length} registro(s) compõem o recorte atual; ${percent(completion, scoped.length)} estão concluídos.` : "Nenhum registro corresponde aos filtros selecionados.",
    collaborators[0] ? `${collaborators[0].label} lidera o volume com ${collaborators[0].count} registro(s).` : "Ainda não há responsável com movimentação neste recorte.",
    categories[0] ? `${categories[0].label} lidera em ${charts.categoryTitle.toLowerCase()} com ${categories[0].count} registro(s).` : `Ainda não há dados para ${charts.categoryTitle.toLowerCase()}.`,
  ];
  return <div className="operation-bi-backdrop" role="dialog" aria-modal="true" aria-labelledby="operation-bi-title"><section className="operation-bi-board">
    <header><div><span className="operation-bi-mark"><BarChart3 /></span><span><small>INDICADORES · OPERAÇÃO</small><h1 id="operation-bi-title">{title} BI</h1><p>Métricas calculadas com os registros reais e filtros desta funcionalidade.</p></span></div><button onClick={onClose} aria-label="Fechar indicadores"><X /></button></header>
    <section className="operation-bi-filters"><Filter /><label>De<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Até<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label>Responsável<select value={owner} onChange={(event) => setOwner(event.target.value)}><option value="all">Todos</option>{[...new Set(base.map((item) => item.owner || "Não atribuído"))].sort().map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Setor<select value={team} onChange={(event) => setTeam(event.target.value)}><option value="all">Todos</option>{[...new Set(base.map((item) => item.team || "Sem setor"))].sort().map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option>{[...new Set(base.map((item) => item.status || "Sem status"))].sort().map((entry) => <option key={entry}>{entry}</option>)}</select></label><button onClick={() => { setFrom(""); setTo(""); setOwner("all"); setTeam("all"); setStatus("all"); }}>Limpar</button><strong>{scoped.length} registro(s)</strong></section>
    <section className="operation-bi-kpis">{metrics.map((metric, index) => <article key={metric.label}>{index % 4 === 0 ? <Activity /> : index % 4 === 1 ? <CheckCircle2 /> : index % 4 === 2 ? <Gauge /> : <WalletCards />}<span><small>{metric.label}</small><strong>{metric.value}</strong><em>{metric.note}</em></span></article>)}</section>
    <section className="operation-bi-insights"><Lightbulb /><strong>Insights estratégicos</strong>{insights.map((entry) => <span key={entry}>{entry}</span>)}</section>
    <div className="operation-bi-grid">
      <section className="operation-bi-panel trend-panel"><header><span><TrendingUp />{charts.trendTitle}</span><b>{months.reduce((sum, entry) => sum + entry.count, 0)} registros</b></header><div className="operation-trend-chart">{months.map((entry) => <div key={entry.key}><span><i style={{ height: `${Math.max(4, entry.count / maxMonth * 100)}%` }} /><b>{entry.count}</b></span><small>{entry.label}</small></div>)}</div></section>
      <section className="operation-bi-panel status-panel"><header><span><BarChart3 />{charts.statusTitle}</span><b>{statuses.length} {charts.statusUnit}</b></header><div className="operation-status-bars">{statuses.length ? statuses.map((entry) => <div key={entry.label}><span>{entry.label}</span><i><b style={{ width: `${entry.count / maxStatus * 100}%` }} /></i><strong>{entry.count}</strong></div>) : <p>Sem registros.</p>}</div></section>
      <section className="operation-bi-panel team-panel"><header><span><UsersRound />{charts.ownerTitle}</span><b>{collaborators.length} {charts.ownerUnit}</b></header><div className="operation-team-list">{collaborators.length ? collaborators.map((entry) => { const employee = employees.find((candidate) => candidate.displayName === entry.label); return <article key={entry.label}><i className={employee?.photoDataUrl ? "has-photo" : ""} style={employee?.photoDataUrl ? { backgroundImage: `url("${employee.photoDataUrl}")` } : undefined}>{!employee?.photoDataUrl && entry.label.split(" ").map((part) => part[0]).slice(0, 2).join("")}</i><span><strong>{entry.label}</strong><small>{employee?.departmentName || "Sem setor informado"}</small></span><b>{entry.count}</b><em>{percent(entry.count, scoped.length)}</em></article>; }) : <p>Sem responsáveis vinculados.</p>}</div></section>
      <section className="operation-bi-panel category-panel"><header><span><Clock3 />{charts.categoryTitle}</span><b>{categories.length} {charts.categoryUnit}</b></header><div className="operation-status-bars">{categories.length ? categories.map((entry) => <div key={entry.label}><span>{entry.label}</span><i><b style={{ width: `${entry.count / maxCategory * 100}%` }} /></i><strong>{entry.count}</strong></div>) : <p>Sem dados para este recorte.</p>}</div></section>
    </div>
  </section></div>;
}

type CommercialEntry = { item: Item; detail: Detail; date: string; seller: string; stage: string; origin: string; amount: number; direct: boolean; won: boolean; lia: boolean; follows: Detail[] };

function commercialEntries(items: Item[], contextKey: string): CommercialEntry[] {
  return scopeItems(items, "commercial", contextKey).map((item) => {
    const detail = parse(item.description); const direct = detail.kind === "directSale";
    const stage = stringOf(detail.stage, item.status) || "Sem etapa";
    const products = arrayOf(detail.products);
    const productAmount = products.reduce((sum, product) => sum + (typeof product === "object" && product ? numberOf((product as Detail).unitValue, (product as Detail).value) * Math.max(1, numberOf((product as Detail).quantity)) * 100 : 0), 0);
    return {
      item, detail, direct, stage, seller: stringOf(detail.seller, detail.sellerName, item.owner) || "Não atribuído",
      origin: stringOf(detail.origin, detail.source) || "Não informada",
      date: stringOf(detail.saleDate, detail.entryDate, item.created_at).slice(0, 10),
      amount: numberOf(detail.totalCents, detail.valueCents, item.amount_cents, productAmount),
      won: direct || /ganho|vendid|fechad|contrat|conclu/.test(clean(`${stage} ${item.status}`)),
      lia: clean(detail.followUpTrack) === "lia" || /\blia\b/.test(clean(item.description)),
      follows: arrayOf(detail.follows).filter((entry): entry is Detail => Boolean(entry && typeof entry === "object")),
    };
  });
}

function CommercialIndicatorsBoard({ title, contextKey, items, employees, onClose }: { title: string; contextKey: string; items: Item[]; employees: Employee[]; onClose: () => void }) {
  const [month, setMonth] = useState(new Date().toLocaleDateString("en-CA").slice(0, 7));
  const [seller, setSeller] = useState("all"); const [stage, setStage] = useState("all"); const [origin, setOrigin] = useState("all");
  const all = useMemo(() => commercialEntries(items, contextKey), [items, contextKey]);
  const scoped = useMemo(() => all.filter((entry) => entry.date.startsWith(month) && (seller === "all" || entry.seller === seller) && (stage === "all" || entry.stage === stage) && (origin === "all" || entry.origin === origin)), [all, month, seller, stage, origin]);
  const leads = scoped.filter((entry) => !entry.direct); const sales = scoped.filter((entry) => entry.won); const directSales = sales.filter((entry) => entry.direct); const systemSales = sales.filter((entry) => !entry.lia); const liaSales = sales.filter((entry) => entry.lia);
  const revenue = sales.reduce((sum, entry) => sum + entry.amount, 0); const pipeline = scoped.filter((entry) => !entry.won && !rejected(entry.item.status)).reduce((sum, entry) => sum + entry.amount, 0);
  const contacts = scoped.reduce((sum, entry) => sum + entry.follows.length, 0); const demos = scoped.filter((entry) => /demonstr/.test(clean(`${entry.stage} ${entry.follows.map((follow) => `${follow.type ?? ""} ${follow.text ?? ""}`).join(" ")}`))).length;
  const proposals = scoped.filter((entry) => /proposta/.test(clean(`${entry.stage} ${entry.follows.map((follow) => `${follow.type ?? ""} ${follow.text ?? ""}`).join(" ")}`))).length;
  const monthStart = `${month}-01`; const monthEnd = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).toLocaleDateString("en-CA");
  const goals = items.map((item) => ({ item, detail: parse(item.description) })).filter(({ item, detail }) => item.module === "goals" && detail.kind === "performanceGoal" && Boolean(detail.active ?? true) && stringOf(detail.periodStart) <= monthEnd && stringOf(detail.periodEnd) >= monthStart && (seller === "all" || !stringOf(detail.employeeName) || stringOf(detail.employeeName) === seller));
  const valueGoal = goals.filter(({ detail }) => detail.metric === "salesValue").reduce((sum, { detail }) => sum + numberOf(detail.target) * 100, 0);
  const salesGoal = goals.filter(({ detail }) => detail.metric === "salesCount").reduce((sum, { detail }) => sum + numberOf(detail.target), 0);
  const previousDate = new Date(`${month}-01T12:00:00`); previousDate.setMonth(previousDate.getMonth() - 1); const previousMonth = previousDate.toLocaleDateString("en-CA").slice(0, 7);
  const previous = all.filter((entry) => entry.date.startsWith(previousMonth) && (seller === "all" || entry.seller === seller)); const previousSales = previous.filter((entry) => entry.won); const previousRevenue = previousSales.reduce((sum, entry) => sum + entry.amount, 0);
  const delta = (current: number, before: number) => before ? Math.round((current - before) / before * 100) : current ? 100 : 0;
  const funnel = counted(leads.map((entry) => entry.stage), 8); const maxFunnel = Math.max(1, ...funnel.map((entry) => entry.count));
  const origins = counted(scoped.map((entry) => entry.origin), 6); const originTotal = Math.max(1, origins.reduce((sum, entry) => sum + entry.count, 0));
  const team = [...new Set(scoped.map((entry) => entry.seller))].map((name) => { const rows = scoped.filter((entry) => entry.seller === name); const won = rows.filter((entry) => entry.won); return { name, revenue: won.reduce((sum, entry) => sum + entry.amount, 0), sales: won.length, lia: won.filter((entry) => entry.lia).length, conversion: Math.round(won.length / Math.max(1, rows.length) * 100) }; }).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const hot = scoped.filter((entry) => !entry.won && !rejected(entry.item.status) && /quente|hot|alta/.test(clean(entry.detail.temperature))).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const today = new Date().toLocaleDateString("en-CA"); const overdue = leads.filter((entry) => !entry.won && (Date.now() - new Date(`${entry.item.updated_at}`).getTime()) / 86_400_000 > 7).length; const withoutContact = leads.filter((entry) => entry.follows.length === 0).length; const todayFollowups = scoped.reduce((sum, entry) => sum + entry.follows.filter((follow) => stringOf(follow.createdAt).startsWith(today)).length, 0);
  const months = Array.from({ length: 6 }, (_, index) => { const date = new Date(`${month}-01T12:00:00`); date.setMonth(date.getMonth() - (5 - index)); const key = date.toLocaleDateString("en-CA").slice(0, 7); return { key, label: monthLabel(key), value: all.filter((entry) => entry.date.startsWith(key) && entry.won).reduce((sum, entry) => sum + entry.amount, 0) }; }); const maxRevenue = Math.max(1, ...months.map((entry) => entry.value));
  const valueProgress = Math.min(100, Math.round(revenue / Math.max(1, valueGoal) * 100)); const salesProgress = Math.min(100, Math.round(sales.length / Math.max(1, salesGoal) * 100));
  const activityCards = [{ label: "Leads novos", value: leads.length, delta: delta(leads.length, previous.filter((entry) => !entry.direct).length) }, { label: "Contatos realizados", value: contacts, delta: 0 }, { label: "Demonstrações", value: demos, delta: 0 }, { label: "Propostas enviadas", value: proposals, delta: 0 }, { label: "Vendas sistema", value: systemSales.length, delta: delta(systemSales.length, previousSales.filter((entry) => !entry.lia).length) }, { label: "Vendas LIA", value: liaSales.length, delta: delta(liaSales.length, previousSales.filter((entry) => entry.lia).length) }];
  return <div className="operation-bi-backdrop" role="dialog" aria-modal="true" aria-labelledby="operation-bi-title"><section className="operation-bi-board commercial-bi-board">
    <header><div><span className="operation-bi-mark"><BarChart3 /></span><span><small>INDICADORES · CRM</small><h1 id="operation-bi-title">{title} BI comercial</h1><p>Metas, receita, funil e desempenho calculados pelos registros reais do CRM.</p></span></div><button onClick={onClose} aria-label="Fechar indicadores"><X /></button></header>
    <section className="operation-bi-filters commercial-bi-filters"><Filter /><label>Competência<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><label>Vendedor<select value={seller} onChange={(event) => setSeller(event.target.value)}><option value="all">Todos</option>{[...new Set(all.map((entry) => entry.seller))].sort().map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Etapa<select value={stage} onChange={(event) => setStage(event.target.value)}><option value="all">Todas</option>{[...new Set(all.map((entry) => entry.stage))].sort().map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Origem<select value={origin} onChange={(event) => setOrigin(event.target.value)}><option value="all">Todas</option>{[...new Set(all.map((entry) => entry.origin))].sort().map((entry) => <option key={entry}>{entry}</option>)}</select></label><button onClick={() => { setSeller("all"); setStage("all"); setOrigin("all"); }}>Limpar</button><strong>{scoped.length} oportunidade(s)</strong></section>
    <section className="commercial-bi-primary"><GoalKpi label="Meta de receita" value={money(revenue)} target={valueGoal ? money(valueGoal) : "Sem meta cadastrada"} progress={valueGoal ? valueProgress : 0} /><GoalKpi label="Meta de vendas" value={sales.length} target={salesGoal ? `Meta: ${salesGoal} vendas` : "Sem meta cadastrada"} progress={salesGoal ? salesProgress : 0} /><article><small>Receita total (mês)</small><strong>{money(revenue)}</strong><span>Ticket médio: <b>{money(Math.round(revenue / Math.max(1, sales.length)))}</b></span></article><article><small>Pipeline (previsão)</small><strong>{money(pipeline)}</strong><span>{scoped.filter((entry) => !entry.won && !rejected(entry.item.status)).length} oportunidades · valor médio {money(Math.round(pipeline / Math.max(1, scoped.length - sales.length)))}</span></article></section>
    <section className="commercial-bi-activity">{activityCards.map((entry) => <article key={entry.label}><small>{entry.label}</small><strong>{entry.value}</strong><span className={entry.delta >= 0 ? "positive" : "negative"}>{entry.delta >= 0 ? "+" : ""}{entry.delta}% vs mês anterior</span></article>)}</section>
    <section className="commercial-bi-charts"><article><header>Funil de vendas (quantidade)</header><div className="commercial-funnel">{funnel.map((entry) => <span key={entry.label} style={{ width: `${42 + entry.count / maxFunnel * 58}%` }}><b>{entry.label}</b><em>{entry.count}</em></span>)}</div></article><article><header>Conversão do funil</header><div className="commercial-conversion"><b>{percent(sales.length, Math.max(1, leads.length + directSales.length))}</b><span>Conversão geral</span><i><em style={{ width: percent(sales.length, Math.max(1, scoped.length)) }} /></i><small>{sales.length} vendas em {scoped.length} oportunidades</small></div></article><article><header>Evolução da receita</header><div className="commercial-revenue-chart">{months.map((entry) => <span key={entry.key}><i style={{ height: `${Math.max(5, entry.value / maxRevenue * 100)}%` }} /><b>{entry.value ? money(entry.value) : "—"}</b><small>{entry.label}</small></span>)}</div></article><article><header>Origem dos leads</header><div className="commercial-origin"><i style={{ background: originGradient(origins, originTotal) }} /><div>{origins.map((entry, index) => <span key={entry.label}><b style={{ background: `hsl(${215 - index * 31} 78% ${45 + index * 3}%)` }} />{entry.label}<em>{percent(entry.count, originTotal)}</em></span>)}</div></div></article></section>
    <section className="commercial-bi-bottom"><article><header>Ranking da equipe (mês)</header><div className="commercial-ranking">{team.length ? team.map((entry, index) => <span key={entry.name}><b>#{index + 1}</b><strong>{entry.name}</strong><em>{money(entry.revenue)}</em><small>{entry.sales} vendas · {entry.lia} LIA · {entry.conversion}%</small></span>) : <p>Sem vendas neste recorte.</p>}</div></article><article><header>Atividades pendentes</header><div className="commercial-pending"><span><b>{overdue}</b> follow-ups atrasados</span><span><b>{withoutContact}</b> oportunidades sem contato</span><span><b>{todayFollowups}</b> interações hoje</span><span><b>{directSales.length}</b> vendas diretas</span></div></article><article><header>Oportunidades quentes</header><div className="commercial-hot">{hot.length ? hot.map((entry) => <span key={entry.item.id}><strong>{entry.item.title}</strong><small>{entry.stage}</small><b>{money(entry.amount)}</b></span>) : <p>Nenhuma oportunidade quente no filtro.</p>}</div></article><article><header>Desempenho vs mês anterior</header><div className="commercial-performance"><span>Receita <b className={delta(revenue, previousRevenue) >= 0 ? "positive" : "negative"}>{delta(revenue, previousRevenue)}%</b></span><span>Leads <b className={delta(leads.length, previous.filter((entry) => !entry.direct).length) >= 0 ? "positive" : "negative"}>{delta(leads.length, previous.filter((entry) => !entry.direct).length)}%</b></span><span>Vendas <b className={delta(sales.length, previousSales.length) >= 0 ? "positive" : "negative"}>{delta(sales.length, previousSales.length)}%</b></span><span>Conversão <b>{percent(sales.length, scoped.length)}</b></span></div></article></section>
  </section></div>;
}

function GoalKpi({ label, value, target, progress }: { label: string; value: string | number; target: string; progress: number }) { return <article className="commercial-goal-kpi"><small>{label}</small><strong>{value}</strong><span>{target}</span><i><em style={{ width: `${progress}%` }} /></i><b style={{ "--goal-progress": `${progress}%` } as React.CSSProperties}>{progress}%</b></article>; }
function originGradient(entries: CountEntry[], total: number) { let cursor = 0; const parts = entries.map((entry, index) => { const start = cursor; cursor += entry.count / total * 100; return `hsl(${215 - index * 31} 78% ${45 + index * 3}%) ${start}% ${cursor}%`; }); return `conic-gradient(${parts.length ? parts.join(",") : "var(--surface-alt) 0 100%"})`; }

export default function OperationIndicatorsBoard(props: { title: string; module: string; contextKey?: string; items: Item[]; employees: Employee[]; onClose: () => void }) {
  return props.module === "commercial" ? <CommercialIndicatorsBoard title={props.title} contextKey={props.contextKey ?? ""} items={props.items} employees={props.employees} onClose={props.onClose} /> : <GenericOperationIndicatorsBoard {...props} />;
}
