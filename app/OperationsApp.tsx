"use client";

import {
  Activity, BadgeCheck, Bell, BriefcaseBusiness, Building2, CalendarDays,
  ChartNoAxesCombined, CheckCircle2, ChevronDown, ChevronRight, CircleDollarSign,
  ClipboardCheck, Clock3, Command, Database, FileCheck2, Headphones, LayoutDashboard,
  ListTodo, Menu, MessageCircleMore, MessageSquareText, Pencil, Plus, Save, Search, Settings2, ShieldCheck,
  Sparkles, Stethoscope, Target, UserPlus, UserRound, Users, UsersRound,
  WalletCards, X, Zap,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { allowedNextStatuses, MODULES, PRIORITIES, RECORD_TYPES, STATE_MACHINES, type ModuleKey } from "@/lib/domain";
import TasksModule, { CatalogsModule, type CatalogSection, type TaskModuleData } from "@/app/TasksModule";
import ChatModule, { type ChatModuleData } from "@/app/ChatModule";

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

type EffectivePermission = {
  screen: string; canView: boolean; canCreate: boolean; canEdit: boolean; canApprove: boolean; canManage: boolean;
  capabilities?: string[];
};

type AccessUser = {
  id: string; email: string; displayName: string; department: string; active: boolean;
  groupIds: string[]; groupNames: string[]; lastAccessAt: string | null; createdAt: string;
};

type GroupPermission = EffectivePermission;

type AccessGroup = {
  id: string; name: string; description: string; active: boolean; isSystem: boolean;
  userCount: number; permissions: GroupPermission[]; createdAt: string;
};

type AccessManagement = {
  screens: Array<{ code: string; label: string; area: string; order: number }>;
  users: AccessUser[];
  groups: AccessGroup[];
};

type AppData = {
  user: { email: string; displayName: string; role: string; department: string; permissions: EffectivePermission[] };
  customers: Customer[];
  items: WorkItem[];
  appointments: Appointment[];
  approvals: Approval[];
  decisions: Decision[];
  audit: AuditEvent[];
  access: AccessManagement | null;
  taskModule: TaskModuleData | null;
  chatModule: ChatModuleData | null;
};

type Toast = { kind: "success" | "error"; message: string } | null;
type Modal = "workItem" | "customer" | "appointment" | null;

const NAV_GROUPS: Array<{ label: string; items: Array<[ModuleKey, React.ComponentType<{ size?: number }>]> }> = [
  { label: "Operação", items: [
    ["dashboard", LayoutDashboard], ["customers", Building2], ["commercial", Target],
    ["cs", UsersRound], ["lia", Sparkles], ["support", Headphones], ["chat", MessageCircleMore], ["ti", Zap],
  ] },
  { label: "Gestão", items: [
    ["finance", WalletCards], ["procurement", BriefcaseBusiness], ["approvals", ClipboardCheck],
    ["work", CalendarDays], ["tasks", ListTodo], ["reporting", ChartNoAxesCombined],
  ] },
  { label: "Sistema", items: [["catalogs", Database], ["admin", Settings2]] },
];

const moduleDescriptions: Record<string, string> = {
  commercial: "Leads, oportunidades, metas, handoffs e pós-venda.",
  cs: "Treinamentos, onboarding de 90 dias, adoção e contas estratégicas.",
  lia: "Kick-off, prompts versionados, testes, go-live e CRC.",
  support: "Atendimentos, protocolos, configurações, sugestões e bugs.",
  ti: "Triagem, prioridade, SLA, desenvolvimento, testes e deploy.",
  finance: "Estornos, pagamentos, boletos, cobrança, parceiros e DRE.",
  procurement: "Solicitações, cotações, suprimentos, ativos e movimentações.",
  work: "Compromissos, reuniões e eventos com horário definido.",
  tasks: "Demandas internas, responsáveis, setores, comentários e SLA.",
  chat: "Conversas omnichannel, filas, números oficiais e atendimento entre setores.",
  catalogs: "Setores, tipos, prioridades, status, SLA e colaboradores.",
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

type PermissionAction = "view" | "create" | "edit" | "approve" | "manage";

function userCan(user: AppData["user"], screen: string, action: PermissionAction = "view") {
  const permission = user.permissions.find((entry) => entry.screen === screen);
  const key = `can${action[0].toUpperCase()}${action.slice(1)}` as keyof EffectivePermission;
  return permission?.[key] === true;
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
  const [catalogsOpen, setCatalogsOpen] = useState(true);
  const [catalogSection, setCatalogSection] = useState<CatalogSection>("departments");

  const load = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const response = await fetch("/api/operations", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? "Não foi possível carregar a operação.");
      setData(payload);
      setActive((current) => {
        if (userCan(payload.user, current)) return current;
        return (payload.user.permissions.find((permission: EffectivePermission) => permission.canView)?.screen ?? "dashboard") as ModuleKey;
      });
      setError("");
    } catch (caught) {
      if (!background) setError(caught instanceof Error ? caught.message : "Falha ao carregar.");
    } finally {
      if (!background) setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const requestedModule = params.get("mod") as ModuleKey | null;
      if (requestedModule && requestedModule in MODULES) setActive(requestedModule);
      const requestedCatalog = params.get("cad") as CatalogSection | null;
      if (requestedCatalog && ["departments", "types", "priorities", "statuses", "sla", "people"].includes(requestedCatalog))
        setCatalogSection(requestedCatalog);
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (active !== "chat") return;
    const timer = window.setInterval(() => void load(true), 12_000);
    return () => window.clearInterval(timer);
  }, [active]);

  const navigate = (module: ModuleKey) => {
    if (data && !userCan(data.user, module)) {
      setToast({ kind: "error", message: "Seu grupo não possui acesso a esta tela." });
      window.setTimeout(() => setToast(null), 3500);
      return;
    }
    setActive(module);
    setMobileNav(false);
    setSelectedItem(null);
    setSelectedCustomer(null);
    const url = new URL(window.location.href);
    if (module === "dashboard") url.searchParams.delete("mod");
    else url.searchParams.set("mod", module);
    if (module !== "catalogs") url.searchParams.delete("cad");
    window.history.replaceState({}, "", url);
  };

  const navigateCatalog = (section: CatalogSection) => {
    setCatalogSection(section);
    setCatalogsOpen(true);
    navigate("catalogs");
    const url = new URL(window.location.href);
    url.searchParams.set("mod", "catalogs");
    url.searchParams.set("cad", section);
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
      return result as { id?: string };
    } catch (caught) {
      setToast({ kind: "error", message: caught instanceof Error ? caught.message : "Falha na operação." });
      window.setTimeout(() => setToast(null), 5000);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const uploadTaskAttachments = async (taskId: string, files: File[]) => {
    if (files.length === 0) return true;
    setBusy(true);
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      const response = await fetch(`/api/task-files?taskId=${encodeURIComponent(taskId)}`, {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "Os anexos não foram enviados.");
      await load(true);
      setToast({ kind: "success", message: files.length === 1 ? "Arquivo anexado à tarefa." : `${files.length} arquivos anexados à tarefa.` });
      window.setTimeout(() => setToast(null), 3500);
      return true;
    } catch (caught) {
      setToast({ kind: "error", message: caught instanceof Error ? caught.message : "Falha no envio dos anexos." });
      window.setTimeout(() => setToast(null), 5000);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const uploadChatAttachments = async (conversationId: string, files: File[], internal: boolean) => {
    if (files.length === 0) return true;
    setBusy(true);
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      form.append("internal", String(internal));
      const response = await fetch(`/api/chat-files?conversationId=${encodeURIComponent(conversationId)}`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "Os arquivos não foram enviados.");
      await load(true);
      setToast({ kind: "success", message: files.length === 1 ? "Arquivo anexado à conversa." : `${files.length} arquivos anexados.` });
      window.setTimeout(() => setToast(null), 3500);
      return true;
    } catch (caught) {
      setToast({ kind: "error", message: caught instanceof Error ? caught.message : "Falha no envio dos arquivos." });
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
    if (!data || !userCan(data.user, module, "create")) {
      setToast({ kind: "error", message: "Seu grupo não permite criar registros nesta tela." });
      window.setTimeout(() => setToast(null), 3500);
      return;
    }
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
  const visibleNavGroups = NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter(([key]) => userCan(data.user, key)) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <Image src="/dontus-logo.png" alt="Dontus Gestão Odontológica" width={184} height={52} priority unoptimized />
          <button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="Fechar menu"><X size={20} /></button>
        </div>
        <div className="workspace-chip">
          <span className="workspace-mark"><Command size={15} /></span>
          <span><strong>Operações Dontus</strong><small>Ambiente integrado</small></span>
          <ChevronDown size={15} />
        </div>
        <nav aria-label="Navegação principal">
          {visibleNavGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.items.map(([key, Icon]) => key === "catalogs" ? (
                <div className="catalog-nav-wrap" key={key}>
                  <button className={`nav-item ${active === key ? "active" : ""}`} onClick={() => {
                    if (active === "catalogs") setCatalogsOpen((current) => !current);
                    else { setCatalogsOpen(true); navigateCatalog(catalogSection); }
                  }}>
                    <Icon size={18} /><span>{MODULES[key].label}</span><ChevronDown className={catalogsOpen ? "expanded" : ""} size={15} />
                  </button>
                  {catalogsOpen && <div className="catalog-subnav">
                    {([
                      ["departments", "Setores", Building2], ["types", "Tipos de tarefa", FileCheck2],
                      ["priorities", "Prioridades", BadgeCheck], ["statuses", "Status", ClipboardCheck],
                      ["sla", "Políticas de SLA", Clock3], ["people", "Colaboradores", Users],
                    ] as Array<[CatalogSection, string, React.ComponentType<{ size?: number }>]>).map(([section, label, SubIcon]) => (
                      <button className={active === "catalogs" && catalogSection === section ? "active" : ""} key={section} onClick={() => navigateCatalog(section)}><SubIcon size={14} /><span>{label}</span></button>
                    ))}
                  </div>}
                </div>
              ) : (
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
          {userCan(data.user, "admin") && <button className="icon-button" aria-label="Configurações" onClick={() => navigate("admin")}><Settings2 size={17} /></button>}
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
            {!["tasks", "catalogs"].includes(active) && userCan(data.user, active === "dashboard" ? "work" : active, "create") && <button className="quick-create" onClick={() => openCreate(active === "dashboard" ? "work" : active)}>
              <Plus size={17} /> Novo
            </button>}
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
              canView={(screen) => userCan(data.user, screen)}
              canCreate={(screen) => userCan(data.user, screen, "create")}
              canManage={userCan(data.user, "admin", "manage")}
            />
          )}
          {active === "customers" && (
            <CustomersView customers={data.customers} items={data.items} selected={selectedCustomer} onSelect={setSelectedCustomer} onCreate={() => openCreate("customers")} canCreate={userCan(data.user, "customers", "create")} />
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
              canCreate={userCan(data.user, active, "create")}
            />
          )}
          {active === "approvals" && (
            <ApprovalsView approvals={data.approvals} busy={busy} canApprove={userCan(data.user, "approvals", "approve")} onDecision={(id, decision) => operate({ action: "decideApproval", id, decision, justification: decision === "Aprovado" ? "" : "Necessário revisar os dados apresentados." }, `Solicitação ${decision.toLowerCase()}.`)} />
          )}
          {active === "tasks" && data.taskModule && (
            <TasksModule
              module={data.taskModule}
              customers={data.customers}
              user={data.user}
              canCreate={userCan(data.user, "tasks", "create")}
              canEdit={userCan(data.user, "tasks", "edit")}
              canManage={userCan(data.user, "tasks", "manage")}
              capabilities={data.user.permissions.find((permission) => permission.screen === "tasks")?.capabilities ?? []}
              busy={busy}
              operate={operate}
              uploadAttachments={uploadTaskAttachments}
            />
          )}
          {active === "chat" && data.chatModule && (
            <ChatModule
              module={data.chatModule}
              canCreate={userCan(data.user, "chat", "create")}
              canEdit={userCan(data.user, "chat", "edit")}
              canManage={userCan(data.user, "chat", "manage")}
              capabilities={data.user.permissions.find((permission) => permission.screen === "chat")?.capabilities ?? []}
              busy={busy}
              operate={operate}
              uploadAttachments={uploadChatAttachments}
            />
          )}
          {active === "catalogs" && data.taskModule && (
            <CatalogsModule module={data.taskModule} section={catalogSection} onSection={navigateCatalog} canManage={userCan(data.user, "catalogs", "manage")} busy={busy} operate={operate} />
          )}
          {active === "reporting" && <ReportingView data={data} />}
          {active === "admin" && <AdminView data={data} busy={busy} onOperate={operate} onSeed={() => operate({ action: "seedDemo" }, "Dados de demonstração carregados.")} />}
        </div>
      </main>

      {selectedItem && (
        <ItemDrawer item={selectedItem} busy={busy} canEdit={userCan(data.user, selectedItem.module, "edit")} onClose={() => setSelectedItem(null)} onTransition={(nextStatus, confirmed) => operate({
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
  return <div className="loading-screen"><Image src="/dontus-mark.png" alt="" width={95} height={95} priority unoptimized /><div className="loading-line"><span /></div><p>Preparando a central de operações…</p></div>;
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-screen"><Image src="/dontus-logo.png" alt="Dontus" width={240} height={68} priority unoptimized /><h1>Não foi possível abrir a operação</h1><p>{message}</p><button onClick={onRetry}>Tentar novamente</button></div>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Dashboard(props: {
  userName: string; customers: number; onboardings: number; tickets: number; demands: number;
  attention: WorkItem[]; appointments: Appointment[]; pendingApprovals: Approval[];
  onNavigate: (module: ModuleKey) => void; onOpenItem: (item: WorkItem) => void;
  onCreate: (module: string) => void; onSeed: () => void; isEmpty: boolean; busy: boolean;
  canView: (screen: string) => boolean; canCreate: (screen: string) => boolean; canManage: boolean;
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
      <div className="hero-actions">{props.canCreate("commercial") && <button onClick={() => props.onCreate("commercial")}><Plus size={17} /> Nova oportunidade</button>}{props.canCreate("work") && <button className="secondary" onClick={() => props.onCreate("work")}><CalendarDays size={17} /> Agendar</button>}</div>
    </section>
    {props.isEmpty && props.canManage && (
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
        {props.canCreate("work") && <button className="panel-cta" onClick={() => props.onCreate("work")}><Plus size={16} /> Reservar horário</button>}
      </div>
    </section>
    <section className="module-launcher">
      <div className="section-title"><div><span className="eyebrow">JORNADA INTEGRADA</span><h2>Atalhos por área</h2></div><p>Da venda ao atendimento recorrente, sem perder o contexto.</p></div>
      <div className="launcher-grid">
        {(["commercial", "cs", "lia", "support", "finance", "approvals"] as ModuleKey[]).filter(props.canView).map((module) => {
          const icons: Partial<Record<ModuleKey, React.ComponentType<{ size?: number }>>> = { commercial: Target, cs: UsersRound, lia: Sparkles, support: Headphones, finance: CircleDollarSign, approvals: FileCheck2 };
          const Icon = icons[module] ?? Activity;
          const count = module === "approvals" ? props.pendingApprovals.length : 0;
          return <button key={module} onClick={() => props.onNavigate(module)}><span><Icon size={21} /></span><strong>{MODULES[module].label}</strong><small>{moduleDescriptions[module] ?? "Decisões e acompanhamento."}</small>{count > 0 && <b>{count} pendentes</b>}<ChevronRight size={17} /></button>;
        })}
      </div>
    </section>
  </>;
}

function CustomersView({ customers, items, selected, onSelect, onCreate, canCreate }: { customers: Customer[]; items: WorkItem[]; selected: Customer | null; onSelect: (customer: Customer | null) => void; onCreate: () => void; canCreate: boolean }) {
  const [filter, setFilter] = useState("");
  const filtered = customers.filter((customer) => `${customer.trade_name} ${customer.segment} ${customer.owner}`.toLowerCase().includes(filter.toLowerCase()));
  return <>
    <PageHeader eyebrow="CADASTRO CANÔNICO" title="Customer 360" description="Uma fonte de verdade para clientes, clínicas, contatos e toda a jornada." action={canCreate ? <button className="primary-button" onClick={onCreate}><Plus size={17} /> Novo cliente</button> : undefined} />
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

function ModuleView({ module, items, appointments, view, onView, onCreate, onOpen, canCreate }: { module: ModuleKey; items: WorkItem[]; customers: Customer[]; appointments: Appointment[]; view: "board" | "list"; onView: (view: "board" | "list") => void; onCreate: () => void; onOpen: (item: WorkItem) => void; canCreate: boolean }) {
  const [query, setQuery] = useState("");
  const filtered = items.filter((item) => `${item.title} ${item.customer_name} ${item.owner}`.toLowerCase().includes(query.toLowerCase()));
  const statuses = STATE_MACHINES[module] ?? [];
  const visibleStatuses = statuses.filter((status) => filtered.some((item) => item.status === status)).slice(0, 6);
  const amount = items.reduce((sum, item) => sum + item.amount_cents, 0);
  if (module === "work") return <WorkView items={items} appointments={appointments} onCreate={onCreate} onOpen={onOpen} canCreate={canCreate} />;
  return <>
    <PageHeader eyebrow={`MÓDULO ${MODULES[module].short.toUpperCase()}`} title={MODULES[module].label} description={moduleDescriptions[module] ?? "Operação integrada, rastreável e auditável."} action={canCreate ? <button className="primary-button" onClick={onCreate}><Plus size={17} /> Novo registro</button> : undefined} />
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
        {items.length === 0 && <div className="board-empty"><Stethoscope size={26} /><strong>O fluxo está pronto</strong><p>{canCreate ? "Crie o primeiro registro para iniciar a jornada deste módulo." : "Nenhum registro disponível para seu acesso."}</p>{canCreate && <button onClick={onCreate}><Plus size={16} /> Criar registro</button>}</div>}
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

function WorkView({ items, appointments, onCreate, onOpen, canCreate }: { items: WorkItem[]; appointments: Appointment[]; onCreate: () => void; onOpen: (item: WorkItem) => void; canCreate: boolean }) {
  const days = Array.from({ length: 5 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index); return date; });
  return <>
    <PageHeader eyebrow="GESTÃO DO TRABALHO" title="Agenda e tarefas" description="Capacidade, compromissos, dependências e lembretes em um só lugar." action={canCreate ? <button className="primary-button" onClick={onCreate}><Plus size={17} /> Reservar horário</button> : undefined} />
    <div className="work-layout">
      <section className="panel calendar-panel"><div className="panel-header"><div><span className="eyebrow">AGENDA COMPARTILHADA</span><h2>Próximos cinco dias</h2></div><span className="availability"><i /> Slots em tempo real</span></div><div className="mini-calendar">{days.map((day) => <div key={day.toISOString()}><header><small>{day.toLocaleDateString("pt-BR", { weekday: "short" })}</small><strong>{day.getDate()}</strong></header>{appointments.filter((entry) => new Date(entry.starts_at).toDateString() === day.toDateString()).map((entry) => <article key={entry.id}><time>{new Date(entry.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time><strong>{entry.title}</strong><small>{entry.owner}</small></article>)}</div>)}</div></section>
      <section className="panel task-panel"><div className="panel-header"><div><span className="eyebrow">MINHAS TAREFAS</span><h2>Execução</h2></div><b>{items.length}</b></div><div className="task-list">{items.length === 0 ? <EmptyState compact text="Nenhuma tarefa registrada." /> : items.map((item) => <button key={item.id} onClick={() => onOpen(item)}><span className={`check-status ${statusTone(item.status)}`}><CheckCircle2 size={16} /></span><span><strong>{item.title}</strong><small>{item.owner} · {shortDate(item.due_at)}</small></span><b className={`priority-badge ${item.priority.toLowerCase()}`}>{item.priority}</b></button>)}</div></section>
    </div>
  </>;
}

function ApprovalsView({ approvals, busy, canApprove, onDecision }: { approvals: Approval[]; busy: boolean; canApprove: boolean; onDecision: (id: string, decision: string) => void }) {
  const pending = approvals.filter((approval) => approval.status === "Pendente");
  return <>
    <PageHeader eyebrow="GOVERNANÇA" title="Central de aprovações" description="Decisões com alçada, segregação de funções e registro imutável." />
    <section className="approval-summary"><div><span className="metric-icon orange"><Clock3 size={20} /></span><strong>{pending.length}</strong><p>Aguardando decisão</p></div><div><span className="metric-icon blue"><ShieldCheck size={20} /></span><strong>{approvals.filter((a) => a.status === "Aprovado").length}</strong><p>Aprovadas</p></div><div><span className="metric-icon teal"><CircleDollarSign size={20} /></span><strong>{formatMoney(pending.reduce((sum, item) => sum + item.amount_cents, 0))}</strong><p>Valor pendente</p></div></section>
    <div className="approval-list">{approvals.length === 0 ? <div className="panel"><EmptyState text="Nenhuma solicitação de aprovação." /></div> : approvals.map((approval) => <article key={approval.id}><div className="approval-icon"><FileCheck2 size={20} /></div><div className="approval-main"><span className="eyebrow">{approval.kind}</span><h3>{approval.source_title}</h3><p>Solicitado por {approval.requester} · Alçada: {approval.approver_role}</p></div><strong>{approval.amount_cents ? formatMoney(approval.amount_cents) : "Sem valor"}</strong><span className={`status-pill ${statusTone(approval.status)}`}>{approval.status}</span>{approval.status === "Pendente" && canApprove && <div className="approval-actions"><button disabled={busy} onClick={() => onDecision(approval.id, "Reprovado")}>Reprovar</button><button disabled={busy} className="approve" onClick={() => onDecision(approval.id, "Aprovado")}>Aprovar</button></div>}</article>)}</div>
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

function AdminView({ data, busy, onSeed, onOperate }: { data: AppData; busy: boolean; onSeed: () => void; onOperate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string } | false> }) {
  return <>
    <PageHeader eyebrow="CONTROLES DO SISTEMA" title="Administração e governança" description="Usuários, grupos, permissões por tela e trilha completa de auditoria." />
    {data.access && <AccessAdmin access={data.access} busy={busy} onOperate={onOperate} />}
    <section className="admin-grid"><div className="panel access-card"><div className="panel-header"><div><span className="eyebrow">IDENTIDADE E ACESSO</span><h2>Sessão atual</h2></div><ShieldCheck size={20} /></div><div className="user-summary"><div className="avatar large">{data.user.displayName.split(" ").map((p) => p[0]).slice(0, 2).join("")}</div><div><strong>{data.user.displayName}</strong><p>{data.user.email}</p><span>{data.user.role} · {data.user.department}</span></div></div><div className="security-note"><ShieldCheck size={17} /><p>A identidade vem do login autenticado. Os grupos cadastrados aqui determinam o que pode ser visto ou alterado.</p></div></div><div className="panel demo-card"><div className="panel-header"><div><span className="eyebrow">AMBIENTE</span><h2>Dados demonstrativos</h2></div><Sparkles size={20} /></div><p>Carregue uma base operacional de exemplo somente quando o ambiente estiver vazio. A ação é explícita e auditada.</p><button className="primary-button" onClick={onSeed} disabled={busy || data.customers.length > 0}>{data.customers.length > 0 ? "Ambiente já possui dados" : "Carregar demonstração"}</button></div></section>
    <section className="admin-section"><div className="section-title"><div><span className="eyebrow">DECISION LOG</span><h2>Validações obrigatórias</h2></div><p>Regras críticas permanecem bloqueadas até decisão formal.</p></div><div className="decision-grid">{data.decisions.map((decision) => <article key={decision.code}><div><b>{decision.code}</b><span className={`risk ${decision.risk.toLowerCase()}`}>{decision.risk}</span></div><h3>{decision.title}</h3><p>{decision.default_behavior}</p><footer><span className={`status-pill ${statusTone(decision.status)}`}>{decision.status}</span><small>{decision.owner}</small></footer></article>)}</div></section>
    <section className="admin-section"><div className="section-title"><div><span className="eyebrow">AUDITORIA IMUTÁVEL</span><h2>Eventos recentes</h2></div></div><div className="audit-list">{data.audit.length === 0 ? <div className="panel"><EmptyState text="A trilha será preenchida a partir da primeira ação." /></div> : data.audit.map((entry) => <div key={entry.id}><span className="audit-icon"><Activity size={15} /></span><span><strong>{entry.action} · {entry.resource}</strong><small>{entry.actor_email} · {entry.module}</small></span><time>{dateTime(entry.created_at)}</time><b className={`status-pill ${statusTone(entry.result)}`}>{entry.result}</b></div>)}</div></section>
  </>;
}

function AccessAdmin({ access, busy, onOperate }: { access: AccessManagement; busy: boolean; onOperate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string } | false> }) {
  const [editingUser, setEditingUser] = useState<AccessUser | "new" | null>(null);
  const [editingGroup, setEditingGroup] = useState<AccessGroup | "new" | null>(null);
  return <section className="admin-section access-management">
    <div className="section-title"><div><span className="eyebrow">CONTROLE DE ACESSO</span><h2>Usuários e grupos</h2></div><div className="access-actions"><button className="secondary-button" onClick={() => setEditingGroup("new")}><Users size={16} /> Novo grupo</button><button className="primary-button" onClick={() => setEditingUser("new")}><UserPlus size={16} /> Novo usuário</button></div></div>
    <div className="access-summary"><div><UsersRound size={20} /><span><strong>{access.users.length}</strong><small>usuários cadastrados</small></span></div><div><ShieldCheck size={20} /><span><strong>{access.groups.length}</strong><small>grupos de acesso</small></span></div><div><BadgeCheck size={20} /><span><strong>{access.users.filter((user) => user.active).length}</strong><small>usuários ativos</small></span></div></div>
    <div className="access-layout">
      <div className="panel access-users"><div className="panel-header"><div><span className="eyebrow">USUÁRIOS</span><h3>Contas autorizadas</h3></div></div><div className="access-user-list">{access.users.map((user) => <button key={user.id} onClick={() => setEditingUser(user)}><span className="avatar">{user.displayName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><strong>{user.displayName}</strong><small>{user.email}</small><em>{user.groupNames.join(" · ") || "Sem grupo"}</em></span><b className={`status-pill ${user.active ? "positive" : "negative"}`}>{user.active ? "Ativo" : "Inativo"}</b><Pencil size={15} /></button>)}</div></div>
      <div className="panel access-groups"><div className="panel-header"><div><span className="eyebrow">GRUPOS</span><h3>Permissões consolidadas</h3></div></div><div className="access-group-list">{access.groups.map((group) => <button key={group.id} onClick={() => setEditingGroup(group)}><span className="group-icon"><ShieldCheck size={18} /></span><span><strong>{group.name}{group.isSystem && <em>Sistema</em>}</strong><small>{group.description || "Sem descrição"}</small><i>{group.userCount} usuário(s) · {group.permissions.filter((permission) => permission.canView).length} tela(s)</i></span><b className={`status-pill ${group.active ? "positive" : "negative"}`}>{group.active ? "Ativo" : "Inativo"}</b><ChevronRight size={16} /></button>)}</div></div>
    </div>
    {editingUser && <AccessUserModal user={editingUser === "new" ? null : editingUser} groups={access.groups} busy={busy} onClose={() => setEditingUser(null)} onSave={async (payload) => { const ok = await onOperate(payload, editingUser === "new" ? "Usuário cadastrado." : "Usuário atualizado."); if (ok) setEditingUser(null); }} />}
    {editingGroup && <AccessGroupModal group={editingGroup === "new" ? null : editingGroup} access={access} busy={busy} onClose={() => setEditingGroup(null)} onSave={async (payload) => { const ok = await onOperate(payload, editingGroup === "new" ? "Grupo cadastrado." : "Permissões atualizadas."); if (ok) setEditingGroup(null); }} />}
  </section>;
}

function AccessUserModal({ user, groups, busy, onClose, onSave }: { user: AccessUser | null; groups: AccessGroup[]; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({ action: user ? "updateAccessUser" : "createAccessUser", id: user?.id, email: form.get("email"), displayName: form.get("displayName"), department: form.get("department"), active: form.get("active") === "on", groupIds: form.getAll("groupIds") });
  };
  return <ModalShell title={user ? "Editar usuário" : "Novo usuário"} subtitle="O e-mail deve ser o mesmo utilizado no login autenticado." onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="wide">Nome completo<input name="displayName" required defaultValue={user?.displayName} /></label><label>E-mail de acesso<input name="email" type="email" required defaultValue={user?.email} /></label><label>Setor<input name="department" required defaultValue={user?.department ?? "Gestão"} /></label><fieldset className="wide group-selector"><legend>Grupos do usuário</legend>{groups.filter((group) => group.active || user?.groupIds.includes(group.id)).map((group) => <label key={group.id}><input name="groupIds" type="checkbox" value={group.id} defaultChecked={user?.groupIds.includes(group.id)} /><span><strong>{group.name}</strong><small>{group.description}</small></span></label>)}</fieldset><label className="checkbox-label"><input name="active" type="checkbox" defaultChecked={user?.active ?? true} /> Usuário ativo</label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} type="submit"><Save size={16} /> {busy ? "Salvando..." : "Salvar usuário"}</button></div></form></ModalShell>;
}

function AccessGroupModal({ group, access, busy, onClose, onSave }: { group: AccessGroup | null; access: AccessManagement; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const initial = access.screens.map((screen) => group?.permissions.find((permission) => permission.screen === screen.code)
    ?? { screen: screen.code, canView: false, canCreate: false, canEdit: false, canApprove: false, canManage: false, capabilities: [] });
  const [permissions, setPermissions] = useState<GroupPermission[]>(initial);
  const changePermission = (screen: string, action: PermissionAction, checked: boolean) => setPermissions((current) => current.map((permission) => {
    if (permission.screen !== screen) return permission;
    const key = `can${action[0].toUpperCase()}${action.slice(1)}` as keyof GroupPermission;
    const next = { ...permission, [key]: checked };
    if (action !== "view" && checked) next.canView = true;
    if (action === "view" && !checked) return { ...next, canCreate: false, canEdit: false, canApprove: false, canManage: false };
    return next;
  }));
  const changeCapability = (screen: string, capability: string, checked: boolean) => setPermissions((current) => current.map((permission) =>
    permission.screen !== screen ? permission : {
      ...permission,
      canView: checked || permission.canView,
      capabilities: checked
        ? [...new Set([...(permission.capabilities ?? []), capability])]
        : (permission.capabilities ?? []).filter((entry) => entry !== capability),
    }));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({ action: group ? "updateAccessGroup" : "createAccessGroup", id: group?.id, name: form.get("name"), groupDescription: form.get("description"), active: form.get("active") === "on", permissions: group ? permissions : undefined });
  };
  const actions: Array<{ key: PermissionAction; label: string }> = [
    { key: "view", label: "Ver" }, { key: "create", label: "Criar" }, { key: "edit", label: "Editar" },
    { key: "approve", label: "Aprovar" }, { key: "manage", label: "Administrar" },
  ];
  const taskPermission = permissions.find((permission) => permission.screen === "tasks");
  const chatPermission = permissions.find((permission) => permission.screen === "chat");
  const taskCapabilities = [
    ["cancel", "Cancelar tarefas"], ["changeStatus", "Alterar status"], ["changePriority", "Alterar prioridade"],
    ["changeSla", "Alterar SLA"], ["forward", "Encaminhar"], ["assume", "Assumir tarefas"],
    ["transferAssignee", "Transferir responsabilidade"], ["viewOthers", "Ver tarefas de outros usuários"],
    ["viewOtherDepartments", "Ver outros setores"], ["manageCatalogs", "Gerenciar cadastros"],
    ["viewReports", "Ver relatórios"], ["notifyClient", "Notificar cliente"],
  ];
  const chatCapabilities = [
    ["sendMessages", "Enviar mensagens"], ["internalNotes", "Registrar notas internas"],
    ["assign", "Atribuir atendimentos"], ["transfer", "Transferir entre setores"],
    ["viewOtherDepartments", "Ver outros setores"], ["supervise", "Supervisionar equipe"],
    ["manageChannels", "Gerenciar canais"], ["manageWhatsApp", "Configurar números WhatsApp"],
    ["manageCatalogs", "Gerenciar cadastros do chat"], ["createTask", "Gerar tarefa pela conversa"],
  ];
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
    <div className="modal access-modal" role="dialog" aria-modal="true" aria-label={group ? "Editar grupo" : "Novo grupo"}>
      <div className="modal-head"><div><span className="eyebrow">GRUPO DE ACESSO</span><h2>{group ? "Permissões do grupo" : "Novo grupo"}</h2><p>As permissões são aplicadas no menu e validadas novamente pela API.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>
      <form className="access-group-form" onSubmit={submit}>
        <div className="form-grid"><label>Nome do grupo<input name="name" required defaultValue={group?.name} /></label><label className="checkbox-label"><input name="active" type="checkbox" disabled={group?.isSystem} defaultChecked={group?.active ?? true} /> Grupo ativo</label><label className="wide">Descrição<input name="description" defaultValue={group?.description} /></label></div>
        {group && <><div className="permission-matrix">
          <div className="permission-row permission-head"><strong>Tela</strong>{actions.map((action) => <span key={action.key}>{action.label}</span>)}</div>
          {access.screens.map((screen) => {
            const permission = permissions.find((entry) => entry.screen === screen.code)!;
            return <div className="permission-row" key={screen.code}><span><strong>{screen.label}</strong><small>{screen.area}</small></span>{actions.map((action) => {
              const key = `can${action.key[0].toUpperCase()}${action.key.slice(1)}` as keyof GroupPermission;
              return <label key={action.key} title={`${action.label}: ${screen.label}`}><input type="checkbox" checked={permission[key] === true} onChange={(event) => changePermission(screen.code, action.key, event.target.checked)} /><i /></label>;
            })}</div>;
          })}
        </div>
        <div className="task-capability-matrix"><h3>Ações específicas de tarefas</h3><p>Refine o que este grupo pode executar dentro da tela de Tarefas.</p><div>{taskCapabilities.map(([code, label]) => <label key={code}><input type="checkbox" disabled={!taskPermission?.canView} checked={taskPermission?.capabilities?.includes(code) ?? false} onChange={(event) => changeCapability("tasks", code, event.target.checked)} /><span>{label}</span></label>)}</div></div>
        <div className="task-capability-matrix"><h3>Ações específicas do atendimento</h3><p>Controle o envio, a supervisão e os cadastros do chat omnichannel.</p><div>{chatCapabilities.map(([code, label]) => <label key={code}><input type="checkbox" disabled={!chatPermission?.canView} checked={chatPermission?.capabilities?.includes(code) ?? false} onChange={(event) => changeCapability("chat", code, event.target.checked)} /><span>{label}</span></label>)}</div></div></>}
        <div className="form-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} type="submit"><Save size={16} /> {busy ? "Salvando..." : group ? "Salvar permissões" : "Criar grupo"}</button></div>
      </form>
    </div>
  </div>;
}

function ItemDrawer({ item, busy, canEdit, onClose, onTransition }: { item: WorkItem; busy: boolean; canEdit: boolean; onClose: () => void; onTransition: (status: string, confirmed: boolean) => void }) {
  const next = allowedNextStatuses(item.module, item.status);
  const sensitive = (status: string) => (
    (item.module === "cs" && ["Finalizado", "TransferidoSuporte"].includes(status)) ||
    (item.module === "lia" && ["GoLiveAgendado", "Concluida"].includes(status)) ||
    (item.module === "finance" && ["Aprovada", "Paga", "Estornada"].includes(status))
  );
  return <div className="drawer-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><aside className="drawer item-drawer"><div className="drawer-head simple"><div><span className="eyebrow">{MODULES[item.module as ModuleKey]?.label} · {item.record_type}</span><h2>{item.title}</h2><p>{item.customer_name || "Sem cliente vinculado"}</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div><div className="record-banner"><span className={`priority-badge ${item.priority.toLowerCase()}`}>{item.priority}</span><span className={`status-pill ${statusTone(item.status)}`}>{statusLabel(item.status)}</span><small>Atualizado {dateTime(item.updated_at)}</small></div><div className="detail-section"><h3>Contexto</h3><p className="record-description">{item.description || "Nenhuma descrição adicionada."}</p><dl><div><dt>Responsável</dt><dd>{item.owner}</dd></div><div><dt>Equipe</dt><dd>{item.team || "—"}</dd></div><div><dt>Prazo</dt><dd>{dateTime(item.due_at)}</dd></div><div><dt>SLA</dt><dd>{dateTime(item.sla_due_at)}</dd></div>{item.amount_cents > 0 && <div><dt>Valor</dt><dd>{formatMoney(item.amount_cents)}</dd></div>}</dl></div><div className="detail-section"><h3>Próximas ações permitidas</h3>{!canEdit ? <div className="terminal-note"><ShieldCheck size={18} /> Acesso somente para consulta.</div> : next.length === 0 ? <div className="terminal-note"><CheckCircle2 size={18} /> Este registro está em estado terminal.</div> : <div className="transition-list">{next.map((status) => <button disabled={busy} key={status} onClick={() => onTransition(status, sensitive(status))}><span><strong>{statusLabel(status)}</strong><small>{sensitive(status) ? "Ação sensível com confirmação e auditoria" : "Transição prevista na máquina de estados"}</small></span><ChevronRight size={17} /></button>)}</div>}</div></aside></div>;
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
