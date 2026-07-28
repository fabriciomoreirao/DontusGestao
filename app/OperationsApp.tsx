"use client";

import {
  Activity, BadgeCheck, Bell, BriefcaseBusiness, Building2, CalendarDays,
  ChartNoAxesCombined, CheckCircle2, ChevronDown, ChevronRight, CircleDollarSign,
  ClipboardCheck, Clock3, Command, FileCheck2, Headphones, LayoutDashboard,
  Menu, MessageSquareText, Plus, Search, Settings2, ShieldCheck, Sparkles,
  Stethoscope, Target, UserRound, UsersRound, WalletCards, X, Zap,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { allowedNextStatuses, MODULES, PRIORITIES, RECORD_TYPES, STATE_MACHINES, type ModuleKey } from "@/lib/domain";

type Customer = {
  id: string; legal_name: string; trade_name: string; document_masked: string;
  segment: string; status: string; owner: string; cs_owner: string; support_owner: string;
  strategic: number; clinics_count: number; monthly_revenue_cents: number; created_at: string;
};

type WorkItem = {
  id: string; module: string; record_type: string; title: string; customer_id: string | null;
  customer_name: string; owner: string; team: string; status: string; priority: string;
  due_at: string | null; sla_due_at: string | null; amount_cents: number; description: string;
  version: number; updated_at: string; created_at: string;
};

type Appointment = {
  id: string; title: string; kind: string; customer_name: string; owner: string;
  team: string; starts_at: string; ends_at: string; status: string;
};

type Approval = {
  id: string; kind: string; source_title: string; requester: string; approver_role: string;
  status: string; amount_cents: number; created_at: string;
};

type Decision = {
  code: string; title: string; status: string; risk: string; default_behavior: string; owner: string;
};

type AuditEvent = {
  id: string; actor_email: string; action: string; resource: string; module: string;
  details: string; result: string; created_at: string;
};

type AppData = {
  user: { email: string; displayName: string; role: string; department: string };
  customers: Customer[];
  items: WorkItem[];
  appointments: Appointment[];
  approvals: Approval[];
  decisions: Decision[];
  audit: AuditEvent[];
};

type Toast = { kind: "success" | "error"; message: string } | null;
type Modal = "workItem" | "customer" | "appointment" | null;

const NAV_GROUPS: Array<{ label: string; items: Array<[ModuleKey, React.ComponentType<{ size?: number }>]> }> = [
  { label: "Operação", items: [
    ["dashboard", LayoutDashboard], ["customers", Building2], ["commercial", Target],
    ["cs", UsersRound], ["lia", Sparkles], ["support", Headphones], ["ti", Zap],
  ] },
  { label: "Gestão", items: [
    ["finance", WalletCards], ["procurement", BriefcaseBusiness], ["approvals", ClipboardCheck],
    ["work", CalendarDays], ["reporting", ChartNoAxesCombined],
  ] },
  { label: "Sistema", items: [["admin", Settings2]] },
];

const moduleDescriptions: Record<string, string> = {
  commercial: "Leads, oportunidades, metas, handoffs e pós-venda.",
  cs: "Treinamentos, onboarding de 90 dias, adoção e contas estratégicas.",
  lia: "Kick-off, prompts versionados, testes, go-live e CRC.",
  support: "Atendimentos, protocolos, configurações, sugestões e bugs.",
  ti: "Triagem, prioridade, SLA, desenvolvimento, testes e deploy.",
  finance: "Estornos, pagamentos, boletos, cobrança, parceiros e DRE.",
  procurement: "Solicitações, cotações, suprimentos, ativos e movimentações.",
  work: "Tarefas, compromissos, lembretes, dependências e prazos.",
};

const formatMoney = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cents / 100);

const shortDate = (value?: string | null) => {
  if (!value) return "Sem prazo";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sem prazo" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
};

const dateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
};

function statusLabel(status: string) {
  return status.replace(/([a-záéíóú])([A-Z])/g, "$1 $2");
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (/(ganho|conclu|finalizado|transferido|paga|aprovad|resolvido|recebid|patrimoniad)/.test(normalized)) return "positive";
  if (/(p0|vencid|bloquead|reprov|cancel|perdido|estornad)/.test(normalized)) return "negative";
  if (/(aguard|pendente|pausad|cotacao|teste|triagem)/.test(normalized)) return "warning";
  return "info";
}

export default function OperationsApp() {
  const [active, setActive] = useState<ModuleKey>("dashboard");
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [modalModule, setModalModule] = useState("commercial");
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [view, setView] = useState<"board" | "list">("board");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/operations", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? "Não foi possível carregar a operação.");
      setData(payload);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const requestedModule = params.get("mod") as ModuleKey | null;
      if (requestedModule && requestedModule in MODULES) setActive(requestedModule);
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const navigate = (module: ModuleKey) => {
    setActive(module);
    setMobileNav(false);
    setSelectedItem(null);
    setSelectedCustomer(null);
    const url = new URL(window.location.href);
    if (module === "dashboard") url.searchParams.delete("mod");
    else url.searchParams.set("mod", module);
    window.history.replaceState({}, "", url);
  };

  const operate = async (payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/operations", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "A operação não foi concluída.");
      setData((current) => current ? { ...current, ...result } : result);
      setModal(null);
      setSelectedItem(null);
      setToast({ kind: "success", message: success });
      window.setTimeout(() => setToast(null), 3500);
      return true;
    } catch (caught) {
      setToast({ kind: "error", message: caught instanceof Error ? caught.message : "Falha na operação." });
      window.setTimeout(() => setToast(null), 5000);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const moduleItems = useMemo(
    () => data?.items.filter((item) => item.module === active) ?? [],
    [data, active],
  );

  const globalResults = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query || !data) return [];
    const customers = data.customers
      .filter((customer) => `${customer.trade_name} ${customer.legal_name}`.toLocaleLowerCase("pt-BR").includes(query))
      .slice(0, 4)
      .map((customer) => ({ id: customer.id, label: customer.trade_name, meta: "Cliente", kind: "customer" as const }));
    const records = data.items
      .filter((item) => `${item.title} ${item.customer_name} ${item.record_type}`.toLocaleLowerCase("pt-BR").includes(query))
      .slice(0, 6)
      .map((item) => ({ id: item.id, label: item.title, meta: `${item.record_type} · ${MODULES[item.module as ModuleKey]?.short ?? item.module}`, kind: "item" as const }));
    return [...customers, ...records];
  }, [data, search]);

  const openCreate = (module: string) => {
    setModalModule(module);
    setModal(module === "customers" ? "customer" : module === "work" ? "appointment" : "workItem");
  };

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen message={error} onRetry={load} />;

  const attention = data.items.filter((item) => item.priority === "P0" || item.priority === "P1").slice(0, 5);
  const pendingApprovals = data.approvals.filter((approval) => approval.status === "Pendente");
  const activeCustomers = data.customers.filter((customer) => customer.status === "Ativo");
  const activeOnboardings = data.items.filter((item) => item.module === "cs" && !["Finalizado", "TransferidoSuporte", "Cancelado"].includes(item.status));
  const openTickets = data.items.filter((item) => item.module === "support" && !["Resolvido", "Encerrado"].includes(item.status));
  const openTi = data.items.filter((item) => item.module === "ti" && !["Concluida", "Cancelada", "Reprovada"].includes(item.status));

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <Image src="/dontus-logo.png" alt="Dontus Gestão Odontológica" width={184} height={52} priority />
          <button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="Fechar menu"><X size={20} /></button>
        </div>
        <div className="workspace-chip">
          <span className="workspace-mark"><Command size={15} /></span>
          <span><strong>Operações Dontus</strong><small>Ambiente integrado</small></span>
          <ChevronDown size={15} />
        </div>
        <nav aria-label="Navegação principal">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.items.map(([key, Icon]) => (
                <button className={`nav-item ${active === key ? "active" : ""}`} key={key} onClick={() => navigate(key)}>
                  <Icon size={18} /><span>{MODULES[key].label}</span>
                  {key === "approvals" && pendingApprovals.length > 0 && <b>{pendingApprovals.length}</b>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{data.user.displayName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
          <span><strong>{data.user.displayName}</strong><small>{data.user.role}</small></span>
          <button className="icon-button" aria-label="Configurações" onClick={() => navigate("admin")}><Settings2 size={17} /></button>
        </div>
      </aside>

      {mobileNav && <button className="nav-backdrop" aria-label="Fechar navegação" onClick={() => setMobileNav(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu size={21} /></button>
          <div className="global-search">
            <Search size={18} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar clientes, protocolos, tarefas..." aria-label="Busca global" />
            <kbd>⌘ K</kbd>
            {globalResults.length > 0 && (
              <div className="search-results">
                {globalResults.map((result) => (
                  <button key={`${result.kind}-${result.id}`} onClick={() => {
                    if (result.kind === "customer") {
                      const customer = data.customers.find((entry) => entry.id === result.id) ?? null;
                      setSelectedCustomer(customer); navigate("customers");
                    } else {
                      const item = data.items.find((entry) => entry.id === result.id) ?? null;
                      if (item) { navigate(item.module as ModuleKey); setSelectedItem(item); }
                    }
                    setSearch("");
                  }}>
                    <span>{result.label}</span><small>{result.meta}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="topbar-actions">
            <span className="sync-status"><i /> Operação sincronizada</span>
            <button className="icon-button notification-button" aria-label="Notificações"><Bell size={19} /><b>3</b></button>
            <button className="quick-create" onClick={() => openCreate(active === "dashboard" ? "work" : active)}>
              <Plus size={17} /> Novo
            </button>
          </div>
        </header>

        <div className="content">
          {active === "dashboard" && (
            <Dashboard
              userName={data.user.displayName}
              customers={activeCustomers.length}
              onboardings={activeOnboardings.length}
              tickets={openTickets.length}
              demands={openTi.length}
              attention={attention}
              appointments={data.appointments}
              pendingApprovals={pendingApprovals}
              onNavigate={navigate}
              onOpenItem={setSelectedItem}
              onCreate={openCreate}
              onSeed={() => operate({ action: "seedDemo" }, "Ambiente de demonstração carregado.")}
              isEmpty={data.customers.length === 0 && data.items.length === 0}
              busy={busy}
            />
          )}
          {active === "customers" && (
            <CustomersView customers={data.customers} items={data.items} selected={selectedCustomer} onSelect={setSelectedCustomer} onCreate={() => openCreate("customers")} />
          )}
          {["commercial", "cs", "lia", "support", "ti", "finance", "procurement", "work"].includes(active) && (
            <ModuleView
              module={active}
              items={moduleItems}
              customers={data.customers}
              appointments={data.appointments}
              view={view}
              onView={setView}
              onCreate={() => openCreate(active)}
              onOpen={setSelectedItem}
            />
          )}
          {active === "approvals" && (
            <ApprovalsView approvals={data.approvals} busy={busy} onDecision={(id, decision) => operate({ action: "decideApproval", id, decision, justification: decision === "Aprovado" ? "" : "Necessário revisar os dados apresentados." }, `Solicitação ${decision.toLowerCase()}.`)} />
          )}
          {active === "reporting" && <ReportingView data={data} />}
          {active === "admin" && <AdminView data={data} busy={busy} onSeed={() => operate({ action: "seedDemo" }, "Dados de demonstração carregados.")} />}
        </div>
      </main>

      {selectedItem && (
        <ItemDrawer item={selectedItem} busy={busy} onClose={() => setSelectedItem(null)} onTransition={(nextStatus, confirmed) => operate({
          action: "transitionWorkItem", id: selectedItem.id, nextStatus, version: selectedItem.version, confirmed,
        }, `Status alterado para ${statusLabel(nextStatus)}.`)} />
      )}

      {modal === "customer" && <CustomerModal busy={busy} onClose={() => setModal(null)} onSubmit={(payload) => operate({ action: "createCustomer", ...payload }, "Cliente criado no Customer 360.")} />}
      {modal === "workItem" && <WorkItemModal module={modalModule} customers={data.customers} busy={busy} onClose={() => setModal(null)} onSubmit={(payload) => operate({ action: "createWorkItem", module: modalModule, ...payload }, "Registro criado e auditado.")} />}
      {modal === "appointment" && <AppointmentModal customers={data.customers} busy={busy} onClose={() => setModal(null)} onSubmit={(payload) => operate({ action: "createAppointment", ...payload }, "Compromisso reservado sem conflito.")} />}

      {toast && <div className={`toast ${toast.kind}`} role="status">{toast.kind === "success" ? <CheckCircle2 size={18} /> : <Activity size={18} />}{toast.message}</div>}
    </div>
  );
}

function LoadingScreen() {
  return <div className="loading-screen"><Image src="/dontus-mark.png" alt="" width={95} height={95} priority /><div className="loading-line"><span /></div><p>Preparando a central de operações…</p></div>;
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-screen"><Image src="/dontus-logo.png" alt="Dontus" width={240} height={68} priority /><h1>Não foi possível abrir a operação</h1><p>{message}</p><button onClick={onRetry}>Tentar novamente</button></div>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Dashboard(props: {
  userName: string; customers: number; onboardings: number; tickets: number; demands: number;
  attention: WorkItem[]; appointments: Appointment[]; pendingApprovals: Approval[];
  onNavigate: (module: ModuleKey) => void; onOpenItem: (item: WorkItem) => void;
  onCreate: (module: string) => void; onSeed: () => void; isEmpty: boolean; busy: boolean;
}) {
  const firstName = props.userName.split(" ")[0];
  const cards = [
    { label: "Clientes ativos", value: props.customers, hint: "Customer 360", icon: Building2, module: "customers" as ModuleKey, tone: "blue" },
    { label: "Onboardings", value: props.onboardings, hint: "em acompanhamento", icon: UsersRound, module: "cs" as ModuleKey, tone: "teal" },
    { label: "Tickets abertos", value: props.tickets, hint: "fila do Suporte", icon: Headphones, module: "support" as ModuleKey, tone: "violet" },
    { label: "Demandas de TI", value: props.demands, hint: "em fluxo técnico", icon: Zap, module: "ti" as ModuleKey, tone: "orange" },
  ];
  return <>
    <section className="dashboard-hero">
      <div><span className="eyebrow light">CENTRAL DE OPERAÇÕES</span><h1>Bom dia, {firstName}.</h1><p>Veja o que exige decisão, acompanhamento ou ação hoje.</p></div>
      <div className="hero-actions"><button onClick={() => props.onCreate("commercial")}><Plus size={17} /> Nova oportunidade</button><button className="secondary" onClick={() => props.onCreate("work")}><CalendarDays size={17} /> Agendar</button></div>
    </section>
    {props.isEmpty && (
      <section className="empty-onboarding">
        <div className="empty-icon"><Sparkles size={22} /></div>
        <div><strong>Seu ambiente está pronto para começar</strong><p>Cadastre o primeiro cliente ou carregue dados demonstrativos para conhecer todos os fluxos.</p></div>
        <button onClick={props.onSeed} disabled={props.busy}>Carregar demonstração</button>
      </section>
    )}
    <section className="metric-grid">
      {cards.map(({ label, value, hint, icon: Icon, module, tone }) => (
        <button className="metric-card" key={label} onClick={() => props.onNavigate(module)}>
          <span className={`metric-icon ${tone}`}><Icon size={20} /></span>
          <span className="metric-value">{value}</span><span className="metric-label">{label}</span>
          <span className="metric-hint">{hint}<ChevronRight size={14} /></span>
        </button>
      ))}
    </section>
    <section className="dashboard-grid">
      <div className="panel attention-panel">
        <div className="panel-header"><div><span className="eyebrow">PRIORIDADE</span><h2>Fila que merece atenção</h2></div><button className="text-button" onClick={() => props.onNavigate("ti")}>Ver todas <ChevronRight size={15} /></button></div>
        <div className="attention-list">
          {props.attention.length === 0 ? <EmptyState compact text="Nenhum item crítico no momento." /> : props.attention.map((item) => (
            <button key={item.id} onClick={() => props.onOpenItem(item)}>
              <span className={`priority-badge ${item.priority.toLowerCase()}`}>{item.priority}</span>
              <span className="attention-main"><strong>{item.title}</strong><small>{item.customer_name || item.record_type} · {MODULES[item.module as ModuleKey]?.short}</small></span>
              <span className={`status-pill ${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
              <span className="attention-due"><Clock3 size={14} /> {shortDate(item.sla_due_at ?? item.due_at)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="panel agenda-panel">
        <div className="panel-header"><div><span className="eyebrow">HOJE E PRÓXIMOS DIAS</span><h2>Agenda compartilhada</h2></div><button className="icon-button" onClick={() => props.onNavigate("work")} aria-label="Abrir agenda"><CalendarDays size={18} /></button></div>
        <div className="agenda-list">
          {props.appointments.length === 0 ? <EmptyState compact text="Nenhum compromisso agendado." /> : props.appointments.slice(0, 4).map((entry) => (
            <div key={entry.id}><time>{new Date(entry.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time><i /><span><strong>{entry.title}</strong><small>{entry.customer_name || entry.team} · {entry.owner}</small></span></div>
          ))}
        </div>
        <button className="panel-cta" onClick={() => props.onCreate("work")}><Plus size={16} /> Reservar horário</button>
      </div>
    </section>
    <section className="module-launcher">
      <div className="section-title"><div><span className="eyebrow">JORNADA INTEGRADA</span><h2>Atalhos por área</h2></div><p>Da venda ao atendimento recorrente, sem perder o contexto.</p></div>
      <div className="launcher-grid">
        {(["commercial", "cs", "lia", "support", "finance", "approvals"] as ModuleKey[]).map((module) => {
          const icons: Partial<Record<ModuleKey, React.ComponentType<{ size?: number }>>> = { commercial: Target, cs: UsersRound, lia: Sparkles, support: Headphones, finance: CircleDollarSign, approvals: FileCheck2 };
          const Icon = icons[module] ?? Activity;
          const count = module === "approvals" ? props.pendingApprovals.length : 0;
          return <button key={module} onClick={() => props.onNavigate(module)}><span><Icon size={21} /></span><strong>{MODULES[module].label}</strong><small>{moduleDescriptions[module] ?? "Decisões e acompanhamento."}</small>{count > 0 && <b>{count} pendentes</b>}<ChevronRight size={17} /></button>;
        })}
      </div>
    </section>
  </>;
}

function CustomersView({ customers, items, selected, onSelect, onCreate }: { customers: Customer[]; items: WorkItem[]; selected: Customer | null; onSelect: (customer: Customer | null) => void; onCreate: () => void }) {
  const [filter, setFilter] = useState("");
  const filtered = customers.filter((customer) => `${customer.trade_name} ${customer.segment} ${customer.owner}`.toLowerCase().includes(filter.toLowerCase()));
  return <>
    <PageHeader eyebrow="CADASTRO CANÔNICO" title="Customer 360" description="Uma fonte de verdade para clientes, clínicas, contatos e toda a jornada." action={<button className="primary-button" onClick={onCreate}><Plus size={17} /> Novo cliente</button>} />
    <div className="toolbar"><div className="field-search"><Search size={17} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filtrar clientes..." /></div><div className="toolbar-summary"><strong>{customers.length}</strong> clientes cadastrados</div></div>
    <div className="table-card">
      <div className="data-table customers-table">
        <div className="table-row table-head"><span>Cliente</span><span>Segmento</span><span>Responsáveis</span><span>Clínicas</span><span>Receita mensal</span><span>Status</span></div>
        {filtered.length === 0 ? <EmptyState text="Nenhum cliente encontrado." /> : filtered.map((customer) => (
          <button className="table-row" key={customer.id} onClick={() => onSelect(customer)}>
            <span className="customer-cell"><i>{customer.trade_name.slice(0, 2).toUpperCase()}</i><span><strong>{customer.trade_name}</strong><small>{customer.legal_name}</small></span>{Boolean(customer.strategic) && <em><BadgeCheck size={14} /> Estratégico</em>}</span>
            <span>{customer.segment}</span><span><strong>{customer.owner}</strong><small>CS: {customer.cs_owner}</small></span><span>{customer.clinics_count}</span><span>{formatMoney(customer.monthly_revenue_cents)}</span><span><b className={`status-pill ${statusTone(customer.status)}`}>{customer.status}</b><ChevronRight size={16} /></span>
          </button>
        ))}
      </div>
    </div>
    {selected && <CustomerDrawer customer={selected} items={items.filter((item) => item.customer_id === selected.id)} onClose={() => onSelect(null)} />}
  </>;
}

function CustomerDrawer({ customer, items, onClose }: { customer: Customer; items: WorkItem[]; onClose: () => void }) {
  return <div className="drawer-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><aside className="drawer customer-drawer">
    <div className="drawer-head"><div className="customer-avatar large">{customer.trade_name.slice(0, 2).toUpperCase()}</div><div><span className="eyebrow">CUSTOMER 360</span><h2>{customer.trade_name}</h2><p>{customer.legal_name}</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>
    <div className="drawer-kpis"><div><span>Receita mensal</span><strong>{formatMoney(customer.monthly_revenue_cents)}</strong></div><div><span>Unidades</span><strong>{customer.clinics_count}</strong></div><div><span>Jornadas</span><strong>{items.length}</strong></div></div>
    <div className="detail-section"><h3>Responsáveis</h3><dl><div><dt>Comercial</dt><dd>{customer.owner}</dd></div><div><dt>Customer Success</dt><dd>{customer.cs_owner}</dd></div><div><dt>Suporte</dt><dd>{customer.support_owner}</dd></div></dl></div>
    <div className="detail-section"><h3>Jornada consolidada</h3><div className="timeline">{items.length === 0 ? <EmptyState compact text="Sem processos vinculados." /> : items.map((item) => <div key={item.id}><span className={`timeline-dot ${item.module}`} /><div><strong>{item.title}</strong><small>{MODULES[item.module as ModuleKey]?.label} · {statusLabel(item.status)}</small></div><time>{shortDate(item.updated_at)}</time></div>)}</div></div>
  </aside></div>;
}

function ModuleView({ module, items, appointments, view, onView, onCreate, onOpen }: { module: ModuleKey; items: WorkItem[]; customers: Customer[]; appointments: Appointment[]; view: "board" | "list"; onView: (view: "board" | "list") => void; onCreate: () => void; onOpen: (item: WorkItem) => void }) {
  const [query, setQuery] = useState("");
  const filtered = items.filter((item) => `${item.title} ${item.customer_name} ${item.owner}`.toLowerCase().includes(query.toLowerCase()));
  const statuses = STATE_MACHINES[module] ?? [];
  const visibleStatuses = statuses.filter((status) => filtered.some((item) => item.status === status)).slice(0, 6);
  const amount = items.reduce((sum, item) => sum + item.amount_cents, 0);
  if (module === "work") return <WorkView items={items} appointments={appointments} onCreate={onCreate} onOpen={onOpen} />;
  return <>
    <PageHeader eyebrow={`MÓDULO ${MODULES[module].short.toUpperCase()}`} title={MODULES[module].label} description={moduleDescriptions[module] ?? "Operação integrada, rastreável e auditável."} action={<button className="primary-button" onClick={onCreate}><Plus size={17} /> Novo registro</button>} />
    <section className="module-summary">
      <div><span>Em fluxo</span><strong>{items.filter((item) => allowedNextStatuses(item.module, item.status).length > 0).length}</strong><small>registros ativos</small></div>
      <div><span>Críticos</span><strong>{items.filter((item) => ["P0", "P1"].includes(item.priority)).length}</strong><small>prioridade P0/P1</small></div>
      <div><span>Próximos do prazo</span><strong>{items.filter((item) => item.due_at).length}</strong><small>com vencimento</small></div>
      {(module === "commercial" || module === "finance" || module === "procurement") && <div><span>Valor no fluxo</span><strong>{formatMoney(amount)}</strong><small>consolidado</small></div>}
    </section>
    <div className="toolbar"><div className="field-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar em ${MODULES[module].short}...`} /></div><div className="segmented"><button className={view === "board" ? "active" : ""} onClick={() => onView("board")}>Fluxo</button><button className={view === "list" ? "active" : ""} onClick={() => onView("list")}>Lista</button></div></div>
    {view === "board" ? (
      <div className="kanban">
        {(visibleStatuses.length > 0 ? visibleStatuses : statuses.slice(0, 4)).map((status) => {
          const statusItems = filtered.filter((item) => item.status === status);
          return <section className="kanban-column" key={status}><header><span className={`status-dot ${statusTone(status)}`} /><strong>{statusLabel(status)}</strong><b>{statusItems.length}</b></header><div>{statusItems.length === 0 ? <p className="column-empty">Nenhum registro</p> : statusItems.map((item) => <WorkCard key={item.id} item={item} onOpen={onOpen} />)}</div></section>;
        })}
        {items.length === 0 && <div className="board-empty"><Stethoscope size={26} /><strong>O fluxo está pronto</strong><p>Crie o primeiro registro para iniciar a jornada deste módulo.</p><button onClick={onCreate}><Plus size={16} /> Criar registro</button></div>}
      </div>
    ) : <WorkList items={filtered} onOpen={onOpen} />}
  </>;
}

function WorkCard({ item, onOpen }: { item: WorkItem; onOpen: (item: WorkItem) => void }) {
  return <button className="work-card" onClick={() => onOpen(item)}><div className="work-card-top"><span className={`priority-badge ${item.priority.toLowerCase()}`}>{item.priority}</span><small>{item.record_type}</small><ChevronRight size={15} /></div><strong>{item.title}</strong><p>{item.customer_name || "Sem cliente vinculado"}</p><div className="work-card-foot"><span><UserRound size={13} /> {item.owner}</span><span><Clock3 size={13} /> {shortDate(item.due_at)}</span></div></button>;
}

function WorkList({ items, onOpen }: { items: WorkItem[]; onOpen: (item: WorkItem) => void }) {
  return <div className="table-card"><div className="data-table work-table"><div className="table-row table-head"><span>Registro</span><span>Cliente</span><span>Responsável</span><span>Status</span><span>Prazo</span></div>{items.length === 0 ? <EmptyState text="Nenhum registro encontrado." /> : items.map((item) => <button className="table-row" key={item.id} onClick={() => onOpen(item)}><span><b className={`priority-badge ${item.priority.toLowerCase()}`}>{item.priority}</b><span><strong>{item.title}</strong><small>{item.record_type}</small></span></span><span>{item.customer_name || "—"}</span><span>{item.owner}</span><span><b className={`status-pill ${statusTone(item.status)}`}>{statusLabel(item.status)}</b></span><span>{shortDate(item.due_at)}<ChevronRight size={16} /></span></button>)}</div></div>;
}

function WorkView({ items, appointments, onCreate, onOpen }: { items: WorkItem[]; appointments: Appointment[]; onCreate: () => void; onOpen: (item: WorkItem) => void }) {
  const days = Array.from({ length: 5 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index); return date; });
  return <>
    <PageHeader eyebrow="GESTÃO DO TRABALHO" title="Agenda e tarefas" description="Capacidade, compromissos, dependências e lembretes em um só lugar." action={<button className="primary-button" onClick={onCreate}><Plus size={17} /> Reservar horário</button>} />
    <div className="work-layout">
      <section className="panel calendar-panel"><div className="panel-header"><div><span className="eyebrow">AGENDA COMPARTILHADA</span><h2>Próximos cinco dias</h2></div><span className="availability"><i /> Slots em tempo real</span></div><div className="mini-calendar">{days.map((day) => <div key={day.toISOString()}><header><small>{day.toLocaleDateString("pt-BR", { weekday: "short" })}</small><strong>{day.getDate()}</strong></header>{appointments.filter((entry) => new Date(entry.starts_at).toDateString() === day.toDateString()).map((entry) => <article key={entry.id}><time>{new Date(entry.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time><strong>{entry.title}</strong><small>{entry.owner}</small></article>)}</div>)}</div></section>
      <section className="panel task-panel"><div className="panel-header"><div><span className="eyebrow">MINHAS TAREFAS</span><h2>Execução</h2></div><b>{items.length}</b></div><div className="task-list">{items.length === 0 ? <EmptyState compact text="Nenhuma tarefa registrada." /> : items.map((item) => <button key={item.id} onClick={() => onOpen(item)}><span className={`check-status ${statusTone(item.status)}`}><CheckCircle2 size={16} /></span><span><strong>{item.title}</strong><small>{item.owner} · {shortDate(item.due_at)}</small></span><b className={`priority-badge ${item.priority.toLowerCase()}`}>{item.priority}</b></button>)}</div></section>
    </div>
  </>;
}

function ApprovalsView({ approvals, busy, onDecision }: { approvals: Approval[]; busy: boolean; onDecision: (id: string, decision: string) => void }) {
  const pending = approvals.filter((approval) => approval.status === "Pendente");
  return <>
    <PageHeader eyebrow="GOVERNANÇA" title="Central de aprovações" description="Decisões com alçada, segregação de funções e registro imutável." />
    <section className="approval-summary"><div><span className="metric-icon orange"><Clock3 size={20} /></span><strong>{pending.length}</strong><p>Aguardando decisão</p></div><div><span className="metric-icon blue"><ShieldCheck size={20} /></span><strong>{approvals.filter((a) => a.status === "Aprovado").length}</strong><p>Aprovadas</p></div><div><span className="metric-icon teal"><CircleDollarSign size={20} /></span><strong>{formatMoney(pending.reduce((sum, item) => sum + item.amount_cents, 0))}</strong><p>Valor pendente</p></div></section>
    <div className="approval-list">{approvals.length === 0 ? <div className="panel"><EmptyState text="Nenhuma solicitação de aprovação." /></div> : approvals.map((approval) => <article key={approval.id}><div className="approval-icon"><FileCheck2 size={20} /></div><div className="approval-main"><span className="eyebrow">{approval.kind}</span><h3>{approval.source_title}</h3><p>Solicitado por {approval.requester} · Alçada: {approval.approver_role}</p></div><strong>{approval.amount_cents ? formatMoney(approval.amount_cents) : "Sem valor"}</strong><span className={`status-pill ${statusTone(approval.status)}`}>{approval.status}</span>{approval.status === "Pendente" && <div className="approval-actions"><button disabled={busy} onClick={() => onDecision(approval.id, "Reprovado")}>Reprovar</button><button disabled={busy} className="approve" onClick={() => onDecision(approval.id, "Aprovado")}>Aprovar</button></div>}</article>)}</div>
  </>;
}

function ReportingView({ data }: { data: AppData }) {
  const modules = ["commercial", "cs", "lia", "support", "ti", "finance"];
  const max = Math.max(1, ...modules.map((module) => data.items.filter((item) => item.module === module).length));
  const revenue = data.customers.reduce((sum, customer) => sum + customer.monthly_revenue_cents, 0);
  return <>
    <PageHeader eyebrow="DADOS AUTORIZADOS" title="Indicadores e dashboards" description="Leitura operacional e executiva derivada da fonte transacional." action={<button className="secondary-button"><ChartNoAxesCombined size={17} /> Exportar visão</button>} />
    <section className="report-kpis"><div><span>Receita mensal da carteira</span><strong>{formatMoney(revenue)}</strong><small>{data.customers.length} clientes</small></div><div><span>Fluxos ativos</span><strong>{data.items.length}</strong><small>todos os módulos</small></div><div><span>Risco crítico</span><strong>{data.items.filter((item) => ["P0", "P1"].includes(item.priority)).length}</strong><small>itens P0/P1</small></div><div><span>Decisões de negócio</span><strong>{data.decisions.filter((d) => d.status === "Pendente").length}</strong><small>pendentes de validação</small></div></section>
    <section className="report-grid"><div className="panel chart-panel"><div className="panel-header"><div><span className="eyebrow">VOLUME OPERACIONAL</span><h2>Registros por módulo</h2></div></div><div className="bar-chart">{modules.map((module) => { const count = data.items.filter((item) => item.module === module).length; return <div key={module}><span>{MODULES[module as ModuleKey].short}</span><div><i style={{ width: `${Math.max(4, (count / max) * 100)}%` }} /></div><strong>{count}</strong></div>; })}</div></div><div className="panel health-panel"><div className="panel-header"><div><span className="eyebrow">SAÚDE DA OPERAÇÃO</span><h2>Sinais de controle</h2></div></div>{[{ label: "Registros com responsável", value: data.items.filter((i) => i.owner && i.owner !== "Não atribuído").length, total: data.items.length }, { label: "Clientes com CS atribuído", value: data.customers.filter((c) => c.cs_owner !== "Não atribuído").length, total: data.customers.length }, { label: "Aprovações decididas", value: data.approvals.filter((a) => a.status !== "Pendente").length, total: data.approvals.length }, { label: "Decisões validadas", value: data.decisions.filter((d) => d.status !== "Pendente").length, total: data.decisions.length }].map((entry) => { const percent = entry.total ? Math.round((entry.value / entry.total) * 100) : 0; return <div className="health-row" key={entry.label}><span><strong>{entry.label}</strong><small>{entry.value} de {entry.total}</small></span><div><i style={{ width: `${percent}%` }} /></div><b>{percent}%</b></div>; })}</div></section>
  </>;
}

function AdminView({ data, busy, onSeed }: { data: AppData; busy: boolean; onSeed: () => void }) {
  return <>
    <PageHeader eyebrow="CONTROLES DO SISTEMA" title="Administração e governança" description="Papéis, permissões, decisões abertas e trilha completa de auditoria." />
    <section className="admin-grid"><div className="panel access-card"><div className="panel-header"><div><span className="eyebrow">IDENTIDADE E ACESSO</span><h2>Sessão atual</h2></div><ShieldCheck size={20} /></div><div className="user-summary"><div className="avatar large">{data.user.displayName.split(" ").map((p) => p[0]).slice(0, 2).join("")}</div><div><strong>{data.user.displayName}</strong><p>{data.user.email}</p><span>{data.user.role} · {data.user.department}</span></div></div><div className="security-note"><ShieldCheck size={17} /><p>As permissões são verificadas no servidor. Administração técnica não concede automaticamente acesso financeiro sensível.</p></div></div><div className="panel demo-card"><div className="panel-header"><div><span className="eyebrow">AMBIENTE</span><h2>Dados demonstrativos</h2></div><Sparkles size={20} /></div><p>Carregue uma base operacional de exemplo somente quando o ambiente estiver vazio. A ação é explícita e auditada.</p><button className="primary-button" onClick={onSeed} disabled={busy || data.customers.length > 0}>{data.customers.length > 0 ? "Ambiente já possui dados" : "Carregar demonstração"}</button></div></section>
    <section className="admin-section"><div className="section-title"><div><span className="eyebrow">DECISION LOG</span><h2>Validações obrigatórias</h2></div><p>Regras críticas permanecem bloqueadas até decisão formal.</p></div><div className="decision-grid">{data.decisions.map((decision) => <article key={decision.code}><div><b>{decision.code}</b><span className={`risk ${decision.risk.toLowerCase()}`}>{decision.risk}</span></div><h3>{decision.title}</h3><p>{decision.default_behavior}</p><footer><span className={`status-pill ${statusTone(decision.status)}`}>{decision.status}</span><small>{decision.owner}</small></footer></article>)}</div></section>
    <section className="admin-section"><div className="section-title"><div><span className="eyebrow">AUDITORIA IMUTÁVEL</span><h2>Eventos recentes</h2></div></div><div className="audit-list">{data.audit.length === 0 ? <div className="panel"><EmptyState text="A trilha será preenchida a partir da primeira ação." /></div> : data.audit.map((entry) => <div key={entry.id}><span className="audit-icon"><Activity size={15} /></span><span><strong>{entry.action} · {entry.resource}</strong><small>{entry.actor_email} · {entry.module}</small></span><time>{dateTime(entry.created_at)}</time><b className={`status-pill ${statusTone(entry.result)}`}>{entry.result}</b></div>)}</div></section>
  </>;
}

function ItemDrawer({ item, busy, onClose, onTransition }: { item: WorkItem; busy: boolean; onClose: () => void; onTransition: (status: string, confirmed: boolean) => void }) {
  const next = allowedNextStatuses(item.module, item.status);
  const sensitive = (status: string) => (
    (item.module === "cs" && ["Finalizado", "TransferidoSuporte"].includes(status)) ||
    (item.module === "lia" && ["GoLiveAgendado", "Concluida"].includes(status)) ||
    (item.module === "finance" && ["Aprovada", "Paga", "Estornada"].includes(status))
  );
  return <div className="drawer-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><aside className="drawer item-drawer"><div className="drawer-head simple"><div><span className="eyebrow">{MODULES[item.module as ModuleKey]?.label} · {item.record_type}</span><h2>{item.title}</h2><p>{item.customer_name || "Sem cliente vinculado"}</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div><div className="record-banner"><span className={`priority-badge ${item.priority.toLowerCase()}`}>{item.priority}</span><span className={`status-pill ${statusTone(item.status)}`}>{statusLabel(item.status)}</span><small>Atualizado {dateTime(item.updated_at)}</small></div><div className="detail-section"><h3>Contexto</h3><p className="record-description">{item.description || "Nenhuma descrição adicionada."}</p><dl><div><dt>Responsável</dt><dd>{item.owner}</dd></div><div><dt>Equipe</dt><dd>{item.team || "—"}</dd></div><div><dt>Prazo</dt><dd>{dateTime(item.due_at)}</dd></div><div><dt>SLA</dt><dd>{dateTime(item.sla_due_at)}</dd></div>{item.amount_cents > 0 && <div><dt>Valor</dt><dd>{formatMoney(item.amount_cents)}</dd></div>}</dl></div><div className="detail-section"><h3>Próximas ações permitidas</h3>{next.length === 0 ? <div className="terminal-note"><CheckCircle2 size={18} /> Este registro está em estado terminal.</div> : <div className="transition-list">{next.map((status) => <button disabled={busy} key={status} onClick={() => onTransition(status, sensitive(status))}><span><strong>{statusLabel(status)}</strong><small>{sensitive(status) ? "Ação sensível com confirmação e auditoria" : "Transição prevista na máquina de estados"}</small></span><ChevronRight size={17} /></button>)}</div>}</div></aside></div>;
}

function WorkItemModal({ module, customers, busy, onClose, onSubmit }: { module: string; customers: Customer[]; busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const customer = customers.find((entry) => entry.id === form.get("customerId"));
    onSubmit({
      recordType: form.get("recordType"), title: form.get("title"), customerId: customer?.id ?? "",
      customerName: customer?.trade_name ?? "", owner: form.get("owner"), team: MODULES[module as ModuleKey]?.short ?? module,
      priority: form.get("priority"), dueAt: form.get("dueAt") ? new Date(String(form.get("dueAt"))).toISOString() : "",
      slaDueAt: form.get("slaDueAt") ? new Date(String(form.get("slaDueAt"))).toISOString() : "",
      amountCents: Math.round(Number(form.get("amount") || 0) * 100), description: form.get("description"),
    });
  };
  return <ModalShell title={`Novo registro · ${MODULES[module as ModuleKey]?.label ?? module}`} subtitle="O histórico começa no momento da criação." onClose={onClose}><form className="form-grid" onSubmit={submit}><label>Tipo<select name="recordType" required>{(RECORD_TYPES[module] ?? ["Registro"]).map((type) => <option key={type}>{type}</option>)}</select></label><label>Prioridade<select name="priority">{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></label><label className="wide">Título<input name="title" required placeholder="Descreva o objetivo em uma frase" /></label><label className="wide">Cliente<select name="customerId"><option value="">Sem cliente vinculado</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.trade_name}</option>)}</select></label><label>Responsável<input name="owner" placeholder="Nome do responsável" /></label><label>Valor (R$)<input name="amount" type="number" min="0" step="0.01" placeholder="0,00" /></label><label>Prazo<input name="dueAt" type="datetime-local" /></label><label>SLA<input name="slaDueAt" type="datetime-local" /></label><label className="wide">Descrição<textarea name="description" rows={4} placeholder="Contexto, evidências e próximo passo esperado" /></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} type="submit">{busy ? "Salvando..." : "Criar e auditar"}</button></div></form></ModalShell>;
}

function CustomerModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ legalName: form.get("legalName"), tradeName: form.get("tradeName"), documentMasked: form.get("documentMasked"), segment: form.get("segment"), owner: form.get("owner"), csOwner: form.get("csOwner"), clinicsCount: Number(form.get("clinicsCount") || 1), monthlyRevenueCents: Math.round(Number(form.get("monthlyRevenue") || 0) * 100), strategic: form.get("strategic") === "on" }); };
  return <ModalShell title="Novo cliente" subtitle="Cadastro canônico compartilhado por toda a jornada." onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="wide">Razão social<input name="legalName" required /></label><label>Nome fantasia<input name="tradeName" /></label><label>CNPJ/CPF mascarado<input name="documentMasked" placeholder="00.000.000/0000-00" /></label><label>Segmento<input name="segment" defaultValue="Clínica odontológica" /></label><label>Clínicas<input name="clinicsCount" type="number" min="1" defaultValue="1" /></label><label>Responsável comercial<input name="owner" /></label><label>Responsável de CS<input name="csOwner" /></label><label>Receita mensal (R$)<input name="monthlyRevenue" type="number" min="0" step="0.01" /></label><label className="checkbox-label"><input name="strategic" type="checkbox" /> Conta estratégica</label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} type="submit">{busy ? "Salvando..." : "Criar cliente"}</button></div></form></ModalShell>;
}

function AppointmentModal({ customers, busy, onClose, onSubmit }: { customers: Customer[]; busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const customer = customers.find((entry) => entry.id === form.get("customerId")); onSubmit({ title: form.get("title"), kind: form.get("kind"), customerId: customer?.id ?? "", customerName: customer?.trade_name ?? "", owner: form.get("owner"), team: form.get("team"), startsAt: new Date(String(form.get("startsAt"))).toISOString(), endsAt: new Date(String(form.get("endsAt"))).toISOString(), meetingUrl: form.get("meetingUrl") }); };
  return <ModalShell title="Reservar horário" subtitle="Conflitos de agenda são validados no servidor." onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="wide">Título<input name="title" required /></label><label>Tipo<select name="kind"><option>Treinamento</option><option>Reunião</option><option>Kick-off LIA</option><option>Follow-up</option><option>Compromisso</option></select></label><label>Cliente<select name="customerId"><option value="">Interno</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.trade_name}</option>)}</select></label><label>Responsável<input name="owner" required /></label><label>Equipe<select name="team"><option>CS</option><option>Comercial</option><option>LIA</option><option>Suporte</option><option>TI</option><option>Financeiro</option></select></label><label>Início<input name="startsAt" type="datetime-local" required /></label><label>Término<input name="endsAt" type="datetime-local" required /></label><label className="wide">Link da reunião<input name="meetingUrl" type="url" placeholder="https://..." /></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} type="submit">{busy ? "Reservando..." : "Reservar sem conflito"}</button></div></form></ModalShell>;
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><div className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><span className="eyebrow">NOVO REGISTRO</span><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>{children}</div></div>;
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={`empty-state ${compact ? "compact" : ""}`}><MessageSquareText size={compact ? 18 : 24} /><p>{text}</p></div>;
}
