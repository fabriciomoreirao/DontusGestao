"use client";

import {
  Activity, ArrowLeft, ArrowRightLeft, BadgeCheck, Bell, BriefcaseBusiness, CalendarDays,
  ChartNoAxesCombined, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronRight, CircleDollarSign, Columns3, Copy,
  ClipboardCheck, Clock3, Command, Database, Eye, EyeOff, FileCheck2, Headphones, ImageIcon, LayoutDashboard,
  ExternalLink, List, ListTodo, LockKeyhole, Mail, Menu, MessageCircleMore, MessageSquareText, MonitorUp, Pencil, Plus, Save, Search, ShieldCheck,
  PanelLeftClose, PanelLeftOpen, RotateCcw, Settings, Sparkles, Stethoscope, Sun, Moon, Target, Trash2, Upload, UserPlus, UserRound, Users, UsersRound,
  X, XCircle,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { allowedNextStatuses, MODULES, PRIORITIES, RECORD_TYPES, STATE_MACHINES, type ModuleKey } from "@/lib/domain";
import TasksModule, { CatalogsModule, type CatalogSection, type TaskModuleData } from "@/app/TasksModule";
import ChatModule, { type ChatModuleData } from "@/app/ChatModule";
import AgendaModule, { AgendaCatalogsModule, type AgendaModuleData } from "@/app/AgendaModule";
import DiaryModule, { type DiaryModuleData } from "@/app/DiaryModule";
import NotesModule, { type NotesModuleData } from "@/app/NotesModule";
import InternalChatModule, { type InternalChatModuleData } from "@/app/InternalChatModule";
import SuggestionsModule, { SuggestionCatalogsModule, type SuggestionModuleData } from "@/app/SuggestionsModule";
import NoticesModule, { NoticeAttentionModal, NoticesAdmin, type NoticesModuleData } from "@/app/NoticesModule";
import DevelopmentModule from "@/app/DevelopmentModule";
import { LiaJourneyModule } from "@/app/OperationalJourneyModules";
import CustomerSuccessJourneyModule from "@/app/CustomerSuccessJourneyModule";
import CancellationsModule from "@/app/CancellationsModule";
import HrManagementModule from "@/app/HrManagementModule";
import ServiceRecordsModule from "@/app/ServiceRecordsModule";
import MarketingWorkspaceModule from "@/app/MarketingWorkspaceModule";
import WaitingQueueModule, { parseWaitingQueue } from "@/app/WaitingQueueModule";
import PortalDontus from "@/app/PortalDontus";
import ReferralsModule, { ReferralSettingsPage } from "@/app/ReferralsModule";
import EmployeeProfileDrawer from "@/app/EmployeeProfileDrawer";
import CommissionsModule from "@/app/CommissionsModule";
import GoalsModule from "@/app/GoalsModule";
import { PortalLinksAdmin } from "@/app/PortalLinksModule";
import SatisfactionSurveysModule, { PublicSurveyResponsePage } from "@/app/SatisfactionSurveysModule";
import OperationIndicatorsBoard from "@/app/OperationIndicatorsBoard";
import PublicOperationsOverview from "@/app/PublicOperationsOverview";
import { cleanDepartmentDescription, departmentQueueMode, serializeDepartmentDescription, type DepartmentQueueMode } from "@/lib/waitingQueue";

type Customer = {
  id: string; legal_name: string; trade_name: string; document_masked: string;
  segment: string; status: string; owner: string; cs_owner: string; support_owner: string;
  strategic: number; clinics_count: number; monthly_revenue_cents: number; created_at: string;
  open_task_protocols: string[];
  project: string; product_version: string; due_day: string; server: string; payment_method: string;
  invoice_company: string; grace_days: string; due_days: string; subscription: string;
  email: string; phone: string; website: string; notes: string; address: string; city: string; state: string;
};

type CustomerCatalogOption = { id: string; catalog: string; name: string; description: string; active: boolean };
type CustomerModuleData = { catalogs: CustomerCatalogOption[] };

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
  photoDataUrl: string; jobTitle: string; isCoordinator: boolean; blockedAt: string | null;
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
  employees: Employee[];
  departments: EmployeeDepartment[];
  levels: EmployeeLevel[];
};

type Employee = {
  id: string; displayName: string; email: string; birthDate: string | null; startedAt: string | null;
  departmentId: string | null; departmentName: string; levelId: string | null; levelName: string;
  departmentIds: string[]; departmentNames: string[];
  photoDataUrl: string; jobTitle: string; isCoordinator: boolean; subordinateUserIds: string[];
  groupIds: string[]; groupNames: string[];
  active: boolean; blockedAt: string | null;
};

type EmployeeDepartment = { id: string; name: string; description: string; active: boolean };
type EmployeeLevel = { id: string; name: string; description: string; active: boolean };
type AdminSection = "collaborators" | "departments" | "levels" | "agenda" | "customers" | "suggestions" | "commercialCatalogs" | "csCatalogs" | "liaCatalogs" | "serviceCatalogs" | "waitingQueueCatalogs" | "enterpriseCatalogs" | "cancellationCatalogs" | "hrCatalogs" | "referralCatalogs" | "recruitmentCatalogs" | "recruitment" | "audit" | "notices" | "background" | "permissions" | "links";
type ReportingSection = "performance" | "indicators" | "bi" | "biExecutive";

type AppData = {
  user: { email: string; displayName: string; role: string; department: string; photoDataUrl: string; jobTitle: string; isCoordinator: boolean; permissions: EffectivePermission[] };
  customers: Customer[];
  items: WorkItem[];
  appointments: Appointment[];
  approvals: Approval[];
  decisions: Decision[];
  audit: AuditEvent[];
  access: AccessManagement | null;
  taskModule: TaskModuleData | null;
  chatModule: ChatModuleData | null;
  agendaModule: AgendaModuleData | null;
  diaryModule: DiaryModuleData | null;
  notesModule: NotesModuleData | null;
  internalChatModule: InternalChatModuleData | null;
  suggestionModule: SuggestionModuleData | null;
  noticesModule: NoticesModuleData | null;
  customerModule: CustomerModuleData | null;
};

type Toast = { kind: "success" | "error"; message: string } | null;
type OperationResult = { id?: string; temporaryPassword?: string; createdProtocol?: string } | false;
type ConfirmationRequest = {
  payload: Record<string, unknown>;
  success: string;
  resolve: (result: OperationResult) => void;
};
type Modal = "workItem" | "customer" | "appointment" | null;

type NavigationItem = {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  module?: ModuleKey;
  adminSection?: AdminSection;
  commercialFlow?: CommercialFlow;
  csFlow?: CsFlow;
  reportingSection?: ReportingSection;
  analyticsDepartment?: string;
  configAdminSection?: AdminSection;
  configurable?: boolean;
  children?: NavigationItem[];
};

type CommercialFlow = "qualification" | "crm" | "retention";
type CsFlow = "onboarding" | "evolution" | "enterprise";
type SystemVisual = "azure" | "emerald" | "violet" | "amber" | "rose" | "teal" | "graphite";

const NAV_GROUPS: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: "Principal",
    items: [{ label: "Dashboard", icon: LayoutDashboard, module: "dashboard" }],
  },
  {
    label: "Módulos",
    items: [
      { label: "Diário de Bordo", icon: MessageSquareText, module: "diary" },
      { label: "Anotações", icon: Pencil, module: "notes" },
      { label: "Chat interno", icon: MessageCircleMore, module: "internalChat" },
      { label: "Tarefas", icon: ListTodo, module: "tasks" },
      { label: "Agenda", icon: CalendarDays, module: "work" },
      { label: "Sugestões", icon: Sparkles, module: "suggestions" },
      { label: "Avisos", icon: Bell, module: "notices" },
      { label: "WhatsApp", icon: MessageCircleMore, module: "chat" },
      { label: "Acesso", icon: ShieldCheck, module: "access" },
    ],
  },
  {
    label: "Operação",
    items: [
      { label: "Fila de espera", icon: Clock3, module: "waitingQueue", configurable: true, configAdminSection: "waitingQueueCatalogs" },
      { label: "Atendimentos", icon: Headphones, module: "support", configurable: true, configAdminSection: "serviceCatalogs" },
      { label: "CRM comercial", icon: BriefcaseBusiness, module: "commercial", commercialFlow: "crm", configurable: true, configAdminSection: "commercialCatalogs" },
      { label: "CRM retenção", icon: ShieldCheck, module: "commercial", commercialFlow: "retention", configurable: true, configAdminSection: "commercialCatalogs" },
      { label: "Acompanhamento Ativação", icon: UserPlus, module: "cs", csFlow: "onboarding", configurable: true, configAdminSection: "csCatalogs" },
      { label: "Acompanhamento Retenção", icon: ChartNoAxesCombined, module: "cs", csFlow: "evolution", configurable: true, configAdminSection: "csCatalogs" },
      { label: "Contas estratégicas", icon: UsersRound, module: "cs", csFlow: "enterprise", configurable: true, configAdminSection: "enterpriseCatalogs" },
      { label: "Cancelamentos", icon: RotateCcw, module: "cancellations", configurable: true, configAdminSection: "cancellationCatalogs" },
      { label: "Gestão de Marketing", icon: ImageIcon, module: "marketing", configurable: true },
      { label: "Desenvolvimento", icon: Command, module: "ti", configurable: true },
      { label: "Acompanhamento LIA", icon: Sparkles, module: "lia", configurable: true },
      { label: "Gestão RH", icon: UsersRound, module: "hr", configurable: true, configAdminSection: "hrCatalogs" },
      { label: "Processo seletivo", icon: UserPlus, module: "admin", adminSection: "recruitment", configurable: true, configAdminSection: "recruitmentCatalogs" },
      { label: "Comissões", icon: CircleDollarSign, module: "commissions", configurable: true },
      { label: "Metas", icon: Target, module: "goals", configurable: true },
      { label: "Indicações", icon: BadgeCheck, module: "referrals", configurable: true },
    ],
  },
  {
    label: "Administração",
    items: [
      { label: "Colaboradores", icon: UsersRound, module: "admin", adminSection: "collaborators" },
      { label: "Permissões", icon: ShieldCheck, module: "admin", adminSection: "permissions" },
      { label: "Links", icon: Command, module: "admin", adminSection: "links" },
      { label: "Avisos | Eventos", icon: Bell, module: "admin", adminSection: "notices" },
      { label: "Pesquisa de satisfação", icon: ClipboardCheck, module: "surveys" },
      { label: "Auditoria", icon: FileCheck2, module: "admin", adminSection: "audit" },
    ],
  },
];

const moduleDescriptions: Record<string, string> = {
  commercial: "Leads, oportunidades, metas, handoffs e pós-venda.",
  cs: "Treinamentos, onboarding de 90 dias, adoção e contas estratégicas.",
  cancellations: "Solicitações, reversões, renegociações e impacto da receita recorrente.",
  hr: "Experiência, histórico funcional, férias, documentos e desligamentos.",
  lia: "Kick-off, prompts versionados, testes, go-live e CRC.",
  support: "Atendimentos, protocolos, configurações, sugestões e bugs.",
  ti: "Triagem, prioridade, SLA, desenvolvimento, testes e deploy.",
  finance: "Estornos, pagamentos, boletos, cobrança, parceiros e DRE.",
  procurement: "Solicitações, cotações, suprimentos, ativos e movimentações.",
  diary: "Compromissos sob sua responsabilidade e atividades registradas manualmente.",
  notes: "Anotações pessoais para registrar, copiar e organizar do seu jeito.",
  suggestions: "Ideias, prioridades, sinalizadores, comentários e evolução no Kanban.",
  notices: "Comunicados e informações importantes para toda a empresa.",
  work: "Compromissos, reuniões e eventos com horário definido.",
  tasks: "Demandas internas, responsáveis, setores, comentários e SLA.",
  chat: "Conversas omnichannel, filas, números oficiais e atendimento entre setores.",
  waitingQueue: "Encaminhamentos do Portal Dontus aguardando contato dos setores.",
  commissions: "Comissões comerciais e de sucesso do cliente com aprovação e ciência.",
  goals: "Metas diárias, semanais e mensais de vendas, clientes e utilização.",
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
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [view, setView] = useState<"board" | "list">("list");
  const [catalogSection, setCatalogSection] = useState<CatalogSection>("departments");
  const [adminSection, setAdminSection] = useState<AdminSection>("collaborators");
  const [commercialFlow, setCommercialFlow] = useState<CommercialFlow>("qualification");
  const [csFlow, setCsFlow] = useState<CsFlow>("onboarding");
  const [dashboardPage, setDashboardPage] = useState<"home" | "portal">("home");
  const [reportingSection, setReportingSection] = useState<ReportingSection>("bi");
  const [analyticsDepartment, setAnalyticsDepartment] = useState("Todos");
  const [loginRequired, setLoginRequired] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [collapsedNavGroups, setCollapsedNavGroups] = useState<Record<string, boolean>>(() => Object.fromEntries(
    NAV_GROUPS
      .filter((group) => group.label === "Analytics" || group.label === "Cadastros" || group.label.startsWith("Administra"))
      .map((group) => [group.label, true]),
  ));
  const [collapsedNavItems, setCollapsedNavItems] = useState<Record<string, boolean>>({});
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [backgroundImage, setBackgroundImage] = useState("");
  const [backgroundModalOpen, setBackgroundModalOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [agendaVisual, setAgendaVisual] = useState<SystemVisual>("azure");
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [historyClientId, setHistoryClientId] = useState("");
  const [profileEmployee, setProfileEmployee] = useState<Employee | null>(null);
  const [profileEditable, setProfileEditable] = useState(false);
  const internalUnreadRef = useRef<number | null>(null);
  const viewedNoticeIdsRef = useRef<Set<string>>(new Set());
  const workspaceBackgroundStyle = backgroundImage ? {
    backgroundImage: (theme === "dark"
      ? "linear-gradient(rgba(8,18,31,.66), rgba(8,18,31,.76))"
      : "linear-gradient(rgba(244,247,251,.63), rgba(244,247,251,.72))") + ", url(\"" + backgroundImage + "\")",
  } as CSSProperties : undefined;

  useEffect(() => {
    const openProfile = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-collaborator-id],[data-collaborator-name]");
      if (!target || !data?.access?.employees) return;
      const employee = data.access.employees.find(entry => entry.id === target.dataset.collaboratorId || entry.displayName === target.dataset.collaboratorName);
      if (employee) { event.preventDefault(); event.stopPropagation(); setProfileEditable(false); setProfileEmployee(employee); }
    };
    document.addEventListener("click", openProfile, true);
    return () => document.removeEventListener("click", openProfile, true);
  }, [data?.access?.employees]);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("dontus.theme");
    const storedBackground = window.localStorage.getItem("dontus.workspace-background");
    const storedSidebar = window.localStorage.getItem("dontus.sidebar-collapsed");
    const storedAgendaVisual = window.localStorage.getItem("dontus.agenda-visual");
    if (storedTheme === "dark" || storedTheme === "light") setTheme(storedTheme);
    if (storedBackground) setBackgroundImage(storedBackground);
    if (storedSidebar === "true") setSidebarCollapsed(true);
    if (["azure", "emerald", "violet", "amber", "rose", "teal", "graphite"].includes(storedAgendaVisual ?? "")) setAgendaVisual(storedAgendaVisual as SystemVisual);
  }, []);

  const load = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const response = await fetch("/api/operations", { cache: "no-store" });
      const rawPayload = await response.text();
      let payload: AppData | { detail?: string } = {};
      if (rawPayload) {
        try { payload = JSON.parse(rawPayload) as AppData | { detail?: string }; }
        catch { throw new Error("A operação retornou uma resposta inválida."); }
      }
      if (response.status === 401) {
        setLoginRequired(true);
        setError("");
        return;
      }
      if (!response.ok) throw new Error((payload as { detail?: string }).detail ?? "Não foi possível carregar a operação.");
      const appPayload = payload as AppData;
      setData(appPayload);
      setLoginRequired(false);
      setActive((current) => {
        if (userCan(appPayload.user, current)) return current;
        return (appPayload.user.permissions.find((permission: EffectivePermission) => permission.canView)?.screen ?? "dashboard") as ModuleKey;
      });
      setError("");
    } catch (caught) {
      if (!background) setError(caught instanceof Error ? caught.message : "Falha ao carregar.");
    } finally {
      if (!background) setLoading(false);
    }
  };

  const refreshInternalChat = useCallback(async () => {
    try {
      const response = await fetch("/api/internal-chat", { cache: "no-store" });
      if (!response.ok) return;
      const internalChatModule = await response.json() as InternalChatModuleData;
      setData((current) => current ? { ...current, internalChatModule } : current);
    } catch {
      // A próxima atualização automática retoma o fluxo sem interromper a tela atual.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("public") === "overview") { setLoading(false); return; }
      const requestedModule = params.get("mod") as ModuleKey | null;
      if (requestedModule && requestedModule in MODULES && requestedModule !== "customers") setActive(requestedModule);
      const requestedCommercialFlow = params.get("commercialFlow") as CommercialFlow | null;
      if (requestedCommercialFlow === "qualification" || requestedCommercialFlow === "crm" || requestedCommercialFlow === "retention") setCommercialFlow(requestedCommercialFlow);
      const requestedCsFlow = params.get("csFlow") as CsFlow | null;
      if (requestedCsFlow === "onboarding" || requestedCsFlow === "evolution" || requestedCsFlow === "enterprise") setCsFlow(requestedCsFlow);
      setIndicatorsOpen(params.get("view") === "indicators");
      setHistoryClientId(params.get("clientId") ?? "");
      const requestedCatalog = params.get("cad") as CatalogSection | null;
      if (requestedCatalog && ["departments", "types", "priorities", "statuses", "kanban", "sla", "people"].includes(requestedCatalog))
        setCatalogSection(requestedCatalog);
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const syncUrlPages = () => { const params = new URLSearchParams(window.location.search); setIndicatorsOpen(params.get("view") === "indicators"); setHistoryClientId(params.get("clientId") ?? ""); };
    window.addEventListener("popstate", syncUrlPages);
    return () => window.removeEventListener("popstate", syncUrlPages);
  }, []);

  useEffect(() => {
    if (active !== "chat" && active !== "reporting" && active !== "waitingQueue") return;
    const timer = window.setInterval(() => void load(true), active === "reporting" || active === "waitingQueue" ? 6_000 : 12_000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!data?.user.permissions.some((permission) => permission.screen === "internalChat" && permission.canView)) return;
    const interval = active === "internalChat" ? 1_500 : 5_000;
    const timer = window.setInterval(() => void refreshInternalChat(), interval);
    return () => window.clearInterval(timer);
  }, [active, data?.user.email, data?.user.permissions, refreshInternalChat]);

  useEffect(() => {
    if (!data?.user.permissions.some((permission) => permission.screen === "notices" && permission.canView)) return;
    const timer = window.setInterval(() => void load(true), 4_000);
    return () => window.clearInterval(timer);
  }, [data?.user.email]);

  useEffect(() => {
    const chat = data?.internalChatModule;
    if (!chat) return;
    const total = chat.rooms.reduce((sum, room) => sum + room.unreadCount, 0);
    const previous = internalUnreadRef.current;
    if (previous !== null && total > previous) {
      const newest = chat.rooms.filter((room) => room.unreadCount > 0).sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())[0];
      const lastMessage = newest?.messages.at(-1);
      const message = lastMessage ? `Nova mensagem de ${lastMessage.senderName} no Chat interno.` : "Você recebeu uma nova mensagem no Chat interno.";
      setToast({ kind: "success", message });
      window.setTimeout(() => setToast(null), 4500);
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(`Chat interno · ${newest?.name ?? "Dontus"}`, { body: lastMessage?.body || "Nova mensagem recebida." });
      }
    }
    internalUnreadRef.current = total;
  }, [data?.internalChatModule]);

  const navigate = (module: ModuleKey, nextAdminSection?: AdminSection, nextCommercialFlow?: CommercialFlow, nextCsFlow?: CsFlow, nextReportingSection?: ReportingSection) => {
    if (data && !userCan(data.user, module)) {
      setToast({ kind: "error", message: "Seu grupo não possui acesso a esta tela." });
      window.setTimeout(() => setToast(null), 3500);
      return;
    }
    setActive(module);
    setDashboardPage("home");
    if (module === "commercial" && nextCommercialFlow) setCommercialFlow(nextCommercialFlow);
    if (module === "cs" && nextCsFlow) setCsFlow(nextCsFlow);
    if (module === "reporting" && nextReportingSection) setReportingSection(nextReportingSection);
    if (module === "internalChat" && "Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    if (module === "admin" && nextAdminSection) setAdminSection(nextAdminSection);
    setMobileNav(false);
    setSelectedItem(null);
    setSelectedCustomer(null);
    setIndicatorsOpen(false);
    setHistoryClientId("");
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    url.searchParams.delete("clientId");
    if (module === "dashboard") url.searchParams.delete("mod");
    else url.searchParams.set("mod", module);
    if (module === "commercial" && nextCommercialFlow) url.searchParams.set("commercialFlow", nextCommercialFlow);
    else if (module !== "commercial") {
      url.searchParams.delete("commercialFlow");
      url.searchParams.delete("lead");
    }
    if (module === "cs" && nextCsFlow) url.searchParams.set("csFlow", nextCsFlow);
    else if (module !== "cs") url.searchParams.delete("csFlow");
    if (module !== "catalogs") url.searchParams.delete("cad");
    window.history.replaceState({}, "", url);
  };

  const openIndicatorsPage = () => {
    setIndicatorsOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.set("view", "indicators");
    window.history.pushState({}, "", url);
  };

  const closeIndicatorsPage = () => {
    setIndicatorsOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    window.history.replaceState({}, "", url);
  };

  const openClientHistoryPage = (value: string) => {
    const query = value.trim();
    if (!query) return;
    setHistoryClientId(query);
    setIndicatorsOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    url.searchParams.set("clientId", query);
    window.history.pushState({}, "", url);
  };

  const closeClientHistoryPage = () => {
    setHistoryClientId("");
    const url = new URL(window.location.href);
    url.searchParams.delete("clientId");
    window.history.replaceState({}, "", url);
  };

  const changeTheme = (nextTheme: "light" | "dark") => {
    setTheme(nextTheme);
    window.localStorage.setItem("dontus.theme", nextTheme);
  };

  const changeBackgroundImage = (nextImage: string) => {
    try {
      if (nextImage) window.localStorage.setItem("dontus.workspace-background", nextImage);
      else window.localStorage.removeItem("dontus.workspace-background");
      setBackgroundImage(nextImage);
      setToast({ kind: "success", message: nextImage ? "Imagem de fundo atualizada com sucesso." : "Imagem de fundo removida com sucesso." });
      window.setTimeout(() => setToast(null), 3500);
    } catch {
      setToast({ kind: "error", message: "Não foi possível salvar esta imagem. Tente uma imagem menor." });
      window.setTimeout(() => setToast(null), 5000);
    }
  };

  const uploadBackgroundImage = (file?: File, onComplete?: () => void) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setToast({ kind: "error", message: "Selecione um arquivo de imagem." });
      window.setTimeout(() => setToast(null), 4000);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setToast({ kind: "error", message: "Envie uma imagem de até 2 MB." });
      window.setTimeout(() => setToast(null), 4000);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      changeBackgroundImage(String(reader.result ?? ""));
      onComplete?.();
    };
    reader.onerror = () => {
      setToast({ kind: "error", message: "Não foi possível ler esta imagem." });
      window.setTimeout(() => setToast(null), 4000);
    };
    reader.readAsDataURL(file);
  };

  const navigateCatalog = (section: CatalogSection) => {
    setCatalogSection(section);
    navigate("catalogs");
    const url = new URL(window.location.href);
    url.searchParams.set("mod", "catalogs");
    url.searchParams.set("cad", section);
    window.history.replaceState({}, "", url);
  };

  const executeOperation = async (payload: Record<string, unknown>, success: string): Promise<OperationResult> => {
    setBusy(true);
    try {
      const { requireConfirmation: _requireConfirmation, ...requestPayload } = payload;
      const response = await fetch("/api/operations", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestPayload),
      });
      const body = await response.text();
      let result: Record<string, unknown> = {};
      if (body) {
        try { result = JSON.parse(body) as Record<string, unknown>; }
        catch { throw new Error(body || "O servidor retornou uma resposta inválida."); }
      }
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "A operação não foi concluída.");
      setData((current) => current
        ? ({ ...current, ...result } as AppData)
        : (result as unknown as AppData));
      setModal(null);
      setSelectedItem(null);
      setToast({ kind: "success", message: success });
      window.setTimeout(() => setToast(null), 3500);
      return result as { id?: string; temporaryPassword?: string; createdProtocol?: string };
    } catch (caught) {
      setToast({ kind: "error", message: caught instanceof Error ? caught.message : "Falha na operação." });
      window.setTimeout(() => setToast(null), 5000);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const uploadTaskAttachments = async (taskId: string, files: File[], commentId?: string) => {
    if (files.length === 0) return true;
    setBusy(true);
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      const commentQuery = commentId ? `&commentId=${encodeURIComponent(commentId)}` : "";
      const response = await fetch(`/api/task-files?taskId=${encodeURIComponent(taskId)}${commentQuery}`, {
        method: "POST",
        body: form,
      });
      const rawResult = await response.text();
      let result: { detail?: string } = {};
      try { result = rawResult ? JSON.parse(rawResult) : {}; } catch { result = { detail: rawResult || "Falha no envio do anexo." }; }
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
      const rawResult = await response.text();
      let result: { detail?: string } = {};
      try { result = rawResult ? JSON.parse(rawResult) : {}; } catch { result = { detail: rawResult || "Falha no envio do arquivo." }; }
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
      .filter((customer) => `${customer.id} ${customer.trade_name} ${customer.legal_name} ${customer.document_masked} ${customer.phone}`.toLocaleLowerCase("pt-BR").includes(query))
      .slice(0, 4)
      .map((customer) => ({ id: customer.id, label: customer.trade_name, meta: "Cliente", kind: "customer" as const }));
    const records = data.items
      .filter((item) => `${item.customer_id ?? ""} ${item.title} ${item.customer_name} ${item.record_type} ${item.description}`.toLocaleLowerCase("pt-BR").includes(query))
      .slice(0, 6)
      .map((item) => ({ id: item.id, label: item.title, meta: `${item.record_type} · ${MODULES[item.module as ModuleKey]?.short ?? item.module}`, kind: "item" as const }));
    const tasks = (data.taskModule?.tasks ?? [])
      .filter((task) => `${task.customerId ?? ""} ${task.customerCode} ${task.customerName} ${task.protocol} ${task.title} ${task.description}`.toLocaleLowerCase("pt-BR").includes(query))
      .slice(0, 4)
      .map((task) => ({ id: task.id, label: `${task.protocol} · ${task.title}`, meta: `Tarefa · ${task.statusName}`, kind: "task" as const }));
    const suggestions = (data.suggestionModule?.suggestions ?? [])
      .filter((suggestion) => `${suggestion.customerId ?? ""} ${suggestion.customerName} ${suggestion.protocol} ${suggestion.name} ${suggestion.description}`.toLocaleLowerCase("pt-BR").includes(query))
      .slice(0, 3)
      .map((suggestion) => ({ id: suggestion.id, label: `${suggestion.protocol} · ${suggestion.name}`, meta: `Sugestão · ${suggestion.statusName}`, kind: "suggestion" as const }));
    return [...customers, ...records, ...tasks, ...suggestions].slice(0, 12);
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

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAccountMenuOpen(false);
    setData(null);
    setLoginRequired(true);
  };

  const deleteTaskAttachment = async (attachmentId: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/task-files?id=${encodeURIComponent(attachmentId)}`, { method: "DELETE" });
      const raw = await response.text();
      let result: { detail?: string } = {};
      try { result = raw ? JSON.parse(raw) : {}; } catch { result = { detail: raw || "Falha ao excluir o anexo." }; }
      if (!response.ok) throw new Error(result.detail ?? "O anexo não foi excluído.");
      await load(true);
      setToast({ kind: "success", message: "Anexo excluído com sucesso." });
      window.setTimeout(() => setToast(null), 3500);
      return true;
    } catch (caught) {
      setToast({ kind: "error", message: caught instanceof Error ? caught.message : "Falha ao excluir o anexo." });
      window.setTimeout(() => setToast(null), 5000);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const uploadInternalChatAttachments = async (roomId: string, files: File[]) => {
    if (files.length === 0) return true;
    setBusy(true);
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      const response = await fetch(`/api/internal-chat-files?roomId=${encodeURIComponent(roomId)}`, { method: "POST", body: form });
      const rawResult = await response.text();
      let result: { detail?: string } = {};
      try { result = rawResult ? JSON.parse(rawResult) : {}; } catch { result = { detail: rawResult || "Falha no envio do arquivo." }; }
      if (!response.ok) throw new Error(result.detail ?? "Os arquivos não foram enviados.");
      await refreshInternalChat();
      setToast({ kind: "success", message: files.length === 1 ? "Arquivo enviado no chat." : `${files.length} arquivos enviados no chat.` });
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

  const markInternalChatRead = useCallback(async (roomId: string) => {
    try {
      const response = await fetch("/api/operations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markInternalChatRoomRead", roomId }),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result) setData((current) => current ? { ...current, ...result } : result);
    } catch {
      // A leitura será sincronizada novamente no próximo ciclo do chat.
    }
  }, []);

  const operate = (payload: Record<string, unknown>, success: string): Promise<OperationResult> => new Promise((resolve) => {
    const action = String(payload.action ?? "").toLowerCase();
    // Atualizações rápidas (comentários, status, kanban e marcações) são aplicadas diretamente.
    // A confirmação central fica restrita a exclusões e edições abertas pelos botões dos cards.
    const requiresConfirmation = action.startsWith("delete") || payload.requireConfirmation === true;
    if (!requiresConfirmation) {
      void executeOperation(payload, success).then(resolve);
      return;
    }
    setConfirmation({ payload, success, resolve });
  });

  const cancelOperation = () => {
    const request = confirmation;
    setConfirmation(null);
    request?.resolve(false);
  };

  const confirmOperation = async () => {
    const request = confirmation;
    if (!request) return;
    setConfirmation(null);
    request.resolve(await executeOperation(request.payload, request.success));
  };

  const attentionNotice = data?.noticesModule?.notices.find((notice) =>
    notice.active && notice.visibleToCurrentUser && !notice.isRead) ?? null;

  useEffect(() => {
    if (!attentionNotice || viewedNoticeIdsRef.current.has(attentionNotice.id)) return;
    viewedNoticeIdsRef.current.add(attentionNotice.id);
    void fetch("/api/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markNoticeViewed", id: attentionNotice.id }),
    }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json();
      setData((current) => current ? ({ ...current, ...result } as AppData) : (result as unknown as AppData));
    }).catch(() => {
      viewedNoticeIdsRef.current.delete(attentionNotice.id);
    });
  }, [attentionNotice?.id]);

  const publicOverview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("public") === "overview";
  if (publicOverview) return <PublicOperationsOverview />;
  const publicSurveyToken = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("survey") : null;
  if (publicSurveyToken) return <PublicSurveyResponsePage token={publicSurveyToken} />;
  if (loading) return <LoadingScreen />;
  if (loginRequired) return <LoginScreen onAuthenticated={() => { setLoginRequired(false); void load(); }} />;
  if (error || !data) return <ErrorScreen message={error} onRetry={load} />;
  const publicProcessId = new URLSearchParams(window.location.search).get("process");
  if (new URLSearchParams(window.location.search).get("application") === "processo-seletivo" && publicProcessId)
    return <PublicRecruitmentApplication data={data} processId={publicProcessId} busy={busy} onOperate={operate} />;
  const internalChatUnread = data.internalChatModule?.rooms.reduce((sum, room) => sum + room.unreadCount, 0) ?? 0;
  const taskUnread = data.taskModule?.notifications.filter((notification) => !notification.read && !data.taskModule?.tasks.some((task) => task.id === notification.taskId && Boolean(task.completedAt))).length ?? 0;
  const noticeUnread = data.noticesModule?.notices.filter((notice) => notice.active && notice.visibleToCurrentUser && !notice.isRead).length ?? 0;
  const waitingQueueCount = data.items.filter((item) => item.module === "waitingQueue" && parseWaitingQueue(item.description)?.state === "waiting").length;
  const totalUnread = internalChatUnread + taskUnread + noticeUnread;
  const upcomingCommitments = (data.agendaModule?.commitments ?? []).filter((entry) => {
    const minutes = (new Date(entry.startsAt).getTime() - Date.now()) / 60_000;
    return minutes >= 0 && minutes <= 30 && (entry.responsibleName === data.user.displayName || entry.participantUserIds.includes(data.user.email));
  });
  const cancellationAlerts = data.items.filter((item) => item.module === "cs" && item.owner === data.user.displayName).flatMap((item) => {
    try {
      const journey = JSON.parse(item.description) as { cancellationRequestedAt?: string; cancellationOutcome?: string; cancellationReason?: string };
      if (!journey.cancellationRequestedAt || Date.now() - new Date(item.updated_at).getTime() > 14 * 86_400_000) return [];
      const resolved = journey.cancellationOutcome === "cancelled";
      return [{ id: `cancellation-${item.id}-${item.version}`, title: resolved ? `${item.title}: cancelamento enviado para conferência` : `${item.title}: entrar em contato para alinhar a reversão`, meta: journey.cancellationReason || "Cancelamentos", module: "cs" as ModuleKey, at: item.updated_at }];
    } catch { return []; }
  });
  const notificationEntries = [
    ...(data.taskModule?.notifications.filter((entry) => !entry.read).map((entry) => ({ id: `task-${entry.id}`, title: entry.message, meta: "Tarefa", module: "tasks" as ModuleKey, at: entry.createdAt })) ?? []),
    ...(data.internalChatModule?.rooms.filter((entry) => entry.unreadCount > 0).map((entry) => ({ id: `chat-${entry.id}`, title: `${entry.unreadCount} nova(s) mensagem(ns) em ${entry.name}`, meta: "Chat interno", module: "internalChat" as ModuleKey, at: entry.lastMessageAt })) ?? []),
    ...(data.noticesModule?.notices.filter((entry) => entry.active && entry.visibleToCurrentUser && !entry.isRead).map((entry) => ({ id: `notice-${entry.id}`, title: entry.title, meta: entry.kind, module: "notices" as ModuleKey, at: entry.publishedAt })) ?? []),
    ...upcomingCommitments.map((entry) => ({ id: `agenda-${entry.id}`, title: `${entry.title} começa em até 30 minutos`, meta: "Agenda", module: "work" as ModuleKey, at: entry.startsAt })),
    ...cancellationAlerts,
    ...data.items.filter((item) => item.module === "waitingQueue" && parseWaitingQueue(item.description)?.state === "waiting" && (!item.owner || item.owner === data.user.displayName || item.team === data.user.department)).map((item) => ({ id: `queue-${item.id}`, title: `${item.title} aguarda contato`, meta: `Fila de espera · ${item.team}`, module: "waitingQueue" as ModuleKey, at: item.created_at })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 20);
  const notificationTotal = notificationEntries.length;
  const operationContext = active === "admin" && adminSection === "recruitment"
    ? { module: "recruitment", title: "Processo seletivo" }
    : active === "commercial"
      ? { module: "commercial", title: commercialFlow === "retention" ? "CRM retenção" : "CRM comercial" }
      : active === "cs"
        ? { module: "cs", title: csFlow === "enterprise" ? "Contas estratégicas" : csFlow === "evolution" ? "Acompanhamento Retenção" : "Acompanhamento Ativação" }
        : ({ waitingQueue: "Fila de espera", support: "Atendimentos", marketing: "Gestão de Marketing", ti: "Desenvolvimento", lia: "Acompanhamento LIA", commissions: "Comissões", goals: "Metas", referrals: "Indicações", diary: "Diário de Bordo", tasks: "Tarefas", work: "Agenda", suggestions: "Sugestões", access: "Acesso" } as Record<string, string>)[active]
          ? { module: active, title: ({ waitingQueue: "Fila de espera", support: "Atendimentos", marketing: "Gestão de Marketing", ti: "Desenvolvimento", lia: "Acompanhamento LIA", commissions: "Comissões", goals: "Metas", referrals: "Indicações", diary: "Diário de Bordo", tasks: "Tarefas", work: "Agenda", suggestions: "Sugestões", access: "Acesso" } as Record<string, string>)[active] }
          : null;
  const indicatorItems: WorkItem[] = (() => {
    const normalized: WorkItem[] = [...data.items];
    data.diaryModule?.entries.forEach((entry) => normalized.push({ id: `diary-${entry.id}`, module: "diary", record_type: entry.type || "Atividade", title: entry.title, customer_id: null, customer_name: "", owner: data.user.displayName, team: "Diário de Bordo", status: entry.status, priority: "P3", due_at: entry.occursAt, sla_due_at: null, amount_cents: 0, description: JSON.stringify({ source: entry.source, agendaStatusId: entry.agendaStatusId }), version: entry.version ?? 0, created_at: entry.occursAt, updated_at: entry.occursAt }));
    data.taskModule?.tasks.forEach((task) => normalized.push({ id: `task-${task.id}`, module: "tasks", record_type: task.typeName || "Tarefa", title: task.title, customer_id: task.customerId, customer_name: task.customerName, owner: task.assigneeName || "Não atribuído", team: task.departmentName, status: task.statusName, priority: task.priorityName, due_at: task.dueAt, sla_due_at: task.slaDueAt, amount_cents: 0, description: JSON.stringify({ protocol: task.protocol, slaState: task.slaState, cancelled: task.cancelled, comments: task.comments.length }), version: task.version, created_at: task.createdAt, updated_at: task.updatedAt }));
    data.agendaModule?.commitments.forEach((entry) => normalized.push({ id: `agenda-${entry.id}`, module: "work", record_type: entry.typeName || "Compromisso", title: entry.title, customer_id: null, customer_name: "", owner: entry.responsibleName, team: data.agendaModule?.calendars.find((calendar) => calendar.id === entry.agendaId)?.departmentName || "Agenda", status: entry.statusName, priority: "P3", due_at: entry.startsAt, sla_due_at: null, amount_cents: 0, description: JSON.stringify({ participants: entry.participantUserIds.length, agendaId: entry.agendaId }), version: 1, created_at: entry.startsAt, updated_at: entry.startsAt }));
    data.suggestionModule?.suggestions.forEach((entry) => normalized.push({ id: `suggestion-${entry.id}`, module: "suggestions", record_type: "Sugestão", title: entry.name, customer_id: entry.customerId, customer_name: entry.customerName, owner: entry.responsibleName || "Não atribuído", team: "Sugestões", status: entry.statusName, priority: entry.priorityName, due_at: null, sla_due_at: null, amount_cents: 0, description: JSON.stringify({ protocol: entry.protocol, strategicClient: entry.strategicClient, cancellationRisk: entry.cancellationRisk, comments: entry.comments.length }), version: entry.version, created_at: entry.createdAt, updated_at: entry.updatedAt }));
    data.audit.filter((entry) => /access|login|external|link/i.test(`${entry.action} ${entry.resource} ${entry.module}`)).forEach((entry) => normalized.push({ id: `access-${entry.id}`, module: "access", record_type: entry.resource || "Acesso externo", title: entry.action, customer_id: null, customer_name: "", owner: entry.actor_email, team: entry.module || "Acesso", status: entry.result, priority: "P3", due_at: null, sla_due_at: null, amount_cents: 0, description: entry.details, version: 1, created_at: entry.created_at, updated_at: entry.created_at }));
    return normalized;
  })();
  const canSeeNavigationItem = (item: NavigationItem): boolean => {
    if (item.children?.length) return item.children.some(canSeeNavigationItem);
    if (!item.module) return false;
    return userCan(data.user, item.module, "view") || userCan(data.user, item.module, "edit");
  };
  const navigationGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.flatMap((item) => {
      const children = item.children?.filter(canSeeNavigationItem);
      const candidate = children ? { ...item, children } : item;
      return canSeeNavigationItem(candidate) ? [candidate] : [];
    }),
  })).filter((group) => group.items.length > 0);
  const markAllNotificationsRead = async () => {
    const requests: Array<Record<string, unknown>> = [
      ...(data.taskModule?.notifications.filter((entry) => !entry.read).map((entry) => ({ action: "markTaskNotificationRead", notificationId: entry.id })) ?? []),
      ...(data.noticesModule?.notices.filter((entry) => entry.active && entry.visibleToCurrentUser && !entry.isRead).map((entry) => ({ action: "markNoticeRead", id: entry.id })) ?? []),
      ...(data.internalChatModule?.rooms.filter((entry) => entry.unreadCount > 0).map((entry) => ({ action: "markInternalChatRoomRead", roomId: entry.id })) ?? []),
    ];
    if (!requests.length) return;
    setBusy(true);
    try {
      await Promise.all(requests.map(async (payload) => {
        const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error("Falha ao atualizar uma notificação.");
      }));
      await load(true);
      setNotificationCenterOpen(false);
      setToast({ kind: "success", message: "Todas as notificações foram marcadas como vistas." });
      window.setTimeout(() => setToast(null), 3500);
    } catch {
      setToast({ kind: "error", message: "Não foi possível marcar todas as notificações como vistas." });
      window.setTimeout(() => setToast(null), 4500);
    } finally { setBusy(false); }
  };
  const renderNavigationItem = (item: NavigationItem, path: string, depth = 0): React.ReactNode => {
    const { label, icon: Icon, module, adminSection: itemAdminSection, commercialFlow: itemCommercialFlow, csFlow: itemCsFlow, reportingSection: itemReportingSection, analyticsDepartment: itemAnalyticsDepartment, children } = item;
    const hasChildren = Boolean(children?.length);
    const itemCollapsed = collapsedNavItems[path] === true;
    const nested = depth > 0;
    const activeItem = Boolean((module && active === module &&
      (!itemAdminSection || adminSection === itemAdminSection) &&
      (!itemCommercialFlow || commercialFlow === itemCommercialFlow) &&
      (!itemCsFlow || csFlow === itemCsFlow) &&
      (!itemReportingSection || reportingSection === itemReportingSection) &&
      (!itemAnalyticsDepartment || analyticsDepartment === itemAnalyticsDepartment)) ||
      (!module && label.includes("BI") && active === "reporting" && reportingSection === "bi"));
    const itemClassName = nested
      ? `nav-subitem ${hasChildren ? "nav-subitem-parent" : ""} ${activeItem ? "active" : ""}`
      : `nav-item ${hasChildren ? "nav-parent-item" : ""} ${activeItem ? "active" : ""}`;
    const iconSize = nested ? 14 : 18;
    const navigationControl = itemAnalyticsDepartment ? (
      <button className={itemClassName} onClick={() => { setAnalyticsDepartment(itemAnalyticsDepartment); navigate("reporting", undefined, undefined, undefined, "bi"); }}>
        <Icon size={iconSize} /><span>{label}</span>
      </button>
    ) : label.includes("BI") ? (
      <button className={itemClassName} onClick={() => navigate("reporting", undefined, undefined, undefined, "bi")}>
        <Icon size={iconSize} /><span>{label}</span>
      </button>
    ) : module ? (
      <button className={itemClassName} onClick={() => navigate(module, itemAdminSection, itemCommercialFlow, itemCsFlow, itemReportingSection)}>
        <Icon size={iconSize} /><span>{label}</span>{module === "internalChat" && internalChatUnread > 0 && <b className="nav-unread-badge">{internalChatUnread > 99 ? "99+" : internalChatUnread}</b>}{module === "tasks" && taskUnread > 0 && <b className="nav-unread-badge">{taskUnread > 99 ? "99+" : taskUnread}</b>}{module === "notices" && noticeUnread > 0 && <b className="nav-unread-badge">{noticeUnread > 99 ? "99+" : noticeUnread}</b>}{module === "waitingQueue" && waitingQueueCount > 0 && <b className="nav-unread-badge waiting">{waitingQueueCount > 99 ? "99+" : waitingQueueCount}</b>}
      </button>
    ) : (
      <div className={`${itemClassName} ${nested ? "nav-subitem-static" : "nav-item-static"}`} aria-disabled="true"><Icon size={iconSize} /><span>{label}</span></div>
    );
    return <div className={hasChildren ? `catalog-nav-wrap nav-depth-${depth}` : undefined} key={path}>
      {hasChildren ? (
        <button className={itemClassName} type="button" onClick={() => setCollapsedNavItems((current) => ({ ...current, [path]: !itemCollapsed }))} aria-expanded={!itemCollapsed}>
          <Icon size={iconSize} /><span>{label}</span><ChevronDown className={itemCollapsed ? "" : "expanded"} size={15} />
        </button>
      ) : (
        <div className="nav-leaf-row">{navigationControl}</div>
      )}
      {hasChildren && !itemCollapsed && <div className={`catalog-subnav ${nested ? "catalog-subnav-nested" : ""}`} aria-label={`Opções de ${label}`}>
        {children?.map((child) => renderNavigationItem(child, `${path}:${child.label}`, depth + 1))}
      </div>}
    </div>;
  };

  return (
    <div className={["app-shell", theme === "dark" ? "theme-dark" : "theme-light", backgroundImage ? "has-workspace-background" : "", active === "chat" ? "chat-focus-mode" : "", sidebarCollapsed ? "sidebar-collapsed" : "", `agenda-visual-${agendaVisual}`, `system-accent-${agendaVisual}`].join(" ")}>
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <Image src="/dontus-logo.png" alt="Dontus Gestão Odontológica" width={184} height={52} priority unoptimized />
          <button className="sidebar-collapse-button" onClick={() => setSidebarCollapsed(current => { const next = !current; window.localStorage.setItem("dontus.sidebar-collapsed", String(next)); return next; })} title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"} aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}>{sidebarCollapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</button>
        </div>
        <nav aria-label="Navegação principal">
          {navigationGroups.map((group) => {
            const groupCollapsed = collapsedNavGroups[group.label] === true;
            return <div className={`nav-group ${groupCollapsed ? "collapsed" : ""}`} key={group.label}>
              <button className="nav-group-toggle" type="button" onClick={() => setCollapsedNavGroups((current) => ({ ...current, [group.label]: !groupCollapsed }))} aria-expanded={!groupCollapsed}>
                <span>{group.label}</span><ChevronDown className={groupCollapsed ? "" : "expanded"} size={14} />
              </button>
              {!groupCollapsed && <div className="nav-group-items">
                {group.items.map((item) => renderNavigationItem(item, `${group.label}:${item.label}`))}
              </div>}
            </div>;
          })}
        </nav>
        <div className="sidebar-footer">
          <button className="sidebar-account" onClick={() => setAccountMenuOpen((current) => !current)} aria-expanded={accountMenuOpen}>
            <ProfileAvatar name={data.user.displayName} photo={data.user.photoDataUrl} coordinator={data.user.isCoordinator} />
            <span><strong>{data.user.displayName}</strong><small>{data.user.jobTitle || data.user.role}</small></span>
            <ChevronDown size={15} />
          </button>
          {accountMenuOpen && <div className="account-menu">
            <button onClick={() => { const employee=data.access?.employees.find(entry=>entry.email===data.user.email)??null; setProfileEditable(true); setProfileEmployee(employee); setAccountMenuOpen(false); }}>Perfil</button>
            <button onClick={() => { setChangingPassword(true); setAccountMenuOpen(false); }}>Alterar senha</button>
            <button className="signout" onClick={() => void signOut()}>Sair do sistema</button>
          </div>}
        </div>
      </aside>

      {mobileNav && <button className="nav-backdrop" aria-label="Fechar navegação" onClick={() => setMobileNav(false)} />}

      <main className="main" style={workspaceBackgroundStyle}>
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu size={21} /></button>
          <div className="global-search">
            <Search size={18} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && search.trim().length >= 3) { openClientHistoryPage(search); setSearch(""); } }} placeholder="Buscar ID, clientes, protocolos, tarefas..." aria-label="Busca global" />
            <kbd>⌘ K</kbd>
            {(globalResults.length > 0 || search.trim().length >= 3) && (
              <div className="search-results">
                {search.trim().length >= 3 && <button className="search-id-overview" onClick={() => { openClientHistoryPage(search); setSearch(""); }}><span><b>Abrir página do ID {search.trim()}</b></span><small>Tarefas, atendimentos, temas, sugestões, acompanhamentos, agenda e rede</small></button>}
                {globalResults.map((result) => (
                  <button key={`${result.kind}-${result.id}`} onClick={() => {
                    const searchedId = search.trim();
                    const idSearch = /^#?[\d-]{3,}$/.test(searchedId) || result.kind === "customer" && result.id.toLocaleLowerCase("pt-BR") === searchedId.toLocaleLowerCase("pt-BR");
                    if (idSearch) {
                      openClientHistoryPage(searchedId);
                    } else if (result.kind === "customer") {
                      const customer = data.customers.find((entry) => entry.id === result.id) ?? null;
                      setSelectedCustomer(customer); navigate("customers");
                    } else if (result.kind === "item") {
                      const item = data.items.find((entry) => entry.id === result.id) ?? null;
                      if (item) { navigate(item.module as ModuleKey); setSelectedItem(item); }
                    } else if (result.kind === "task") {
                      navigate("tasks");
                    } else {
                      navigate("suggestions");
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
            <button className="icon-button background-shortcut" onClick={() => setBackgroundModalOpen(true)} aria-label="Alterar imagem de fundo" title="Alterar imagem de fundo"><Upload size={18} /></button>
            <button className="icon-button theme-toggle" onClick={() => changeTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"} title={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="notification-center-wrap"><button className="icon-button notification-button" aria-label={notificationTotal ? `${notificationTotal} notificações` : "Sem notificações"} onClick={() => setNotificationCenterOpen(current => !current)}><Bell size={19} />{notificationTotal > 0 && <b>{notificationTotal > 99 ? "99+" : notificationTotal}</b>}</button>{notificationCenterOpen&&<section className="notification-center"><header><span><strong>Notificações</strong><small>Atualizações em que você participa</small></span><div className="notification-center-head-actions">{notificationTotal>0&&<button className="mark-all-read" disabled={busy} onClick={()=>void markAllNotificationsRead()}><CheckCheck size={15}/>Marcar todas como vistas</button>}<button onClick={()=>setNotificationCenterOpen(false)} aria-label="Fechar notificações"><X size={15}/></button></div></header><div>{notificationEntries.length===0?<p>Nenhuma notificação pendente.</p>:notificationEntries.map(entry=><button key={entry.id} onClick={()=>{setNotificationCenterOpen(false);navigate(entry.module)}}><span><strong>{entry.title}</strong><small>{entry.meta} · {dateTime(entry.at)}</small></span><ChevronRight size={15}/></button>)}</div></section>}</div>
          </div>
        </header>

        <div className={`content ${indicatorsOpen || historyClientId ? "indicators-page-active" : ""}`}>
          {historyClientId ? <ClientHistoryPage query={historyClientId} data={data} onClose={closeClientHistoryPage} onNavigate={(module) => { closeClientHistoryPage(); navigate(module); }} /> : indicatorsOpen && operationContext ? <OperationIndicatorsBoard title={operationContext.title} module={operationContext.module} contextKey={`${active}:${commercialFlow}:${csFlow}:${adminSection}`} items={indicatorItems} employees={data.access?.employees ?? []} onClose={closeIndicatorsPage} /> : <>
          {operationContext && <OperationIndicatorsLauncher pageKey={`${active}:${commercialFlow}:${csFlow}`} onOpen={openIndicatorsPage} />}
          {active === "dashboard" && (
            dashboardPage === "portal"
              ? <PortalDontus data={data} busy={busy} operate={operate} onBack={() => setDashboardPage("home")} />
              : <Dashboard data={data} onNavigate={navigate} onPortal={() => setDashboardPage("portal")} />
          )}
          {active === "commercial" && data.customerModule && <CommercialLeadsModule
            flow={commercialFlow}
            catalogs={data.customerModule.catalogs}
            items={data.items}
            employees={data.access?.employees ?? []}
            agendaModule={data.agendaModule}
            currentUser={data.user}
            busy={busy}
            canCreate={userCan(data.user, "commercial", "create")}
            canEdit={userCan(data.user, "commercial", "edit")}
            canDelete={userCan(data.user, "commercial", "edit")}
            operate={operate}
            onOpenSettings={userCan(data.user, "commercial", "manage") ? () => navigate("admin", "commercialCatalogs") : undefined}
          />}
          {active === "cs" && data.customerModule && (csFlow === "enterprise" ? <CustomerSuccessModule flow={csFlow} catalogs={data.customerModule.catalogs} items={data.items} agendaModule={data.agendaModule} employees={data.access?.employees ?? []} currentUser={data.user} busy={busy} canEdit={userCan(data.user, "cs", "edit")} canDelete={userCan(data.user, "cs", "edit")} operate={operate} onOpenSettings={userCan(data.user, "cs", "manage") ? () => navigate("admin", "enterpriseCatalogs") : undefined} /> : <CustomerSuccessJourneyModule flow={csFlow} catalogs={data.customerModule.catalogs} items={data.items} customers={data.customers} agendaModule={data.agendaModule} taskModule={data.taskModule} employees={data.access?.employees ?? []} currentUser={data.user} busy={busy} canCreate={userCan(data.user, "cs", "create")} canEdit={userCan(data.user, "cs", "edit")} canDelete={userCan(data.user, "cs", "edit")} canCreateTask={userCan(data.user, "cancellations", "create")} operate={operate} onOpenSettings={userCan(data.user, "cs", "manage") ? () => navigate("admin", "csCatalogs") : undefined} />)}
          {active === "cancellations" && data.customerModule && <CancellationsModule items={data.items} customers={data.customers} catalogs={data.customerModule.catalogs} employees={data.access?.employees ?? []} currentUser={data.user} busy={busy} canCreate={userCan(data.user, "cancellations", "create")} canEdit={userCan(data.user, "cancellations", "edit")} canDelete={userCan(data.user, "cancellations", "edit")} operate={operate} onOpenSettings={userCan(data.user, "cancellations", "manage") ? () => navigate("admin", "cancellationCatalogs") : undefined} />}
          {active === "hr" && data.customerModule && <HrManagementModule items={data.items} catalogs={data.customerModule.catalogs} currentUser={data.user} busy={busy} canEdit={userCan(data.user, "hr", "edit")} operate={operate} onOpenSettings={userCan(data.user, "hr", "manage") ? () => navigate("admin", "hrCatalogs") : undefined} />}
          {active === "support" && data.customerModule && <ServiceRecordsModule items={data.items} customers={data.customers} catalogs={data.customerModule.catalogs} employees={data.access?.employees ?? []} departments={data.access?.departments ?? []} currentUser={data.user} busy={busy} canCreate={userCan(data.user, "support", "create")} canEdit={userCan(data.user, "support", "edit")} canDelete={userCan(data.user, "support", "edit")} operate={operate} onOpenSettings={userCan(data.user, "support", "manage") ? () => navigate("admin", "serviceCatalogs") : undefined} />}
          {active === "waitingQueue" && <WaitingQueueModule items={data.items} employees={data.access?.employees ?? []} departments={data.access?.departments ?? []} currentUser={data.user} busy={busy} operate={operate} onOpenSettings={userCan(data.user, "waitingQueue", "manage") ? () => navigate("admin", "waitingQueueCatalogs") : undefined} />}
          {active === "referrals" && data.customerModule && <ReferralsModule items={data.items} catalogs={data.customerModule.catalogs} employees={(data.access?.employees ?? []).filter(employee => employee.active)} departments={data.access?.departments ?? []} currentUser={data.user} busy={busy} canEdit={userCan(data.user, "referrals", "edit")} operate={operate} onOpenSettings={userCan(data.user, "referrals", "manage") ? ()=>navigate("admin","referralCatalogs") : undefined} />}
          {active === "commissions" && data.customerModule && <CommissionsModule items={data.items} catalogs={data.customerModule.catalogs} employees={data.access?.employees ?? []} currentUser={data.user} busy={busy} canApprove={userCan(data.user,"commissions","approve")} canManage={userCan(data.user,"commissions","manage")} operate={operate} />}
          {active === "goals" && <GoalsModule items={data.items} taskItems={data.taskModule?.tasks ?? []} catalogs={data.customerModule?.catalogs ?? []} employees={data.access?.employees ?? []} departments={data.access?.departments ?? []} currentUser={data.user} busy={busy} canCreate={userCan(data.user,"goals","create")} canEdit={userCan(data.user,"goals","edit")} canManage={userCan(data.user,"goals","manage")} operate={operate} />}
          {active === "surveys" && <SatisfactionSurveysModule items={data.items} employees={data.access?.employees ?? []} departments={data.access?.departments ?? []} currentUser={data.user} busy={busy} canEdit={userCan(data.user,"surveys","edit")} operate={operate} />}
          {["finance", "procurement"].includes(active) && (
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
              canEdit={userCan(data.user, active, "edit")}
              onMove={(item, status) => operate({ action: "transitionWorkItem", id: item.id, nextStatus: status, version: item.version, confirmed: true, boardMove: true }, `Registro movido para ${status}.`)}
            />
          )}
          {active === "lia" && <LiaJourneyModule items={data.items} employees={(data.access?.employees ?? []).filter((employee) => employee.active)} catalogs={data.customerModule?.catalogs ?? []} currentUser={data.user.displayName} canEdit={userCan(data.user, "lia", "edit")} busy={busy} operate={operate} agendaModule={data.agendaModule} onOpenSettings={userCan(data.user, "lia", "manage") ? () => navigate("admin", "liaCatalogs") : undefined} />}
          {active === "marketing" && <MarketingWorkspaceModule items={data.items} employees={(data.access?.employees ?? []).filter((employee) => employee.active)} currentUser={data.user.displayName} canEdit={userCan(data.user, "marketing", "edit")} busy={busy} operate={operate} onOpenSettings={undefined} />}
          {active === "work" && data.agendaModule && <AgendaModule module={data.agendaModule} busy={busy} operate={operate} currentEmail={data.user.email} onOpenSettings={userCan(data.user, "work", "manage") ? () => navigate("admin", "agenda") : undefined} />}
          {active === "diary" && data.diaryModule && <DiaryModule module={data.diaryModule} busy={busy} canCreate={userCan(data.user,"diary","create")} canEdit={userCan(data.user,"diary","edit")} operate={operate} />}
          {active === "notes" && data.notesModule && <NotesModule module={data.notesModule} busy={busy} operate={operate} />}
          {active === "notices" && data.noticesModule && <NoticesModule module={data.noticesModule} busy={busy} operate={operate} />}
          {active === "suggestions" && data.suggestionModule && <SuggestionsModule module={data.suggestionModule} customers={data.customers} canCreate={userCan(data.user, "suggestions", "create")} canEdit={userCan(data.user, "suggestions", "edit")} canDelete={userCan(data.user, "suggestions", "edit")} busy={busy} operate={operate} onOpenSettings={userCan(data.user, "suggestions", "manage") ? () => navigate("admin", "suggestions") : undefined} />}
          {active === "internalChat" && data.internalChatModule && (
            <InternalChatModule
              module={data.internalChatModule}
              canCreate={userCan(data.user, "internalChat", "create")}
              busy={busy}
              operate={executeOperation}
              markRead={markInternalChatRead}
              uploadAttachments={uploadInternalChatAttachments}
              onOpenProfile={(userId) => { setProfileEditable(false); setProfileEmployee(data.access?.employees.find(employee => employee.id === userId) ?? null); }}
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
              onSendToDevelopment={async (task) => {
                const developmentTask = {
                  kind: "developmentTask", sourceTaskId: task.id, sourceProtocol: task.protocol,
                  sourceDepartment: task.departmentName, triageStage: "Recebida", processStage: "Aguardando triagem",
                  sourceSnapshot: {
                    description: task.description, status: task.statusName, type: task.typeName, priority: task.priorityName,
                    responsible: task.assigneeName, attachments: task.attachments ?? [], comments: task.comments ?? [],
                  },
                  history: [{ text: `Tarefa ${task.protocol} enviada pela operação corporativa.`, at: new Date().toISOString(), by: data.user.displayName }],
                };
                const created = await operate({ action: "createWorkItem", module: "ti", recordType: "Tarefa de desenvolvimento", title: task.title, customerName: task.customerName, owner: task.creatorName || data.user.displayName, team: "Desenvolvimento", priority: "P3", amountCents: 0, description: JSON.stringify(developmentTask), originType: "task", originId: task.id }, "Tarefa enviada para a triagem de Desenvolvimento.");
                if (!created) return false;
                const completedStatus = data.taskModule?.statuses.find((status) => status.active && status.isFinal && (!status.departmentId || status.departmentId === task.currentDepartmentId));
                if (completedStatus) await operate({ action: "changeTaskStatus", taskId: task.id, statusId: completedStatus.id, justification: "Tarefa encaminhada para o time de Desenvolvimento.", version: task.version }, "Tarefa concluída e acompanhada pelo time de Desenvolvimento.");
                if (created.id) await operate({ action: "addTaskComment", taskId: task.id, body: `Tarefa encaminhada para o time de Desenvolvimento. [TI:${created.id}]` }, "Vínculo com a subtarefa de TI criado.");
                return created;
              }}
              uploadAttachments={uploadTaskAttachments}
              deleteAttachment={deleteTaskAttachment}
              onOpenSettings={() => navigateCatalog("types")}
            />
          )}
          {active === "ti" && <DevelopmentModule items={data.items} employees={(data.access?.employees ?? []).filter((employee) => employee.active)} user={data.user} canCreate={userCan(data.user, "ti", "create")} canEdit={userCan(data.user, "ti", "edit")} busy={busy} operate={operate} />}
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
              onExit={() => navigate("dashboard")}
            />
          )}
          {active === "access" && <SupportAccessView access={data.access} onOpen={(name) => { setToast({ kind: "success", message: `Acesso de ${name} selecionado.` }); window.setTimeout(() => setToast(null), 2600); }} />}
          {active === "catalogs" && data.taskModule && (
            <CatalogsModule module={data.taskModule} section={catalogSection} onSection={navigateCatalog} canManage={userCan(data.user, "catalogs", "manage")} busy={busy} operate={operate} />
          )}
          {active === "reporting" && <AnalyticsWorkspace data={data} section={reportingSection === "biExecutive" ? "bi" : reportingSection} sector={analyticsDepartment} />}
          {active === "admin" && <AdminView data={data} section={adminSection} onSection={setAdminSection} busy={busy} onOperate={operate} backgroundImage={backgroundImage} onBackgroundChange={changeBackgroundImage} />}
          </>}
        </div>
      </main>

      {selectedItem && (
        <ItemDrawer item={selectedItem} busy={busy} canEdit={userCan(data.user, selectedItem.module, "edit")} onClose={() => setSelectedItem(null)} onTransition={(nextStatus, confirmed) => operate({
          action: "transitionWorkItem", id: selectedItem.id, nextStatus, version: selectedItem.version, confirmed,
        }, `Status alterado para ${statusLabel(nextStatus)}.`)} />
      )}

      {attentionNotice && <NoticeAttentionModal notice={attentionNotice} busy={busy} onConfirm={() => void executeOperation(
        { action: "markNoticeRead", id: attentionNotice.id },
        attentionNotice.kind === "Evento" ? "Presença confirmada com sucesso." : "Leitura confirmada com sucesso.",
      )} />}

      {modal === "customer" && <CustomerModal catalogs={data.customerModule?.catalogs ?? []} busy={busy} onClose={() => setModal(null)} onSubmit={(payload) => operate({ action: "createCustomer", ...payload }, "Cliente criado no Customer 360.")} />}
      {modal === "workItem" && <WorkItemModal module={modalModule} customers={data.customers} busy={busy} onClose={() => setModal(null)} onSubmit={(payload) => operate({ action: "createWorkItem", module: modalModule, ...payload }, "Registro criado e auditado.")} />}
      {modal === "appointment" && <AppointmentModal customers={data.customers} busy={busy} onClose={() => setModal(null)} onSubmit={(payload) => operate({ action: "createAppointment", ...payload }, "Compromisso reservado sem conflito.")} />}

      {changingPassword && <PasswordChangeModal busy={busy} onClose={() => setChangingPassword(false)} onComplete={() => { setChangingPassword(false); setToast({ kind: "success", message: "Senha alterada com sucesso." }); }} />}
      {profileEmployee && <EmployeeProfileDrawer employee={profileEmployee} employees={data.access?.employees ?? []} items={data.items} currentUser={data.user} editable={profileEditable} taskCount={data.taskModule?.tasks.filter(task=>task.assigneeName===profileEmployee.displayName&&!task.completedAt&&!task.cancelled).length??0} busy={busy} operate={operate} onClose={() => { setProfileEmployee(null); setProfileEditable(false); }} />}
      {backgroundModalOpen && <BackgroundImageModal image={backgroundImage} agendaVisual={agendaVisual} onAgendaVisual={(visual)=>{setAgendaVisual(visual);window.localStorage.setItem("dontus.agenda-visual",visual);}} onClose={() => setBackgroundModalOpen(false)} onUpload={(file) => uploadBackgroundImage(file, () => setBackgroundModalOpen(false))} onRemove={() => { changeBackgroundImage(""); setBackgroundModalOpen(false); }} />}
      {confirmation && <ConfirmationModal action={confirmation.payload.action as string | undefined} successMessage={confirmation.success} busy={busy} onCancel={cancelOperation} onConfirm={() => void confirmOperation()} />}
      <GlobalImagePreview />
      {toast && <div className={`toast ${toast.kind}`} role="status">{toast.kind === "success" ? <CheckCircle2 size={18} /> : <Activity size={18} />}{toast.message}</div>}
    </div>
  );
}

function ClientHistoryPage({ query, data, onClose, onNavigate }: { query: string; data: AppData; onClose: () => void; onNavigate: (module: ModuleKey) => void }) {
  const [tab, setTab] = useState<"overview" | "records" | "tasks" | "support" | "suggestions" | "timeline">("overview");
  const key = query.trim().toLocaleLowerCase("pt-BR");
  const contains = (...values: unknown[]) => values.some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(key));
  const customer = data.customers.find((entry) => contains(entry.id, entry.trade_name, entry.legal_name, entry.document_masked));
  const belongs = (...values: unknown[]) => contains(...values) || Boolean(customer && values.some((value) => {
    const normalized = String(value ?? "").toLocaleLowerCase("pt-BR");
    return normalized === customer.id.toLocaleLowerCase("pt-BR") || normalized === customer.trade_name.toLocaleLowerCase("pt-BR") || normalized === customer.legal_name.toLocaleLowerCase("pt-BR");
  }));
  const workItems = data.items.filter((entry) => belongs(entry.customer_id, entry.customer_name, entry.title, entry.description));
  const tasks = data.taskModule?.tasks.filter((entry) => belongs(entry.customerId, entry.customerCode, entry.customerName, entry.title, entry.protocol, entry.description)) ?? [];
  const commitments = data.agendaModule?.commitments.filter((entry) => belongs(entry.title, entry.description)) ?? [];
  const legacyAppointments = data.appointments.filter((entry) => belongs(entry.customer_name, entry.title));
  const suggestions = data.suggestionModule?.suggestions.filter((entry) => belongs(entry.customerId, entry.customerName, entry.name, entry.description, entry.protocol)) ?? [];
  const attendances = workItems.filter((entry) => entry.module === "support").map((entry) => {
    try { const detail = JSON.parse(entry.description) as { problem?: string; tool?: string; status?: string; solution?: string; responsible?: string; date?: string }; return { item: entry, theme: detail.problem || detail.tool || entry.record_type, status: detail.status || entry.status, solution: detail.solution || "", responsible: detail.responsible || entry.owner, at: detail.date || entry.updated_at }; }
    catch { return { item: entry, theme: entry.record_type, status: entry.status, solution: "", responsible: entry.owner, at: entry.updated_at }; }
  });
  const protocols = [...new Set([...tasks.map((entry) => entry.protocol), ...(customer?.open_task_protocols ?? [])].filter(Boolean))];
  const openTasks = tasks.filter((entry) => !entry.completedAt && !entry.cancelled);
  const completedTasks = tasks.filter((entry) => Boolean(entry.completedAt) || entry.cancelled);
  const solvedAttendances = attendances.filter((entry) => /conclu|resolvid|finaliz|encerrad/i.test(entry.status));
  const tracking = workItems.filter((entry) => ["cs", "lia"].includes(entry.module));
  const networks = data.items.filter((entry) => entry.module === "cs" && /enterpriseNetwork/.test(entry.description)).filter((entry) => {
    try { const parsed = JSON.parse(entry.description) as { units?: Array<Record<string, unknown>> }; return belongs(entry.title, ...((parsed.units ?? []).flatMap((unit) => [unit.id, unit.externalId, unit.name]))); } catch { return false; }
  });
  const statusCounts = [...workItems.map((entry) => entry.status), ...tasks.map((entry) => entry.statusName), ...suggestions.map((entry) => entry.statusName)].reduce<Record<string, number>>((acc, status) => { const label = status || "Sem status"; acc[label] = (acc[label] ?? 0) + 1; return acc; }, {});
  const moduleCounts = [...workItems.map((entry) => MODULES[entry.module as ModuleKey]?.short ?? entry.module), ...tasks.map(() => "Tarefas"), ...suggestions.map(() => "Sugestões")].reduce<Record<string, number>>((acc, label) => { acc[label] = (acc[label] ?? 0) + 1; return acc; }, {});
  const themeCounts = attendances.reduce<Record<string, number>>((acc, entry) => { acc[entry.theme] = (acc[entry.theme] ?? 0) + 1; return acc; }, {});
  const maxStatus = Math.max(1, ...Object.values(statusCounts));
  const maxModule = Math.max(1, ...Object.values(moduleCounts));
  const maxTheme = Math.max(1, ...Object.values(themeCounts));
  const timeline = [
    ...workItems.map((entry) => ({ id: entry.id, title: entry.title, meta: `${MODULES[entry.module as ModuleKey]?.label ?? entry.module} · ${entry.status}`, at: entry.updated_at, module: entry.module as ModuleKey })),
    ...tasks.map((entry) => ({ id: entry.id, title: `${entry.protocol} · ${entry.title}`, meta: `Tarefa · ${entry.statusName}`, at: entry.updatedAt, module: "tasks" as ModuleKey })),
    ...commitments.map((entry) => ({ id: entry.id, title: entry.title, meta: `Agenda · ${entry.statusName}`, at: entry.startsAt, module: "work" as ModuleKey })),
    ...legacyAppointments.map((entry) => ({ id: entry.id, title: entry.title, meta: `Agenda · ${entry.kind} · ${entry.status}`, at: entry.starts_at, module: "work" as ModuleKey })),
    ...suggestions.map((entry) => ({ id: entry.id, title: `${entry.protocol} · ${entry.name}`, meta: `Sugestão · ${entry.statusName}`, at: entry.updatedAt, module: "suggestions" as ModuleKey })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const displayName = customer?.trade_name || tasks[0]?.customerName || workItems[0]?.customer_name || `Cliente ID ${query}`;
  const tabs = [{ id: "overview", label: "Visão geral", count: timeline.length }, { id: "records", label: "Todos os registros", count: workItems.length }, { id: "tasks", label: "Tarefas", count: tasks.length }, { id: "support", label: "Atendimentos", count: attendances.length }, { id: "suggestions", label: "Sugestões", count: suggestions.length }, { id: "timeline", label: "Linha do tempo", count: timeline.length }] as const;
  return <section className="client-history-page">
    <header className="client-history-page-head"><button type="button" onClick={onClose} aria-label="Voltar"><ArrowLeft /></button><span className="operation-bi-mark"><Search /></span><span><small>VISÃO 360 · ID {query}</small><h1>{displayName}</h1><p>{customer ? `${customer.legal_name} · ${customer.document_masked || customer.id}` : `Informações consolidadas encontradas em todo o sistema para o ID ${query}.`}</p></span><b className={customer ? "located" : "partial"}>{customer ? "Cadastro localizado" : "Vínculos localizados"}</b></header>
    <nav className="client-history-tabs">{tabs.map((entry) => <button className={tab === entry.id ? "active" : ""} onClick={() => setTab(entry.id)} key={entry.id}>{entry.label}<b>{entry.count}</b></button>)}</nav>
    <section className="operation-bi-kpis client-history-kpis"><article><ListTodo /><span><small>Tarefas ativas</small><strong>{openTasks.length}</strong><em>{protocols.length} protocolo(s)</em></span></article><article><CheckCircle2 /><span><small>Tarefas finalizadas</small><strong>{completedTasks.length}</strong><em>concluídas ou canceladas</em></span></article><article><Headphones /><span><small>Atendimentos</small><strong>{attendances.length}</strong><em>{solvedAttendances.length} solucionado(s)</em></span></article><article><Sparkles /><span><small>Sugestões</small><strong>{suggestions.length}</strong><em>vinculadas ao ID</em></span></article><article><ChartNoAxesCombined /><span><small>Acompanhamentos</small><strong>{tracking.length}</strong><em>Ativação, retenção e LIA</em></span></article><article><CalendarDays /><span><small>Compromissos</small><strong>{commitments.length + legacyAppointments.length}</strong><em>registros na agenda</em></span></article><article><UsersRound /><span><small>Redes vinculadas</small><strong>{networks.length}</strong><em>contas estratégicas</em></span></article><article><BadgeCheck /><span><small>Status do cadastro</small><strong>{customer?.status || "Não localizado"}</strong><em>{customer?.strategic ? "Cliente estratégico" : "Cadastro convencional"}</em></span></article></section>
    {tab === "overview" && <><div className="operation-bi-grid client-history-grid"><section className="operation-bi-panel"><header><span><BarChart3Icon />Passagens por funcionalidade</span><b>{Object.values(moduleCounts).reduce((sum, value) => sum + value, 0)} registros</b></header><div className="operation-status-bars">{Object.entries(moduleCounts).length ? Object.entries(moduleCounts).map(([label, count]) => <div key={label}><span>{label}</span><i><b style={{ width: `${count / maxModule * 100}%` }} /></i><strong>{count}</strong></div>) : <p>Não há passagens operacionais para este ID.</p>}</div></section><section className="operation-bi-panel"><header><span><Activity />Distribuição por status</span><b>{Object.keys(statusCounts).length} status</b></header><div className="operation-status-bars">{Object.entries(statusCounts).length ? Object.entries(statusCounts).map(([label, count]) => <div key={label}><span>{label}</span><i><b style={{ width: `${count / maxStatus * 100}%` }} /></i><strong>{count}</strong></div>) : <p>Não há status registrados.</p>}</div></section></div><section className="client-history-registration"><h2>Cadastro e vínculos</h2><dl><div><dt>ID pesquisado</dt><dd>{query}</dd></div><div><dt>Responsável comercial</dt><dd>{customer?.owner || "Não informado"}</dd></div><div><dt>CS responsável</dt><dd>{customer?.cs_owner || "Não informado"}</dd></div><div><dt>Suporte responsável</dt><dd>{customer?.support_owner || "Não informado"}</dd></div><div><dt>Produto / versão</dt><dd>{[customer?.project, customer?.product_version].filter(Boolean).join(" · ") || "Não informado"}</dd></div><div><dt>Rede</dt><dd>{networks.map((entry) => entry.title).join(", ") || "Sem vínculo com rede"}</dd></div><div><dt>Protocolos</dt><dd>{protocols.join(", ") || "Nenhum protocolo"}</dd></div><div><dt>Contato</dt><dd>{customer?.phone || customer?.email || "Não informado"}</dd></div></dl></section></>}
    {tab === "records" && <ClientRecordsPanel title="Registros encontrados em todas as funcionalidades" empty="Nenhum registro operacional vinculado a este ID.">{workItems.map((entry) => <button key={entry.id} onClick={() => onNavigate(entry.module as ModuleKey)}><span><strong>{entry.title}</strong><small>{MODULES[entry.module as ModuleKey]?.label ?? entry.module} · {entry.record_type} · Responsável: {entry.owner || "Não informado"}</small></span><b className={`status-pill ${statusTone(entry.status)}`}>{statusLabel(entry.status)}</b><time>{dateTime(entry.updated_at)}</time><ChevronRight /></button>)}</ClientRecordsPanel>}
    {tab === "tasks" && <ClientRecordsPanel title="Tarefas vinculadas" empty="Nenhuma tarefa vinculada a este ID.">{tasks.map((entry) => <button key={entry.id} onClick={() => onNavigate("tasks")}><span><strong>{entry.title}</strong><small>{entry.protocol} · {entry.typeName} · {entry.departmentName}</small></span><b className={`status-pill ${statusTone(entry.statusName)}`}>{entry.statusName}</b><time>{dateTime(entry.updatedAt)}</time><ChevronRight /></button>)}</ClientRecordsPanel>}
    {tab === "support" && <div className="client-history-record-grid"><ClientRecordsPanel title="Atendimentos realizados" empty="Nenhum atendimento vinculado a este ID.">{attendances.map((entry) => <button key={entry.item.id} onClick={() => onNavigate("support")}><span><strong>{entry.theme}</strong><small>{entry.responsible}{entry.solution ? ` · ${entry.solution}` : ""}</small></span><b className={`status-pill ${statusTone(entry.status)}`}>{entry.status}</b><time>{dateTime(entry.at)}</time><ChevronRight /></button>)}</ClientRecordsPanel><section className="operation-bi-panel client-theme-panel"><header><span><Headphones />Temas dos atendimentos</span><b>{Object.keys(themeCounts).length} tema(s)</b></header><div className="operation-status-bars">{Object.entries(themeCounts).map(([label, count]) => <div key={label}><span>{label}</span><i><b style={{ width: `${count / maxTheme * 100}%` }} /></i><strong>{count}</strong></div>)}</div></section></div>}
    {tab === "suggestions" && <ClientRecordsPanel title="Sugestões vinculadas" empty="Nenhuma sugestão vinculada a este ID.">{suggestions.map((entry) => <button key={entry.id} onClick={() => onNavigate("suggestions")}><span><strong>{entry.name}</strong><small>{entry.protocol} · Responsável: {entry.responsibleName}</small></span><b className={`status-pill ${statusTone(entry.statusName)}`}>{entry.statusName}</b><time>{dateTime(entry.updatedAt)}</time><ChevronRight /></button>)}</ClientRecordsPanel>}
    {tab === "timeline" && <ClientRecordsPanel title="Linha do tempo consolidada" empty="Nenhuma movimentação localizada para este ID.">{timeline.map((entry) => <button key={`${entry.module}-${entry.id}`} onClick={() => onNavigate(entry.module)}><span><strong>{entry.title}</strong><small>{entry.meta}</small></span><time>{dateTime(entry.at)}</time><ChevronRight /></button>)}</ClientRecordsPanel>}
  </section>;
}

function ClientRecordsPanel({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section className="client-records-panel"><header><h2>{title}</h2></header><div>{hasChildren ? children : <p className="client-records-empty">{empty}</p>}</div></section>;
}

function BarChart3Icon() { return <ChartNoAxesCombined />; }

function ProfileAvatar({ name, photo, large = false, coordinator = false }: { name: string; photo?: string; large?: boolean; coordinator?: boolean }) {
  return <span className={`avatar ${large ? "large" : ""} ${photo ? "has-photo" : ""}`} style={photo ? { backgroundImage: `url("${photo}")` } : undefined}>{!photo && name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}{coordinator && <i className="coordinator-mark" title="Coordenador"><BadgeCheck size={13} /></i>}</span>;
}

function GlobalImagePreview() {
  const [preview,setPreview]=useState<{src:string;alt:string}|null>(null);
  useEffect(()=>{
    const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setPreview(null)};
    const open=(event:MouseEvent)=>{
      const target=event.target instanceof Element?event.target:null;
      if(!target||target.closest(".global-image-preview"))return;
      if(target.closest(".employee-cover-upload,.employee-profile-close"))return;
      const candidate=target.closest<HTMLElement>('img,a[href^="data:image/"],[data-preview-image],.has-photo,.hr-avatar[style*="background-image"],[data-collaborator-name] i[style*="background-image"]');
      if(!candidate)return;
      let src="";
      let alt=candidate.getAttribute("aria-label")||candidate.getAttribute("title")||"Imagem anexada";
      if(candidate instanceof HTMLImageElement){
        src=candidate.currentSrc||candidate.src;
        alt=candidate.alt||alt;
        if(/dontus-(?:logo|mark)/i.test(src))return;
      }else if(candidate instanceof HTMLAnchorElement){
        src=candidate.href;
      }else{
        src=candidate.dataset.previewImage||"";
        if(!src){
          const match=getComputedStyle(candidate).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
          src=match?.[1]||"";
        }
      }
      if(!src||!(/^(?:data:image\/|blob:|https?:\/\/)/i.test(src)||/\/api\/.*files/i.test(src)))return;
      event.preventDefault();
      event.stopPropagation();
      setPreview({src,alt});
    };
    document.addEventListener("click",open,true);
    window.addEventListener("keydown",close);
    return()=>{document.removeEventListener("click",open,true);window.removeEventListener("keydown",close)};
  },[]);
  if(!preview)return null;
  return <div className="global-image-preview" role="dialog" aria-modal="true" aria-label={preview.alt} onMouseDown={event=>event.currentTarget===event.target&&setPreview(null)}><button type="button" onClick={()=>setPreview(null)} aria-label="Fechar imagem"><X size={21}/></button><figure><img src={preview.src} alt={preview.alt}/><figcaption>{preview.alt}</figcaption></figure></div>;
}

function LoadingScreen() {
  return <div className="loading-screen"><Image src="/dontus-mark.png" alt="" width={95} height={95} priority unoptimized /><div className="loading-line"><span /></div><p>Preparando a central de operações…</p></div>;
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-screen"><Image src="/dontus-logo.png" alt="Dontus" width={240} height={68} priority unoptimized /><h1>Não foi possível abrir a operação</h1><p>{message}</p><button onClick={onRetry}>Tentar novamente</button></div>;
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState("gestor@dontus.local");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? "Não foi possível entrar.");
      onAuthenticated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar.");
    } finally { setBusy(false); }
  };
  return <div className="login-screen"><div className="login-card">
    <Image src="/dontus-logo.png" alt="Dontus Gestão Odontológica" width={280} height={80} priority unoptimized />
    <div className="login-heading"><h1>Acesse a gestão Dontus</h1><p>Entre com seu e-mail e senha para continuar.</p></div>
    <form onSubmit={submit}>
      <label>E-mail<div className="login-input"><Mail size={19} aria-hidden="true" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></div></label>
      <label>Senha<div className="login-input"><LockKeyhole size={19} aria-hidden="true" /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /><button className="login-password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} title={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></label>
      {error && <p className="login-error">{error}</p>}
      <button className="primary-button" disabled={busy} type="submit">{busy ? "Entrando..." : "Entrar"}</button>
    </form>
    <button className="login-forgot-password" type="button" onClick={() => setRecoveryOpen(true)}>Esqueci minha senha</button>
    <div className="login-security"><ShieldCheck size={17} /><span>Acesso seguro e criptografado</span></div>
  </div>{recoveryOpen && <PasswordRecoveryModal initialEmail={email} onClose={() => setRecoveryOpen(false)} />}</div>;
}

function PasswordRecoveryModal({ initialEmail, onClose }: { initialEmail: string; onClose: () => void }) {
  const email = initialEmail.trim();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const maskedEmail = maskEmail(email);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail ?? "Não foi possível solicitar uma nova senha.");
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível solicitar uma nova senha.");
    } finally { setBusy(false); }
  };
  return <ModalShell title="Recuperar acesso" subtitle="Confirme o endereço cadastrado para receber uma nova senha temporária." onClose={onClose}>
    {sent ? <div className="password-recovery-success"><CheckCircle2 size={28} /><strong>Nova senha enviada</strong><p>A senha temporária foi direcionada para <b>{maskedEmail}</b>. Use-a no próximo acesso e depois altere-a no menu da sua conta.</p><div className="form-actions"><button className="primary-button" type="button" onClick={onClose}>Voltar ao login</button></div></div> : <form className="form-grid" onSubmit={submit}><div className="password-recovery-address wide"><Mail/><span><small>E-mail cadastrado</small><strong>{maskedEmail||"E-mail não informado"}</strong><p>Por segurança, apenas o início e o fim do endereço são exibidos.</p></span></div>{!email&&<p className="form-error wide">Informe seu e-mail na tela de acesso antes de solicitar uma nova senha.</p>}{error && <p className="form-error wide">{error}</p>}<div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy||!email} type="submit">{busy ? "Enviando..." : "Enviar nova senha"}</button></div></form>}
  </ModalShell>;
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email ? `${email.slice(0, 2)}***${email.slice(-1)}` : "";
  const localStart = local.slice(0, Math.min(2, local.length));
  const localEnd = local.length > 2 ? local.slice(-1) : "";
  const domainParts = domain.split(".");
  const host = domainParts.shift() ?? "";
  const suffix = domainParts.length ? `.${domainParts.join(".")}` : "";
  return `${localStart}***${localEnd}@${host.slice(0, 1)}***${host.slice(-1)}${suffix}`;
}

function PasswordChangeModal({ busy, onClose, onComplete }: { busy: boolean; onClose: () => void; onComplete: () => void }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword !== String(form.get("confirmation") ?? "")) return setError("A confirmação não corresponde à nova senha.");
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail ?? "Não foi possível alterar a senha.");
      onComplete();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível alterar a senha."); }
    finally { setSaving(false); }
  };
  return <ModalShell title="Alterar senha" subtitle="Use pelo menos 10 caracteres." onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="wide">Senha atual<input name="currentPassword" type="password" required autoComplete="current-password" /></label><label>Nova senha<input name="newPassword" type="password" minLength={10} required autoComplete="new-password" /></label><label>Confirmar nova senha<input name="confirmation" type="password" minLength={10} required autoComplete="new-password" /></label>{error && <p className="form-error wide">{error}</p>}<div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || saving} type="submit">{saving ? "Alterando..." : "Salvar senha"}</button></div></form></ModalShell>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  const HeaderIcon = /ANALYTICS|DADOS|RELATÓRIO/i.test(`${eyebrow} ${title}`) ? ChartNoAxesCombined
    : /CLIENTE|COLABORADOR|PESSOA|CS/i.test(`${eyebrow} ${title}`) ? UsersRound
      : /COMERCIAL|VENDA|CONTA/i.test(`${eyebrow} ${title}`) ? BriefcaseBusiness
        : /APROVA|CONFERÊNCIA|AUDITORIA/i.test(`${eyebrow} ${title}`) ? ClipboardCheck
          : /ADMIN|CONFIG|CADASTRO|ACESSO/i.test(`${eyebrow} ${title}`) ? Settings
            : Activity;
  return <header className="page-header module-page-header">
    <div className="module-page-title">
      <span className="module-page-title-icon"><HeaderIcon size={21} /></span>
      <span className="module-page-copy"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></span>
    </div>
    {action && <div className="module-page-actions">{action}</div>}
  </header>;
}

function OperationIndicatorsLauncher({ pageKey, onOpen }: { pageKey: string; onOpen: () => void }) {
  const [target, setTarget] = useState<Element | null>(null);
  useEffect(() => {
    const content = document.querySelector(".content");
    const findTarget = () => {
      const next = document.querySelector(".content .module-page-header .module-page-actions") ?? document.querySelector(".content .module-page-header");
      setTarget((current) => current === next ? current : next);
    };
    findTarget();
    if (!content) return;
    const observer = new MutationObserver(findTarget);
    observer.observe(content, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pageKey]);
  return target ? createPortal(<button type="button" className="operation-indicators-button" onClick={onOpen}><ChartNoAxesCombined size={17} /><span>Indicadores</span></button>, target) : null;
}

function Dashboard({ data, onNavigate, onPortal }: { data: AppData; onNavigate: (module: ModuleKey) => void; onPortal: () => void }) {
  const [showNotices, setShowNotices] = useState(false);
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const now = new Date();
  const userName = data.user.displayName;
  const firstName = userName.split(" ")[0];
  const today = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(now);
  const localDay = (value: string) => {
    const date = new Date(value);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  };
  const todayKey = localDay(now.toISOString());
  const agendaToday = (data.agendaModule?.commitments ?? [])
    .filter((item) => localDay(item.startsAt) === todayKey && (!item.responsibleName || item.responsibleName === userName))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const nextCommitment = agendaToday.find((item) => new Date(item.endsAt).getTime() >= now.getTime());
  const agendaUser = data.agendaModule?.collaborators.find((entry) => entry.email.toLowerCase() === data.user.email.toLowerCase());
  const upcomingCommitments = (data.agendaModule?.commitments ?? [])
    .filter((item) => new Date(item.endsAt).getTime() >= now.getTime() && (item.responsibleName === userName || Boolean(agendaUser && item.participantUserIds.includes(agendaUser.id))))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 3);
  const openTasks = (data.taskModule?.tasks ?? []).filter((task) => !task.completedAt && !task.cancelled && (!task.assigneeName || task.assigneeName === userName));
  const pendingTasks = [...openTasks].sort((a, b) => {
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aDue - bDue || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  }).slice(0, 3);
  const tasksToday = openTasks.filter((task) => Boolean(task.dueAt) && localDay(task.dueAt!) === todayKey).length;
  const unreadRooms = data.internalChatModule?.rooms.filter((room) => !room.isArchived && room.unreadCount > 0) ?? [];
  const internalUnread = unreadRooms.reduce((total, room) => total + room.unreadCount, 0);
  const waiting = data.chatModule?.metrics.waiting ?? 0;
  const recentNotices = (data.noticesModule?.notices ?? [])
    .filter((notice) => notice.active && notice.visibleToCurrentUser)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 3);
  const unreadNotices = (data.noticesModule?.notices ?? []).filter((notice) => notice.active && notice.visibleToCurrentUser && !notice.isRead).length;
  const time = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
  const noticeDate = (value: string) => {
    const date = new Date(value);
    const prefix = localDay(value) === todayKey ? "Hoje" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
    return `${prefix}, ${time(value)}`;
  };
  const commitmentDate = (value: string) => {
    const date = new Date(value);
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const prefix = localDay(value) === todayKey
      ? "Hoje"
      : localDay(value) === localDay(tomorrow.toISOString())
        ? "Amanhã"
        : new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).format(date).replace(".", "");
    return `${prefix}, ${time(value)}`;
  };
  const noticeBody = (value: string) => value.replace(/\s*\[TASK_LINK:[^\]]+\]/g, "").trim();
  const taskDue = (value?: string | null) => {
    if (!value) return "Sem prazo definido";
    const date = new Date(value);
    const day = localDay(value) === todayKey ? "Hoje" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
    return `${day}, ${time(value)}`;
  };
  const openCommitment = (id: string) => {
    onNavigate("work");
    const url = new URL(window.location.href);
    url.searchParams.set("mod", "work");
    url.searchParams.set("commitment", id);
    window.history.replaceState({}, "", url);
  };

  const openTask = (id: string) => {
    onNavigate("tasks");
    const url = new URL(window.location.href);
    url.searchParams.set("mod", "tasks");
    url.searchParams.set("task", id);
    window.history.replaceState({}, "", url);
  };
  const copyPublicLink = async () => {
    const url = new URL(window.location.origin);
    url.searchParams.set("public", "overview");
    await navigator.clipboard.writeText(url.toString());
    setPublicLinkCopied(true);
    window.setTimeout(() => setPublicLinkCopied(false), 2600);
  };
  const quickLinks = [
    { key: "agenda", title: "Agenda", icon: CalendarDays, value: `${agendaToday.length} compromisso${agendaToday.length === 1 ? "" : "s"} hoje`, hint: nextCommitment ? `Próximo às ${time(nextCommitment.startsAt)}` : "Agenda do dia organizada", action: () => onNavigate("work"), tone: "blue" },
    { key: "tasks", title: "Tarefas", icon: ListTodo, value: `${openTasks.length} pendente${openTasks.length === 1 ? "" : "s"}`, hint: tasksToday ? `${tasksToday} para hoje` : "Confira suas prioridades", action: () => onNavigate("tasks"), tone: "violet" },
    { key: "chat", title: "Chat interno", icon: MessageCircleMore, value: `${internalUnread} ${internalUnread === 1 ? "mensagem não lida" : "mensagens não lidas"}`, hint: `${unreadRooms.length} conversa${unreadRooms.length === 1 ? "" : "s"} com novidade`, action: () => onNavigate("internalChat"), tone: "cyan" },
    { key: "queue", title: "Fila de espera", icon: UsersRound, value: `${waiting} aguardando`, hint: "Atendimentos em espera", action: () => onNavigate("waitingQueue"), tone: "amber" },
    { key: "notices", title: "Avisos", icon: Bell, value: `${unreadNotices} novo${unreadNotices === 1 ? "" : "s"}`, hint: "Clique para visualizar", action: () => setShowNotices((current) => !current), tone: "green", expanded: showNotices },
  ];

  return <section className="dashboard-home">
    <section className="dashboard-hero dashboard-welcome dashboard-command-hero">
      <div className="dashboard-welcome-content"><span>{today}</span><h1>Olá, {firstName} <b>👋</b></h1><p>Central de operação Dontus.</p></div>
      <div className="dashboard-welcome-side"><div className="dashboard-welcome-department"><span>Setor vinculado</span><strong>{data.user.department || "Dontus"}</strong></div><div className="dashboard-welcome-actions"><button className="dashboard-public-link-button" onClick={() => void copyPublicLink()}>{publicLinkCopied ? <Check size={17} /> : <Copy size={17} />}<span>{publicLinkCopied ? "Link copiado" : "Copiar painel público"}</span></button><button className="dashboard-portal-button" onClick={onPortal}><span>Portal Dontus</span><ExternalLink size={17} /></button></div></div>
    </section>

    <div className="dashboard-section-title"><span><Sparkles size={18} /></span><div><h2>Acesso rápido</h2><p>Suas principais ferramentas em um só lugar.</p></div></div>
    <section className="dashboard-quick-grid" aria-label="Acesso rápido">
      {quickLinks.map((entry) => { const Icon = entry.icon; return <button key={entry.key} className={`dashboard-quick-card ${entry.tone} ${entry.expanded ? "expanded" : ""}`} onClick={entry.action} aria-expanded={entry.key === "notices" ? entry.expanded : undefined}><span className="dashboard-quick-icon"><Icon size={23} /></span><span className="dashboard-quick-copy"><strong>{entry.title}</strong><b>{entry.value}</b><small>{entry.hint}</small></span><ChevronRight size={19} className="dashboard-quick-chevron"/><span className="dashboard-quick-action">Acessar <ChevronRight size={15}/></span></button>; })}
    </section>

    <section className="dashboard-fixed-panels" aria-label="Pendências da pessoa vinculada">
      <article className="dashboard-focus-panel dashboard-upcoming-commitments">
        <header><div><span className="dashboard-notices-icon"><CalendarDays size={18}/></span><div><h2>Próximos compromissos</h2><p>Agenda vinculada a {firstName}.</p></div></div><button onClick={() => onNavigate("work")} aria-label="Acessar agenda"><ChevronRight size={19}/></button></header>
        <div className="dashboard-focus-list">{upcomingCommitments.length === 0 ? <div className="dashboard-notice-empty"><CalendarDays size={22}/><span><strong>Nenhum compromisso agendado</strong><small>Seus próximos eventos aparecerão aqui.</small></span></div> : upcomingCommitments.map((commitment) => <button key={commitment.id} onClick={() => openCommitment(commitment.id)}><span className="dashboard-focus-marker blue"><CalendarDays size={15}/></span><span><strong>{commitment.title}</strong><small>{commitmentDate(commitment.startsAt)} · até {time(commitment.endsAt)}</small></span><span className="dashboard-commitment-status">{commitment.statusName || "Agendado"}</span><ChevronRight size={17}/></button>)}</div>
        <footer><button onClick={() => onNavigate("work")}>Acessar agenda completa <ChevronRight size={16}/></button></footer>
      </article>
      <article className="dashboard-focus-panel dashboard-pending-tasks">
        <header><div><span className="dashboard-notices-icon task"><ListTodo size={18}/></span><div><h2>Tarefas pendentes</h2><p>Prioridades que aguardam sua análise.</p></div></div><button onClick={() => onNavigate("tasks")} aria-label="Acessar tarefas"><ChevronRight size={19}/></button></header>
        <div className="dashboard-focus-list">{pendingTasks.length === 0 ? <div className="dashboard-notice-empty"><CheckCircle2 size={22}/><span><strong>Nenhuma tarefa pendente</strong><small>Suas próximas demandas aparecerão aqui.</small></span></div> : pendingTasks.map((task) => <button key={task.id} onClick={() => openTask(task.id)}><span className="dashboard-focus-marker violet"><ListTodo size={15}/></span><span><strong>{task.title}</strong><small>{task.protocol} · {task.departmentName || "Setor não informado"}</small></span><span className={`dashboard-task-due ${task.slaState?.toLowerCase().includes("atras") ? "late" : ""}`}><Clock3 size={13}/>{taskDue(task.dueAt)}</span><ChevronRight size={17}/></button>)}</div>
        <footer><button onClick={() => onNavigate("tasks")}>Acessar todas as tarefas <ChevronRight size={16}/></button></footer>
      </article>
    </section>

    {showNotices && <section className="dashboard-recent-notices dashboard-notices-expanded">
      <header><div><span className="dashboard-notices-icon"><Bell size={18}/>{unreadNotices > 0 && <i>{unreadNotices}</i>}</span><div><h2>Avisos recentes</h2><p>Os três últimos comunicados direcionados para você.</p></div></div><button onClick={() => setShowNotices(false)} aria-label="Fechar avisos"><ChevronDown size={19}/></button></header>
      <div className="dashboard-notice-list">{recentNotices.length === 0 ? <div className="dashboard-notice-empty"><Bell size={22}/><span><strong>Nenhum aviso disponível</strong><small>Os novos comunicados aparecerão aqui.</small></span></div> : recentNotices.map((notice) => <button key={notice.id} onClick={() => onNavigate("notices")}><i className={`notice-dot ${notice.type.toLowerCase()}`}/><span><strong>{notice.title}</strong><small>{notice.authorName || "Equipe Dontus"}</small></span><time><Clock3 size={15}/>{noticeDate(notice.publishedAt)}</time><p>{noticeBody(notice.body)}</p><ChevronRight size={17}/></button>)}</div>
      <footer><button onClick={() => onNavigate("notices")}>Acessar tela de avisos <ChevronRight size={16}/></button></footer>
    </section>}
  </section>;
}

function PortalDontusPlaceholder({ data, onBack }: { data: AppData; onBack: () => void }) {
  const [selectedSector, setSelectedSector] = useState("");
  const [selectedShortcut, setSelectedShortcut] = useState("");
  const fallbackDepartments: EmployeeDepartment[] = [
    { id: "commercial", name: "Comercial", description: "Vendas, negociações e relacionamento com novos clientes.", active: true },
    { id: "management", name: "Diretoria", description: "Coordenação estratégica e decisões da operação.", active: true },
    { id: "financial", name: "Financeiro", description: "Demandas financeiras, cobranças e contratos.", active: true },
    { id: "cs", name: "Sucesso do Cliente", description: "Ativação, retenção e evolução dos clientes.", active: true },
    { id: "support", name: "Suporte", description: "Atendimento e resolução de solicitações técnicas.", active: true },
  ];
  const departmentSources = [
    ...(data.access?.departments ?? []),
    ...(data.taskModule?.departments ?? []).map((department) => ({ id: department.id, name: department.name, description: department.description, active: department.active })),
  ].filter((department) => department.active);
  const departments = [...new Map((departmentSources.length ? departmentSources : fallbackDepartments).map((department) => [department.name.trim().toLocaleLowerCase("pt-BR"), department])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const sectorMeta = (name: string) => {
    if (/comercial|venda/i.test(name)) return { icon: BriefcaseBusiness, tone: "blue", description: "Vendas, negociações e relacionamento com novos clientes." };
    if (/diret|gestão|administr/i.test(name)) return { icon: ShieldCheck, tone: "indigo", description: "Coordenação estratégica e decisões da operação." };
    if (/financ|fatur/i.test(name)) return { icon: CircleDollarSign, tone: "emerald", description: "Demandas financeiras, cobranças e contratos." };
    if (/sucesso|cliente|cs/i.test(name)) return { icon: UsersRound, tone: "cyan", description: "Ativação, retenção e evolução dos clientes." };
    if (/suporte|atendimento/i.test(name)) return { icon: Headphones, tone: "amber", description: "Atendimento e resolução de solicitações técnicas." };
    if (/marketing/i.test(name)) return { icon: ImageIcon, tone: "violet", description: "Campanhas, conteúdos, criativos e comunicação." };
    if (/tecnologia|desenvolvimento|\bti\b/i.test(name)) return { icon: MonitorUp, tone: "blue", description: "Tecnologia, desenvolvimento e evolução do sistema." };
    if (/rh|pessoas|humano/i.test(name)) return { icon: UserPlus, tone: "rose", description: "Colaboradores, cultura e desenvolvimento de pessoas." };
    return { icon: Users, tone: "slate", description: "Informações, comunicados e rotinas deste setor." };
  };
  const shortcuts = [
    { id: "referral", label: "Indicação", description: "Registrar uma nova indicação", icon: UserPlus, tone: "violet" },
    { id: "meeting-room", label: "Agenda | Sala de reunião", description: "Consultar horários e reservas", icon: CalendarDays, tone: "emerald" },
    { id: "versions", label: "Versões & Funcionalidades", description: "Novidades e recursos do sistema", icon: MonitorUp, tone: "slate" },
    { id: "events", label: "Eventos Dontus", description: "Agenda de encontros e eventos", icon: Sparkles, tone: "blue" },
  ];

  return <section className="portal-dontus-page">
    <header className="portal-dontus-topbar"><button className="portal-brand" type="button" onClick={() => setSelectedSector("")} aria-label="Página inicial do Portal Dontus"><Image src="/dontus-mark.png" alt="" width={34} height={34} unoptimized /><span>Portal Dontus</span></button><button className="portal-back-button" onClick={onBack}><ArrowLeft size={17}/> Retornar ao sistema</button></header>
    <main className="portal-dontus-content">
      <section className="portal-dontus-hero"><span className="portal-kicker">PORTAL DE COMUNICAÇÃO</span><h1>Conectando pessoas,<br/><strong>transformando a gestão.</strong></h1><p>Um espaço único para comunicação, eventos e informações de cada setor da Dontus Gestão Odontológica.</p></section>
      <section className="portal-sectors" aria-labelledby="portal-sectors-title">
        <header><span><BriefcaseBusiness size={18}/></span><h2 id="portal-sectors-title">Setores</h2><i/></header>
        <div className="portal-sector-grid">{departments.map((department) => { const meta = sectorMeta(department.name); const Icon = meta.icon; const selected = selectedSector === department.id; return <button key={department.id} className={`portal-sector-card ${meta.tone} ${selected ? "selected" : ""}`} onClick={() => { setSelectedSector(department.id); setSelectedShortcut(""); }} aria-pressed={selected}><span className="portal-sector-icon"><Icon size={19}/></span><span><strong>{department.name}</strong><small>{department.description || meta.description}</small></span><ChevronRight size={17}/></button>; })}</div>
        <div className="portal-action-grid" aria-label="Atalhos do Portal Dontus">{shortcuts.map((shortcut) => { const Icon = shortcut.icon; const selected = selectedShortcut === shortcut.id; return <button key={shortcut.id} className={`portal-action-button ${shortcut.tone} ${selected ? "selected" : ""}`} onClick={() => { setSelectedShortcut(shortcut.id); setSelectedSector(""); }} aria-pressed={selected}><span><Icon size={18}/></span><span><strong>{shortcut.label}</strong><small>{shortcut.description}</small></span><ChevronRight size={18}/></button>; })}</div>
        {(selectedSector || selectedShortcut) && <div className="portal-sector-selection" aria-live="polite"><CheckCircle2 size={16}/><span><strong>{selectedSector ? departments.find((department) => department.id === selectedSector)?.name : shortcuts.find((shortcut) => shortcut.id === selectedShortcut)?.label}</strong> selecionado. O conteúdo será configurado na próxima etapa.</span></div>}
      </section>
    </main>
    <footer className="portal-dontus-footer">Dontus · Gestão Odontológica <span/> Portal Dontus</footer>
  </section>;
}

function AnalyticsWorkspace({ data, section, sector }: { data: AppData; section: ReportingSection; sector: string }) {
  const allItems = data.items;
  const scoped = sector === "Todos" ? allItems : allItems.filter((item) => item.team === sector);
  const activeTasks = data.taskModule?.tasks.filter((task) => !task.completedAt && (sector === "Todos" || task.departmentName === sector)) ?? [];
  const closedDeals = scoped.filter((item) => item.module === "commercial" && /ganho|fechado|conclu/i.test(item.status));
  const commercialItems = scoped.filter((item) => item.module === "commercial");
  const revenue = closedDeals.reduce((total, item) => total + item.amount_cents, 0);
  const leaders = useMemo(() => Object.values(commercialItems.reduce<Record<string, { name: string; value: number; count: number }>>((result, item) => {
    const name = item.owner || "Sem responsável";
    result[name] ??= { name, value: 0, count: 0 };
    result[name].value += item.amount_cents;
    result[name].count += 1;
    return result;
  }, {})).sort((a, b) => b.value - a.value || b.count - a.count), [commercialItems]);
  const maxLeader = Math.max(1, ...leaders.map((leader) => leader.value));
  const activity = [...data.audit].slice(0, 8);
  const copyLink = async () => { await navigator.clipboard?.writeText(window.location.href); };
  const isBi = section === "bi" || section === "biExecutive";
  return <section className={`analytics-workspace ${isBi ? "analytics-tv" : ""}`}>
    <PageHeader eyebrow="ANALYTICS" title={section === "performance" ? "Desempenho" : section === "indicators" ? "Indicadores" : "BI Analítica"} description="Acompanhamento atualizado a partir dos registros operacionais do sistema." action={section === "bi" ? <button className="secondary-button" onClick={() => void copyLink()}><FileCheck2 size={16} /> Copiar link do BI</button> : undefined} />
    <div className="analytics-live-status"><span><i /> Dados em tempo real</span><small>Atualização automática a cada 6 segundos</small></div>
    {(section === "performance" || section === "bi") && <>
      <div className="analytics-kpis"><article><span>Tarefas abertas</span><strong>{activeTasks.length}</strong><small>Demandas em andamento</small></article><article><span>Clientes fechados</span><strong>{closedDeals.length}</strong><small>Conversões registradas</small></article><article><span>Valor fechado</span><strong>{formatMoney(revenue)}</strong><small>Receita em vendas concluídas</small></article><article><span>Fluxos ativos</span><strong>{scoped.filter((item) => !/conclu|perdid|cancel/i.test(item.status)).length}</strong><small>Cards em operação</small></article></div>
      <section className="analytics-panel"><header><div><span className="eyebrow">PRODUÇÃO POR RESPONSÁVEL</span><h2>Resultados comerciais</h2></div><small>Valor fechado e quantidade de oportunidades</small></header><div className="analytics-bars">{leaders.length === 0 ? <EmptyState compact text="Nenhuma oportunidade para os filtros selecionados." /> : leaders.slice(0, 8).map((leader) => <div key={leader.name}><span>{leader.name}</span><b style={{ width: `${Math.max(8, Math.round(leader.value / maxLeader * 100))}%` }} /><strong>{formatMoney(leader.value)}</strong><small>{leader.count} card(s)</small></div>)}</div></section>
    </>}
    {section === "indicators" && <div className="indicator-grid"><article><span className="eyebrow">COMERCIAL</span><h2>Taxa de conversão</h2><strong>{commercialItems.length ? `${Math.round(closedDeals.length / commercialItems.length * 100)}%` : "0%"}</strong><p>Vendas concluídas sobre oportunidades cadastradas.</p></article><article><span className="eyebrow">OPERAÇÃO</span><h2>Tempo de resposta</h2><strong>{activeTasks.length ? "Em acompanhamento" : "Em dia"}</strong><p>{activeTasks.length} tarefa(s) aberta(s) no setor selecionado.</p></article><article><span className="eyebrow">ATENDIMENTO</span><h2>Atividades registradas</h2><strong>{data.audit.length}</strong><p>Alterações, comentários e movimentações auditadas.</p></article><article><span className="eyebrow">CS</span><h2>Carteira acompanhada</h2><strong>{scoped.filter((item) => item.module === "cs").length}</strong><p>Clientes em onboarding, evolução ou acompanhamento.</p></article></div>}
    {section === "bi" && <div className="bi-layout"><section className="analytics-panel bi-ranking"><header><div><span className="eyebrow">RANKING AO VIVO</span><h2>Quem mais vendeu</h2></div><b>{leaders.length} participante(s)</b></header>{leaders.length === 0 ? <EmptyState compact text="Ainda não há vendas fechadas." /> : leaders.slice(0, 6).map((leader, index) => { const employee = data.access?.employees.find((item) => item.displayName === leader.name); return <div className="bi-person" key={leader.name}><em>#{index + 1}</em><ProfileAvatar name={leader.name} photo={employee?.photoDataUrl} coordinator={employee?.isCoordinator} /><span><strong>{leader.name}</strong><small>{leader.count} oportunidade(s)</small></span><b>{formatMoney(leader.value)}</b></div>; })}</section><section className="analytics-panel bi-live"><header><div><span className="eyebrow">PAINEL DA EMPRESA</span><h2>Acompanhamento em tempo real</h2></div><span className="live-dot">Ao vivo</span></header><div className="bi-metrics"><div><strong>{allItems.length}</strong><span>Cards criados</span></div><div><strong>{activeTasks.length}</strong><span>Tarefas ativas</span></div><div><strong>{data.access?.employees.filter((employee) => employee.active).length ?? 0}</strong><span>Colaboradores ativos</span></div></div><div className="bi-feed">{activity.length === 0 ? <EmptyState compact text="A atividade aparecerá aqui em tempo real." /> : activity.map((event) => <div key={event.id}><i /><span><strong>{event.action} · {event.resource}</strong><small>{event.actor_email} · {dateTime(event.created_at)}</small></span></div>)}</div></section></div>}
  </section>;
}

function SupportAccessView({ access, onOpen }: { access: AccessManagement | null; onOpen: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const entries = (access?.employees ?? []).filter((employee) => {
    const term = submittedQuery.trim().toLocaleLowerCase("pt-BR");
    return !term || `${employee.displayName} ${employee.email} ${employee.departmentName} ${employee.jobTitle}`.toLocaleLowerCase("pt-BR").includes(term);
  });
  return <section className="support-access-page">
    <PageHeader eyebrow="CENTRAL DE SUPORTE" title="Acesso de Suporte" description="Localize um colaborador e consulte os dados disponíveis para acesso assistido." />
    <div className="support-access-panel">
      <div className="support-access-title">Acesso de Suporte</div>
      <div className="support-access-search"><label>Identificação<input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setSubmittedQuery(query); }} placeholder="Nome, usuário ou e-mail" autoFocus /></label><button className="primary-button" type="button" onClick={() => setSubmittedQuery(query)}><Search size={16} /> Pesquisar</button></div>
      <div className="support-access-table" role="table" aria-label="Resultados de acesso">
        <div className="support-access-row head" role="row"><span>Nome</span><span>Usuário</span><span>E-mail</span><span>Tipo</span><span>Status</span><span>Abrir</span></div>
        {entries.length === 0 ? <div className="support-access-empty">Nenhum acesso encontrado para a identificação informada.</div> : entries.map((employee) => <div className="support-access-row" role="row" key={employee.id}><span><b>{employee.displayName}</b><small>{employee.jobTitle || "Colaborador"}</small></span><span>{employee.email.split("@")[0]}</span><span>{employee.email}</span><span>{employee.isCoordinator ? "Coordenador" : "Colaborador"}</span><span><b className={`status-pill ${employee.active ? "positive" : "negative"}`}>{employee.active ? "Ativo" : "Bloqueado"}</b></span><span><button type="button" onClick={() => onOpen(employee.displayName)} disabled={!employee.active}>Abrir</button></span></div>)}
      </div>
    </div>
  </section>;
}

function CustomersView({ customers, catalogs, items, selected, onSelect, onCreate, canCreate }: { customers: Customer[]; catalogs: CustomerCatalogOption[]; items: WorkItem[]; selected: Customer | null; onSelect: (customer: Customer | null) => void; onCreate: () => void; canCreate: boolean }) {
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const [project, setProject] = useState("");
  const [graceDays, setGraceDays] = useState("");
  const filtered = customers.filter((customer) => `${customer.trade_name} ${customer.legal_name} ${customer.document_masked}`.toLowerCase().includes(filter.toLowerCase()) && (!status || customer.status === status) && (!project || customer.project === project) && (!graceDays || customer.grace_days === graceDays));
  return <>
    <PageHeader eyebrow="MÓDULO · CLIENTES" title="Clientes" description="Controle a base de clientes, contratos e informações de assinatura." action={canCreate ? <button className="primary-button" onClick={onCreate}><Plus size={17} /> Cadastrar cliente</button> : undefined} />
    <div className="customer-filter-panel"><div className="field-search"><Search size={17} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Identificação, razão social ou CNPJ" /></div><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option>{catalogs.filter((item) => item.catalog === "status" && item.active).map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label>Projeto<select value={project} onChange={(event) => setProject(event.target.value)}><option value="">Todos</option>{catalogs.filter((item) => item.catalog === "project" && item.active).map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label>Dias de tolerância<select value={graceDays} onChange={(event) => setGraceDays(event.target.value)}><option value="">Todos</option>{catalogs.filter((item) => item.catalog === "graceDays" && item.active).map((item) => <option key={item.id}>{item.name}</option>)}</select></label><div className="toolbar-summary"><strong>{filtered.length}</strong> clientes</div></div>
    <div className="table-card">
      <div className="data-table customers-table">
        <div className="table-row table-head"><span>ID · Cliente</span><span>Projeto</span><span>Versão</span><span>Contato</span><span>Assinatura</span><span>Status</span></div>
        {filtered.length === 0 ? <EmptyState text="Nenhum cliente encontrado." /> : filtered.map((customer) => (
          <button className="table-row" key={customer.id} onClick={() => onSelect(customer)}>
            <span className="customer-cell"><i>{customer.trade_name.slice(0, 2).toUpperCase()}</i><span><strong>{customer.trade_name}</strong><small>{customer.legal_name}</small></span>{Boolean(customer.strategic) && <em><BadgeCheck size={14} /> Estratégico</em>}</span>
            <span>{customer.project || "—"}</span><span>{customer.product_version || "—"}</span><span><strong>{customer.phone || "—"}</strong><small>{customer.email || customer.owner}</small></span><span>{customer.subscription || "—"}</span><span><b className={`status-pill ${statusTone(customer.status)}`}>{customer.status || "Não definido"}</b><ChevronRight size={16} /></span>
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
    <div className="detail-section"><h3>Assinatura e pagamento</h3><dl><div><dt>Status</dt><dd>{customer.status || "Não definido"}</dd></div><div><dt>Projeto</dt><dd>{customer.project || "—"}</dd></div><div><dt>Versão</dt><dd>{customer.product_version || "—"}</dd></div><div><dt>Produto</dt><dd>{customer.subscription || "—"}</dd></div><div><dt>Vencimento</dt><dd>{customer.due_day || "—"}</dd></div><div><dt>Pagamento</dt><dd>{customer.payment_method || "—"}</dd></div></dl></div>
    <div className="detail-section"><h3>Contato</h3><dl><div><dt>Telefone</dt><dd>{customer.phone || "—"}</dd></div><div><dt>E-mail</dt><dd>{customer.email || "—"}</dd></div><div><dt>Endereço</dt><dd>{[customer.address, customer.city, customer.state].filter(Boolean).join(" · ") || "—"}</dd></div></dl></div>
    <div className="detail-section"><h3>Responsáveis</h3><dl><div><dt>Comercial</dt><dd>{customer.owner}</dd></div><div><dt>Customer Success</dt><dd>{customer.cs_owner}</dd></div><div><dt>Suporte</dt><dd>{customer.support_owner}</dd></div></dl></div>
    <div className="detail-section customer-observations"><h3>Observações do cliente</h3>{customer.open_task_protocols?.length ? <><p>Este cliente possui protocolos de tarefa em aberto:</p><div>{customer.open_task_protocols.map((protocol) => <button key={protocol} onClick={() => { window.location.href = `/?mod=tasks&task=${encodeURIComponent(protocol)}`; }}><ListTodo size={14} /> {protocol}<ChevronRight size={14} /></button>)}</div></> : <p>Nenhum protocolo de tarefa em aberto.</p>}</div>
    <div className="detail-section"><h3>Jornada consolidada</h3><div className="timeline">{items.length === 0 ? <EmptyState compact text="Sem processos vinculados." /> : items.map((item) => <div key={item.id}><span className={`timeline-dot ${item.module}`} /><div><strong>{item.title}</strong><small>{MODULES[item.module as ModuleKey]?.label} · {statusLabel(item.status)}</small></div><time>{shortDate(item.updated_at)}</time></div>)}</div></div>
  </aside></div>;
}

function ModuleView({ module, items, appointments, view, onView, onCreate, onOpen, onMove, canCreate, canEdit }: { module: ModuleKey; items: WorkItem[]; customers: Customer[]; appointments: Appointment[]; view: "board" | "list"; onView: (view: "board" | "list") => void; onCreate: () => void; onOpen: (item: WorkItem) => void; onMove: (item: WorkItem, status: string) => Promise<OperationResult>; canCreate: boolean; canEdit: boolean }) {
  const [query, setQuery] = useState("");
  const filtered = items.filter((item) => `${item.title} ${item.customer_name} ${item.owner}`.toLowerCase().includes(query.toLowerCase()));
  const statuses = STATE_MACHINES[module] ?? [];
  const visibleStatuses = statuses.slice(0, 6);
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
          return <section className="kanban-column" key={status} onDragOver={(event) => { if (canEdit) { event.preventDefault(); event.currentTarget.classList.add("drag-over"); } }} onDragLeave={(event) => event.currentTarget.classList.remove("drag-over")} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove("drag-over"); const item = items.find((entry) => entry.id === event.dataTransfer.getData("application/x-dontus-work-item")); if (item && item.status !== status) void onMove(item, status); }}><header><span className={`status-dot ${statusTone(status)}`} /><strong>{statusLabel(status)}</strong><b>{statusItems.length}</b></header><div>{statusItems.length === 0 ? <p className="column-empty">Solte um card aqui</p> : statusItems.map((item) => <WorkCard key={item.id} item={item} onOpen={onOpen} draggable={canEdit} />)}</div></section>;
        })}
        {items.length === 0 && <div className="board-empty"><Stethoscope size={26} /><strong>O fluxo está pronto</strong><p>{canCreate ? "Crie o primeiro registro para iniciar a jornada deste módulo." : "Nenhum registro disponível para seu acesso."}</p>{canCreate && <button onClick={onCreate}><Plus size={16} /> Criar registro</button>}</div>}
      </div>
    ) : <WorkList items={filtered} onOpen={onOpen} />}
  </>;
}

function WorkCard({ item, onOpen, draggable = false }: { item: WorkItem; onOpen: (item: WorkItem) => void; draggable?: boolean }) {
  return <article className="work-card" role="button" tabIndex={0} draggable={draggable} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-dontus-work-item", item.id); }} onClick={() => onOpen(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(item); }}><div className="work-card-top"><span className={`priority-badge ${item.priority.toLowerCase()}`}>{item.priority}</span><small>{item.record_type}</small><ChevronRight size={15} /></div><strong>{item.title}</strong><p>{item.customer_name || "Sem cliente vinculado"}</p><div className="work-card-foot"><span><UserRound size={13} /> {item.owner}</span><span><Clock3 size={13} /> {shortDate(item.due_at)}</span></div></article>;
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

const COMMERCIAL_CATALOGS = [
  ["commercialProduct", "Produtos"], ["acquisitionChannel", "Canais de aquisição"], ["commercialLabel", "Etiquetas"], ["followUpType", "Tipos de follow"], ["lossReason", "Motivos de perda"], ["temperature", "Temperaturas"], ["funnelStage", "Funis e etapas"],
  ["retentionStatus", "Status da retenção"], ["retentionFlag", "Marcações da retenção"], ["retentionCommentType", "Comentários da retenção"], ["retentionVersion", "Versões da retenção"],
] as const;
const CS_CATALOGS = [
  ["csWorkflowStatus", "Status da jornada"], ["csUsage", "Status de Uso"], ["csCallStatus", "Status de Ligação"], ["csFinalStatus", "Status Final"],
  ["csFeatureActive", "Features Ativas"], ["csFeatureBase", "Features Base"], ["csFeaturePlus", "Feature Plus"],
  ["csRejectionReason", "Motivos de Reprova"], ["csApprovalReason", "Motivos de Aprovação"],
  ["csLabel", "Etiquetas"], ["csFollowUp", "Tipos de follow"],
] as const;

const ENTERPRISE_CATALOGS = [
  ["enterpriseNetworkStatus", "Status Rede"], ["enterpriseUnitStatus", "Status Unidade"],
  ["enterpriseUsageStatus", "Status de utilização"],
  ["enterpriseFeatureActive", "Features Ativas"], ["enterpriseFeatureBase", "Features Base"], ["enterpriseFeaturePlus", "Features Plus"],
] as const;

const RECRUITMENT_CATALOGS = [
  ["recruitmentVacancy", "Vagas"], ["recruitmentStage", "Etapas Kanban"],
] as const;
const SERVICE_CATALOGS = [
  ["serviceOrigin", "Origens"], ["serviceVersion", "Versões"], ["serviceProblem", "Problemas / situações"],
  ["serviceStatus", "Status"], ["serviceContactType", "Tipos de contato"], ["serviceTool", "Ferramentas / módulos"],
] as const;
const LIA_CATALOGS = [
  ["liaRequestType", "Tipos de solicitação"], ["liaOrigin", "Origens"], ["liaWorkflowStage", "Etapas adicionais"],
  ["liaChecklistItem", "Itens do checklist"], ["liaAdjustmentType", "Tipos de ajuste"],
] as const;
const WAITING_QUEUE_CATALOGS = [
  ["waitingQueueRequestType", "Tipos de solicitação"],
] as const;
const CANCELLATION_CATALOGS = [
  ["cancellationStayRange", "Faixas de permanência"], ["cancellationPlan", "Planos"],
  ["cancellationReason", "Motivos de cancelamento"], ["cancellationCommunicationType", "Tipos de comunicação"],
] as const;
const HR_CATALOGS = [
  ["hrCommunicationType", "Tipos de comunicação"], ["hrDocumentType", "Tipos de documento"],
  ["hrTerminationReason", "Motivos de desligamento"],
] as const;
type CommercialCatalogScope = "commercial" | "cs" | "lia" | "service" | "waitingQueue" | "enterprise" | "cancellation" | "hr" | "recruitment";
function CommercialCatalogsView({ catalogs, busy, onOperate, scope = "commercial" }: { catalogs: CustomerCatalogOption[]; busy: boolean; onOperate: (payload: Record<string, unknown>, success: string) => Promise<OperationResult>; scope?: CommercialCatalogScope }) {
  const catalogOptions = scope === "cs" ? CS_CATALOGS : scope === "lia" ? LIA_CATALOGS : scope === "service" ? SERVICE_CATALOGS : scope === "waitingQueue" ? WAITING_QUEUE_CATALOGS : scope === "enterprise" ? ENTERPRISE_CATALOGS : scope === "cancellation" ? CANCELLATION_CATALOGS : scope === "hr" ? HR_CATALOGS : scope === "recruitment" ? RECRUITMENT_CATALOGS : COMMERCIAL_CATALOGS;
  const [catalog, setCatalog] = useState<string>(catalogOptions[0][0]);
  const [editing, setEditing] = useState<CustomerCatalogOption | null | undefined>(undefined);
  const [showInactive, setShowInactive] = useState(false);
  const current = catalogs.filter((item) => item.catalog === catalog && (showInactive || item.active));
  const label = catalogOptions.find((item) => item[0] === catalog)?.[1] ?? "Cadastro";
  const area = scope === "cs" ? "CS" : scope === "lia" ? "LIA" : scope === "service" ? "ATENDIMENTOS" : scope === "waitingQueue" ? "FILA DE ESPERA" : scope === "enterprise" ? "REDES E FRANQUIAS" : scope === "cancellation" ? "CANCELAMENTOS" : scope === "hr" ? "GESTÃO RH" : scope === "recruitment" ? "PROCESSO SELETIVO" : "COMERCIAL";
  return <><PageHeader eyebrow={`CADASTROS · ${area}`} title={scope === "cs" ? "Configurações de CS" : scope === "lia" ? "Configurações da LIA" : scope === "service" ? "Configurações de Atendimentos" : scope === "waitingQueue" ? "Configurações da Fila de Espera" : scope === "enterprise" ? "Configurações de Redes e Franquias" : scope === "cancellation" ? "Configurações de Cancelamentos" : scope === "hr" ? "Configurações da Gestão RH" : scope === "recruitment" ? "Processo seletivo" : "Cadastros comerciais"} description={`Configure as opções que serão utilizadas nos fluxos de ${area}. Apenas registros ativos aparecem para seleção.`} />
    <div className="customer-catalog-tabs">{catalogOptions.map(([key, name]) => <button key={key} className={catalog === key ? "active" : ""} onClick={() => setCatalog(key)}>{name}</button>)}</div>
    <section className="agenda-catalog-card"><div className="agenda-catalog-head"><div><span className="eyebrow">{area}</span><h2>{label}</h2><p>Cadastre e mantenha as opções disponíveis para este campo.</p></div><div className="catalog-head-actions"><label className="checkbox-label"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Exibir inativos</label><button className="primary-button" onClick={() => setEditing(null)}><Plus size={16} /> Novo cadastro</button></div></div>
      <div className="agenda-catalog-list">{current.length === 0 ? <EmptyState compact text="Nenhuma opção cadastrada." /> : current.map((item) => <CommercialCatalogRow key={item.id} item={item} onEdit={() => setEditing(item)} onDelete={() => void onOperate({ action: "deleteCustomerCatalog", id: item.id }, "Cadastro excluído com sucesso.")} />)}</div>
    </section>
    {editing !== undefined && <CommercialCatalogModal scope={scope} catalog={catalog} label={label} item={editing} busy={busy} onClose={() => setEditing(undefined)} onSave={async (payload) => { const result = await onOperate({ action: "saveCustomerCatalog", id: editing?.id, catalog, ...payload }, editing ? "Cadastro atualizado com sucesso." : "Cadastro criado com sucesso."); if (result) setEditing(undefined); }} />}
  </>;
}

type CommercialDetails = { color?: string; plans?: { name: string; value: string; active: boolean }[]; functionality?: string; stages?: { name: string; color: string; won: boolean; lost: boolean; automation: boolean; alertDays?: number }[]; description?: string };
const commercialColors = ["#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f97316", "#f59e0b", "#eab308", "#22c55e", "#14b8a6", "#06b6d4"];
const defaultRetentionStages: NonNullable<CommercialDetails["stages"]> = [
  { name: "Em espera", color: "#3b82f6", won: false, lost: false, automation: false },
  { name: "Em processo", color: "#d69a32", won: false, lost: false, automation: false },
  { name: "Concluído com sucesso", color: "#22c55e", won: true, lost: false, automation: false },
  { name: "Sem sucesso", color: "#ef4444", won: false, lost: true, automation: false },
];
const commercialDetails = (value: string): CommercialDetails => {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return { description: value };
    if (Array.isArray(parsed.s)) return {
      functionality: parsed.f === "c" ? "CRM Comercial" : parsed.f === "r" ? "CRM Retenção" : commercialFlowLabel("qualification"),
      stages: parsed.s.map((stage: unknown[]) => ({ name: String(stage[0] ?? ""), color: String(stage[1] ?? commercialColors[0]), won: Boolean(stage[2]), lost: Boolean(stage[3]), automation: Boolean(stage[4]), alertDays: Number(stage[5]) || 1 })),
    };
    return parsed;
  } catch { return { description: value }; }
};

const fileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result ?? ""));
  reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
  reader.readAsDataURL(file);
});

function CommercialCatalogRow({ item, onEdit, onDelete }: { item: CustomerCatalogOption; onEdit: () => void; onDelete: () => void }) {
  const details = commercialDetails(item.description);
  const detail = details.plans ? `${details.plans.length} plano(s) configurado(s)` : details.functionality ? `${details.functionality} · ${details.stages?.length ?? 0} etapa(s)` : details.color ? "Cor personalizada" : details.description || "Sem descrição";
  return <article><span className="agenda-list-icon" style={details.color ? { background: details.color } : undefined}><Database size={18} /></span><span className="agenda-list-data"><strong>{item.name}</strong><small>{detail}</small></span><b className={`status-pill ${item.active ? "positive" : "negative"}`}>{item.active ? "Ativo" : "Inativo"}</b><button className="catalog-icon-button" onClick={onEdit} aria-label="Editar"><Pencil size={15} /></button><button className="catalog-icon-button delete" onClick={onDelete} aria-label="Excluir"><Trash2 size={15} /></button></article>;
}

function CommercialCatalogModal({ scope, catalog, label, item, busy, onClose, onSave }: { scope: CommercialCatalogScope; catalog: string; label: string; item: CustomerCatalogOption | null; busy: boolean; onClose: () => void; onSave: (payload: { name: string; catalogDescription: string; active: boolean }) => void }) {
  const details = commercialDetails(item?.description ?? "");
  const [color, setColor] = useState(details.color ?? commercialColors[0]);
  const [plans, setPlans] = useState(details.plans?.length ? details.plans : [{ name: "", value: "", active: true }]);
  const [functionality, setFunctionality] = useState(details.functionality ?? (catalog === "csFunnel" ? "Onboarding" : "Qualificação"));
  const [stages, setStages] = useState(details.stages?.length ? details.stages : [{ name: "Nova etapa", color: commercialColors[0], won: false, lost: false, automation: false, alertDays: 1 }]);
  const isProduct = catalog === "commercialProduct";
  const usesColor = ["commercialLabel", "temperature", "retentionStatus", "csLabel", "csTemperature", "csUsage", "csStatus", "csCallStatus", "csFinalStatus", "csFeatureActive", "csFeatureBase", "csFeaturePlus", "csRejectionReason", "csApprovalReason", "enterpriseNetworkStatus", "enterpriseUnitStatus", "enterpriseFeatureActive", "enterpriseFeatureBase", "enterpriseFeaturePlus"].includes(catalog);
  const isFunnel = catalog === "funnelStage" || catalog === "csFunnel";
  const isCommercialFunnel = catalog === "funnelStage";
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get("name") ?? "").trim();
    const funnelStages = stages.filter((stage) => stage.name.trim());
    const catalogDescription = JSON.stringify(isProduct ? { plans: plans.filter((plan) => plan.name.trim()) } : usesColor ? { color } : isFunnel ? isCommercialFunnel ? { f: functionality === "CRM Comercial" ? "c" : functionality === "CRM Retenção" ? "r" : "q", s: funnelStages.map((stage) => [stage.name.trim(), stage.color, stage.won ? 1 : 0, stage.lost ? 1 : 0, stage.automation ? 1 : 0, stage.alertDays ?? 1]) } : { functionality, stages: funnelStages } : { description: String(form.get("description") ?? "").trim() });
    onSave({ name, catalogDescription, active: form.get("active") === "on" });
  };
  return <ModalShell title={item ? `Editar ${label.toLowerCase()}` : `Novo cadastro · ${label}`} subtitle={isFunnel ? "Defina a funcionalidade e as etapas do funil." : `Configure as opções que estarão disponíveis em ${scope === "recruitment" ? "Processo seletivo" : scope === "cs" ? "CS" : scope === "lia" ? "LIA" : scope === "service" ? "Atendimentos" : scope === "enterprise" ? "Redes e Franquias" : scope === "cancellation" ? "Cancelamentos" : scope === "hr" ? "Gestão RH" : "Comercial"}.`} onClose={onClose}><form className="form-grid commercial-catalog-form" onSubmit={submit}>
    <label className="wide">Nome *<input name="name" required defaultValue={item?.name} placeholder={isFunnel ? "Nome do funil" : `Nome de ${label.toLowerCase()}`} /></label>
    <label className="checkbox-label wide"><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /> Ativo</label>
    {isProduct && <div className="commercial-dynamic-section wide"><div><h3>Planos</h3><small>Cada plano pode ter um valor sugerido.</small></div>{plans.map((plan, index) => <div className="commercial-plan-row" key={index}><input value={plan.name} onChange={(event) => setPlans((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, name: event.target.value } : current))} placeholder="Nome do plano" /><input type="number" min="0" step="0.01" value={plan.value} onChange={(event) => setPlans((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, value: event.target.value } : current))} placeholder="Valor (R$)" /><label title="Plano ativo"><input type="checkbox" checked={plan.active} onChange={(event) => setPlans((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, active: event.target.checked } : current))} /> Ativo</label><button type="button" aria-label="Remover plano" onClick={() => setPlans((items) => items.filter((_, currentIndex) => currentIndex !== index))}><Trash2 size={15} /></button></div>)}<button className="commercial-add-row" type="button" onClick={() => setPlans((items) => [...items, { name: "", value: "", active: true }])}><Plus size={15} /> Adicionar plano</button></div>}
    {usesColor && <div className="commercial-color-picker wide"><span>Cor *</span><div>{commercialColors.map((tone) => <button type="button" key={tone} className={color === tone ? "selected" : ""} style={{ backgroundColor: tone }} onClick={() => setColor(tone)} aria-label={`Selecionar cor ${tone}`} />)}</div></div>}
    {isFunnel && <><label className="wide">Funcionalidade *<select value={functionality} onChange={(event) => setFunctionality(event.target.value)}>{isCommercialFunnel ? <><option>Qualificação</option><option>CRM Comercial</option><option>CRM Retenção</option></> : <><option>Onboarding</option><option>Evolução</option><option>Clientes grandes</option></>}</select></label><div className="commercial-dynamic-section wide"><div><h3>Etapas do funil</h3><small>Defina a ordem, a cor e o comportamento de cada etapa.</small></div>{stages.map((stage, index) => <div className="commercial-stage-wrap" key={index}><div className="commercial-stage-row"><input value={stage.name} onChange={(event) => setStages((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, name: event.target.value } : current))} placeholder="Nome da etapa" /><input type="color" value={stage.color} onChange={(event) => setStages((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, color: event.target.value } : current))} /><label><input type="checkbox" checked={stage.won} onChange={(event) => setStages((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, won: event.target.checked, lost: event.target.checked ? false : current.lost } : current))} /> Ganho</label><label><input type="checkbox" checked={stage.lost} onChange={(event) => setStages((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, lost: event.target.checked, won: event.target.checked ? false : current.won } : current))} /> Perda</label><label><input type="checkbox" checked={stage.automation} onChange={(event) => setStages((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, automation: event.target.checked } : current))} /> Automação</label><button type="button" aria-label="Remover etapa" onClick={() => setStages((items) => items.filter((_, currentIndex) => currentIndex !== index))}><Trash2 size={15} /></button></div>{stage.automation && <label className="commercial-automation-rule">Criar alerta após <input type="number" min="1" value={stage.alertDays ?? 1} onChange={(event) => setStages((items) => items.map((current, currentIndex) => currentIndex === index ? { ...current, alertDays: Number(event.target.value) || 1 } : current))} /> dia(s) sem interação.</label>}</div>)}<button className="commercial-add-row" type="button" onClick={() => setStages((items) => [...items, { name: "Nova etapa", color: commercialColors[0], won: false, lost: false, automation: false, alertDays: 1 }])}><Plus size={15} /> Adicionar etapa</button></div></>}
    {!isProduct && !usesColor && !isFunnel && <label className="wide">Descrição<textarea name="description" rows={4} defaultValue={details.description} placeholder="Informações complementares, se necessário." /></label>}
    <div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} type="submit"><Save size={16} /> {busy ? "Salvando..." : "Salvar"}</button></div>
  </form></ModalShell>;
}

type CommercialLead = {
  kind: "commercialLead";
  phone: string;
  source: string;
  seller: string;
  funnel: string;
  stage: string;
  temperature: string;
  labels: string[];
  products: Array<{ product: string; plan: string; value: number; quantity: number }>;
  score: number;
  entryDate: string;
  customer: string;
  clientId?: string;
  version?: string;
  retentionStatus?: string;
  retentionMarks?: string[];
  follows: Array<{ type: string; text: string; createdAt: string; author?: string; temperature?: string }>;
  comments: Array<{ type?: string; text: string; createdAt: string; author?: string; temperature?: string }>;
  qualification?: "qualified" | "disqualified";
  onboarding?: { status: "sent" | "scheduled"; date?: string; time?: string; commitmentId?: string; sentAt: string; clientId?: string; version?: string; commerciallyApproved?: boolean };
};

type FollowUpTrack = "activation" | "retention" | "lia";
const followUpTrackLabel = (track: FollowUpTrack) => track === "lia" ? "LIA" : track === "retention" ? "retenção" : "ativação";

type DirectSale = {
  kind: "directSale";
  flow: "crm" | "retention";
  followUpTrack: FollowUpTrack;
  saleId: string;
  saleDate: string;
  name: string;
  origin: string;
  version: string;
  seller: string;
  products: Array<{ product: string; plan: string; unitValue: number; quantity: number }>;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
};

const directSaleRecordType = (flow: CommercialFlow) => flow === "retention" ? "Venda direta de retenção" : "Venda direta comercial";
const parseDirectSale = (value: string): DirectSale | null => {
  try {
    const parsed = JSON.parse(value) as Partial<DirectSale>;
    if (parsed.kind !== "directSale" || (parsed.flow !== "crm" && parsed.flow !== "retention")) return null;
    return {
      kind: "directSale", flow: parsed.flow, followUpTrack: parsed.followUpTrack === "lia" ? "lia" : parsed.followUpTrack === "retention" ? "retention" : parsed.flow === "retention" ? "retention" : "activation", saleId: parsed.saleId ?? "", saleDate: parsed.saleDate ?? "",
      name: parsed.name ?? "", origin: parsed.origin ?? "", version: parsed.version ?? "", seller: parsed.seller ?? "",
      products: Array.isArray(parsed.products) ? parsed.products : [], subtotalCents: Number(parsed.subtotalCents ?? 0),
      discountCents: Number(parsed.discountCents ?? 0), totalCents: Number(parsed.totalCents ?? 0),
    };
  } catch { return null; }
};

const commercialFlowLabel = (flow: CommercialFlow) => flow === "qualification" ? "Qualificação" : flow === "retention" ? "CRM Retenção" : "CRM Comercial";
const commercialRecordType = (flow: CommercialFlow) => flow === "qualification" ? "Lead de qualificação" : flow === "retention" ? "Lead de retenção" : "Lead comercial";
const commercialFlowFromRecordType = (recordType: string): CommercialFlow => recordType === commercialRecordType("qualification") ? "qualification" : recordType === commercialRecordType("retention") ? "retention" : "crm";
const parseCommercialLead = (value: string): CommercialLead | null => {
  try {
    const parsed = JSON.parse(value) as Partial<CommercialLead>;
    if (parsed.kind !== "commercialLead") return null;
    return {
      kind: "commercialLead", phone: parsed.phone ?? "", source: parsed.source ?? "", seller: parsed.seller ?? "",
      funnel: parsed.funnel ?? "", stage: parsed.stage ?? "", temperature: parsed.temperature ?? "",
      labels: Array.isArray(parsed.labels) ? parsed.labels : [], products: Array.isArray(parsed.products) ? parsed.products : [],
      score: Number(parsed.score ?? 0), entryDate: parsed.entryDate ?? "", customer: parsed.customer ?? "",
      clientId: parsed.clientId ?? "", version: parsed.version ?? "", retentionStatus: parsed.retentionStatus ?? "", retentionMarks: Array.isArray(parsed.retentionMarks) ? parsed.retentionMarks : [],
      follows: Array.isArray(parsed.follows) ? parsed.follows : [],
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      qualification: parsed.qualification === "qualified" || parsed.qualification === "disqualified" ? parsed.qualification : undefined,
      onboarding: parsed.onboarding && (parsed.onboarding.status === "sent" || parsed.onboarding.status === "scheduled") ? parsed.onboarding : undefined,
    };
  } catch { return null; }
};

const commercialLabelColor = (label: string) => {
  const palette = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#ca8a04", "#059669", "#0891b2"];
  let hash = 0;
  for (let index = 0; index < label.length; index += 1) hash = ((hash << 5) - hash) + label.charCodeAt(index);
  return palette[Math.abs(hash) % palette.length];
};

function CommercialLeadsModule({ flow, catalogs, items, employees, agendaModule, currentUser, busy, canCreate, canEdit, canDelete, operate, onOpenSettings }: { flow: CommercialFlow; catalogs: CustomerCatalogOption[]; items: WorkItem[]; employees: Employee[]; agendaModule: AgendaModuleData | null; currentUser: AppData["user"]; busy: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; operate: (payload: Record<string, unknown>, success: string) => Promise<OperationResult>; onOpenSettings?: () => void }) {
  const [view, setView] = useState<"list" | "kanban">(flow === "retention" ? "kanban" : "list");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("all");
  const [temperature, setTemperature] = useState("all");
  const [selectedFunnel, setSelectedFunnel] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [editRequested, setEditRequested] = useState(false);
  const [lossReasonRequested, setLossReasonRequested] = useState(false);
  const [draggedLead, setDraggedLead] = useState<WorkItem | null>(null);
  const [stageLimits, setStageLimits] = useState<Record<string, number>>({});
  const [directSalesOpen, setDirectSalesOpen] = useState(false);
  const [retentionSettingsOpen, setRetentionSettingsOpen] = useState(false);
  const [retentionAddMenuOpen, setRetentionAddMenuOpen] = useState(false);
  const [retentionBulkOpen, setRetentionBulkOpen] = useState(false);
  const activeCatalogs = useMemo(() => catalogs.filter((entry) => entry.active), [catalogs]);
  const existingCustomerNames = useMemo(() => items.filter((item) => item.module === "commercial")
    .map((item) => parseCommercialLead(item.description)?.customer || item.customer_name)
    .map((name) => name.trim().toLocaleLowerCase("pt-BR"))
    .filter(Boolean), [items]);
  const allFunnels = useMemo(() => activeCatalogs.filter((entry) => entry.catalog === "funnelStage")
    .map((entry) => ({ entry, details: commercialDetails(entry.description) })), [activeCatalogs]);
  const funnels = useMemo(() => {
    const configured = allFunnels.filter((entry) => entry.details.functionality === commercialFlowLabel(flow));
    return flow === "retention" && configured.length === 0 ? [{ entry: { id: "retention-default", catalog: "funnelStage", name: "CRM Retenção", description: "", active: true }, details: { functionality: "CRM Retenção", stages: defaultRetentionStages } }] : configured;
  }, [allFunnels, flow]);
  const activeFunnel = funnels.find((entry) => entry.entry.id === selectedFunnel) ?? funnels[0];
  const leads = useMemo(() => items.filter((item) => item.module === "commercial" && item.record_type === commercialRecordType(flow))
    .filter((item) => {
      const details = parseCommercialLead(item.description);
      if (activeFunnel && activeFunnel.entry.id !== "retention-default" && details?.funnel !== activeFunnel.entry.name) return false;
      if (owner !== "all" && item.owner !== owner) return false;
      if (temperature !== "all" && details?.temperature !== temperature) return false;
      const search = `${item.title} ${item.customer_name} ${item.owner} ${details?.phone ?? ""} ${details?.clientId ?? ""}`.toLocaleLowerCase("pt-BR");
      return !query.trim() || search.includes(query.trim().toLocaleLowerCase("pt-BR"));
    }), [items, flow, activeFunnel, owner, temperature, query]);
  const stages = activeFunnel?.details.stages?.filter((stage) => stage.name.trim()) ?? [];
  const boardStages = flow === "qualification"
    ? [
      ...stages,
      ...(!stages.some((stage) => /desqualificado/i.test(stage.name)) ? [{ name: "Desqualificado", color: "#64748b", won: false, lost: true, automation: false, alertDays: 0 }] : []),
      ...(!stages.some((stage) => /qualificado/i.test(stage.name)) ? [{ name: "Qualificado", color: "#16a34a", won: true, lost: false, automation: false, alertDays: 0 }] : []),
    ]
    : stages;
  const temperatures = activeCatalogs.filter((entry) => entry.catalog === "temperature");
  const owners = [...new Set([...employees.filter((entry) => entry.active).map((entry) => entry.displayName), ...items.filter((entry) => entry.module === "commercial").map((entry) => entry.owner)])].filter(Boolean);
  const totalPipelineValue = leads.reduce((sum, lead) => sum + lead.amount_cents, 0);
  useEffect(() => {
    if (funnels.length === 0) {
      if (selectedFunnel) setSelectedFunnel("");
      return;
    }
    if (!funnels.some(({ entry }) => entry.id === selectedFunnel)) setSelectedFunnel(funnels[0].entry.id);
  }, [funnels, selectedFunnel]);
  useEffect(() => {
    const requestedLeadId = new URLSearchParams(window.location.search).get("lead");
    if (!requestedLeadId || selected) return;
    const requestedLead = leads.find((item) => item.id === requestedLeadId);
    if (requestedLead) setSelected(requestedLead);
  }, [leads, selected]);
  const closeSelectedLead = () => {
    setEditRequested(false);
    setLossReasonRequested(false);
    setSelected(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("lead");
    window.history.replaceState({}, "", url);
  };
  const chooseFunnel = (id: string) => {
    setSelectedFunnel(id);
    setDraggedLead(null);
    setStageLimits({});
  };
  const moveLeadToStage = async (leadItem: WorkItem, nextStage: string) => {
    if (!canEdit) return;
    const lead = parseCommercialLead(leadItem.description);
    if (!lead || lead.stage === nextStage) return;
    if ((flow === "qualification" && /desqualificado/i.test(nextStage)) || (flow !== "qualification" && /perdido/i.test(nextStage))) {
      setLossReasonRequested(true);
      setSelected(leadItem);
      return;
    }
    const next = { ...lead, stage: nextStage, ...(nextStage === "Desqualificado" ? { qualification: "disqualified" as const } : {}), follows: [...lead.follows, { type: "Movimentação", text: `Lead movido para ${nextStage}.`, createdAt: new Date().toISOString() }] };
    await operate({ action: "updateWorkItem", id: leadItem.id, title: leadItem.title, owner: leadItem.owner, amountCents: leadItem.amount_cents, description: JSON.stringify(next), version: leadItem.version }, "Lead movido com sucesso.");
  };

  if (directSalesOpen && flow !== "qualification") return <DirectSalesView flow={flow} catalogs={activeCatalogs} items={items} currentUser={currentUser} busy={busy} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} operate={operate} onBack={() => setDirectSalesOpen(false)} onOpenSettings={onOpenSettings} />;

  return <section className={`commercial-leads-module commercial-${view}-view ${flow === "retention" ? "retention-crm-module" : ""}`}>
    <PageHeader eyebrow={`OPERAÇÃO · ${commercialFlowLabel(flow).toUpperCase()}`} title={commercialFlowLabel(flow)} description={flow === "retention" ? "Gerencie clientes, tratativas e etapas do processo de retenção." : "Acompanhe oportunidades, etapas, interações e próximos follow-ups em um só fluxo."} action={<span className="commercial-header-actions">{onOpenSettings && <button className="icon-button commercial-settings-button" type="button" onClick={flow === "retention" ? () => setRetentionSettingsOpen(true) : onOpenSettings} aria-label={`Configurar ${commercialFlowLabel(flow)}`} title={`Configurar ${commercialFlowLabel(flow)}`}><Settings size={18} /></button>}{flow !== "qualification" && flow !== "retention" && <button className="secondary-button direct-sales-shortcut" type="button" onClick={() => setDirectSalesOpen(true)}><CircleDollarSign size={17} /> Venda direta</button>}{canCreate && (flow === "retention" ? <span className="retention-add-wrap"><button className="primary-button" type="button" aria-expanded={retentionAddMenuOpen} onClick={() => setRetentionAddMenuOpen((open) => !open)}><Plus size={17} /> Adicionar cliente <ChevronDown size={15} /></button>{retentionAddMenuOpen && <span className="retention-add-menu"><button type="button" onClick={() => { setRetentionAddMenuOpen(false); setCreating(true); }}><UserRound size={15} /> Cliente individual</button><button type="button" onClick={() => { setRetentionAddMenuOpen(false); setRetentionBulkOpen(true); }}><UsersRound size={15} /> Inserção em massa</button></span>}</span> : <button className="primary-button" onClick={() => setCreating(true)}><Plus size={17} /> Novo lead</button>)}</span>} />
    {flow !== "retention" && <section className="commercial-value-summary" aria-label="Resumo comercial"><span>Oportunidades visíveis <b>{leads.length}</b></span><strong>Valor total <b>{formatMoney(totalPipelineValue)}</b></strong></section>}
    <section className="commercial-lead-filters panel">
      <label className="commercial-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar nome, telefone, responsável ou cliente" /></label>
      {flow !== "retention" && <label>Funil selecionado<select value={activeFunnel?.entry.id ?? ""} onChange={(event) => chooseFunnel(event.target.value)} disabled={funnels.length === 0}>{funnels.length === 0 && <option value="">Nenhum funil disponível</option>}{funnels.map(({ entry }) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>}
      <label>Responsável<select value={owner} onChange={(event) => setOwner(event.target.value)}><option value="all">Todos</option>{owners.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
      <label>Temperatura<select value={temperature} onChange={(event) => setTemperature(event.target.value)}><option value="all">Todas</option>{temperatures.map((entry) => <option value={entry.name} key={entry.id}>{entry.name}</option>)}</select></label>
    </section>
    {activeFunnel && flow !== "retention" && <section className="commercial-active-funnel" aria-label={`Etapas do funil ${activeFunnel.entry.name}`}><div><span>Funil ativo</span><strong>{activeFunnel.entry.name}</strong><small>{boardStages.length} etapa(s)</small></div><div className="commercial-active-stages">{boardStages.map((stage, index) => <span key={`${stage.name}-${index}`} style={{ "--stage-color": stage.color } as CSSProperties}><i />{stage.name}</span>)}</div></section>}
    {activeFunnel && stages.length > 0 && flow !== "retention" && <><div className="commercial-view-switch segmented" role="tablist" aria-label="Visualização dos leads"><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={15} /> Lista</button><button className={view === "kanban" ? "active" : ""} onClick={() => setView("kanban")}><Columns3 size={15} /> Kanban</button></div>{view === "list" && <CommercialLeadList leads={leads} canEdit={canEdit} onOpen={setSelected} onEdit={(item) => { setEditRequested(true); setSelected(item); }} onDelete={(item) => { void operate({ action: "deleteWorkItem", id: item.id }, "Lead excluído com sucesso."); }} />}</>}
    {!activeFunnel || stages.length === 0 ? <section className="commercial-empty panel"><BadgeCheck size={23} /><h2>Configure o funil de {commercialFlowLabel(flow)}</h2><p>Crie um funil em Administração › Cadastros › Comercial › Configuração para visualizar os cards nesta funcionalidade.</p></section> : <section className="commercial-board" aria-label={`Funil ${activeFunnel.entry.name}`}>
      {boardStages.map((stage) => {
        const stageLeads = leads.filter((item) => { const detail = parseCommercialLead(item.description); if (flow === "retention" && stage.name === boardStages[0]?.name && !boardStages.some((entry) => entry.name === detail?.stage)) return true; return stage.name === "Desqualificado" ? detail?.qualification === "disqualified" || detail?.stage === "Desqualificado" : detail?.stage === stage.name; });
        const stageValue = stageLeads.reduce((total, lead) => total + lead.amount_cents, 0);
        const limit = stageLimits[stage.name] ?? 10;
        const visibleLeads = stageLeads.slice(0, limit);
        return <article className="commercial-column" key={stage.name} style={{ "--stage-color": stage.color } as CSSProperties} onDragOver={(event) => { if (canEdit) { event.preventDefault(); event.currentTarget.classList.add("drag-over"); } }} onDragLeave={(event) => event.currentTarget.classList.remove("drag-over")} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove("drag-over"); const dragged = leads.find((entry) => entry.id === event.dataTransfer.getData("workItemId")) ?? draggedLead; if (dragged) void moveLeadToStage(dragged, stage.name); setDraggedLead(null); }}><header><span><i />{stage.name}</span><span className="commercial-column-totals">{flow !== "retention" && <small>{formatMoney(stageValue)}</small>}<b>{stageLeads.length}</b></span></header><div>{stageLeads.length === 0 ? <p className="commercial-column-empty">Arraste um card para esta etapa.</p> : visibleLeads.map((lead) => flow === "retention" ? <RetentionLeadCard item={lead} key={lead.id} statuses={activeCatalogs.filter((entry) => entry.catalog === "retentionStatus")} canEdit={canEdit} canDelete={canDelete} onOpen={() => setSelected(lead)} onEdit={() => { setEditRequested(true); setSelected(lead); }} onDelete={() => { void operate({ action: "deleteWorkItem", id: lead.id }, "Cliente excluído com sucesso."); }} onStatusChange={(status) => { const detail = parseCommercialLead(lead.description); if (detail) void operate({ action: "updateWorkItem", id: lead.id, title: lead.title, owner: lead.owner, amountCents: lead.amount_cents, version: lead.version, description: JSON.stringify({ ...detail, retentionStatus: status }) }, "Status atualizado."); }} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("workItemId", lead.id); setDraggedLead(lead); }} onDragEnd={() => setDraggedLead(null)} /> : <CommercialLeadCard item={lead} key={lead.id} canEdit={canEdit} canDelete={canDelete} onOpen={() => setSelected(lead)} onEdit={() => { setEditRequested(true); setSelected(lead); }} onDelete={() => { void operate({ action: "deleteWorkItem", id: lead.id }, "Lead excluído com sucesso."); }} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("workItemId", lead.id); setDraggedLead(lead); }} onDragEnd={() => setDraggedLead(null)} />)}{stageLeads.length > visibleLeads.length && <button type="button" className="commercial-column-more" onClick={() => setStageLimits((current) => ({ ...current, [stage.name]: limit + 10 }))}>Ver mais ({stageLeads.length - visibleLeads.length})</button>}</div></article>;
      })}
    </section>}
    {creating && activeFunnel && (flow === "retention" ? <RetentionLeadModal funnel={activeFunnel.entry} details={activeFunnel.details} catalogs={activeCatalogs} employees={employees} currentUser={currentUser} busy={busy} onClose={() => setCreating(false)} onSave={async (payload) => { const result = await operate({ action: "createWorkItem", module: "commercial", recordType: commercialRecordType(flow), ...payload }, "Cliente cadastrado no CRM de retenção."); if (result) setCreating(false); }} /> : <CommercialLeadModal flow={flow} catalogs={activeCatalogs} funnel={activeFunnel.entry} details={activeFunnel.details} employees={employees} existingCustomerNames={existingCustomerNames} busy={busy} onClose={() => setCreating(false)} onSave={async (payload) => { const result = await operate({ action: "createWorkItem", module: "commercial", recordType: commercialRecordType(flow), ...payload }, "Lead criado com sucesso."); if (result) setCreating(false); }} />)}
    {flow === "retention" && retentionBulkOpen && activeFunnel && <RetentionBulkModal funnel={activeFunnel.entry} stages={stages} employees={employees} currentUser={currentUser} catalogs={activeCatalogs} busy={busy} onClose={() => setRetentionBulkOpen(false)} onCreate={async (payload) => Boolean(await operate({ action: "createWorkItem", module: "commercial", recordType: commercialRecordType(flow), ...payload }, "Cliente cadastrado no CRM de retenção."))} />}
    {flow === "retention" && retentionSettingsOpen && <RetentionCrmSettings catalogs={catalogs} funnel={activeFunnel} leads={items.filter((item) => item.record_type === commercialRecordType("retention"))} busy={busy} onClose={() => setRetentionSettingsOpen(false)} operate={operate} />}
    {creating && !activeFunnel && <ModalShell title="Funil necessário" subtitle="Crie e ative um funil antes de cadastrar um lead." onClose={() => setCreating(false)}><div className="empty-state"><p>Não há funil ativo para esta funcionalidade.</p><div className="form-actions"><button className="primary-button" type="button" onClick={() => setCreating(false)}>Entendi</button></div></div></ModalShell>}
    {selected && <CommercialLeadDrawer item={selected} busy={busy} canEdit={canEdit} canDelete={canDelete} startEditing={editRequested} startLossReason={lossReasonRequested} catalogs={activeCatalogs} agendaModule={agendaModule} funnels={allFunnels} funnel={activeFunnel?.entry} details={activeFunnel?.details} onClose={closeSelectedLead} onSave={async (payload) => {
      const result = await operate({ action: "updateWorkItem", id: selected.id, title: selected.title, owner: selected.owner, amountCents: selected.amount_cents, version: selected.version, ...payload }, "Lead atualizado com sucesso.");
      if (result) setSelected((current) => current ? { ...current, ...("title" in payload ? { title: String(payload.title) } : {}), ...("owner" in payload ? { owner: String(payload.owner) } : {}), ...("customerName" in payload ? { customer_name: String(payload.customerName) } : {}), ...("amountCents" in payload ? { amount_cents: Number(payload.amountCents) } : {}), ...("recordType" in payload ? { record_type: String(payload.recordType) } : {}), ...("description" in payload ? { description: String(payload.description) } : {}), version: current.version + 1, updated_at: new Date().toISOString() } : current);
      return result;
    }} onAgendaOperation={operate} onDelete={async () => { const result = await operate({ action: "deleteWorkItem", id: selected.id }, "Lead excluído com sucesso."); if (result) closeSelectedLead(); }} />}
  </section>;
}

function DirectSalesView({ flow, catalogs, items, currentUser, busy, canCreate, canEdit, canDelete, operate, onBack, onOpenSettings }: { flow: Exclude<CommercialFlow, "qualification">; catalogs: CustomerCatalogOption[]; items: WorkItem[]; currentUser: AppData["user"]; busy: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; operate: (payload: Record<string, unknown>, success: string) => Promise<OperationResult>; onBack: () => void; onOpenSettings?: () => void }) {
  const today = new Date().toLocaleDateString("en-CA");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [seller, setSeller] = useState("all");
  const [product, setProduct] = useState("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<{ item: WorkItem; detail: DirectSale } | null>(null);
  const sales = useMemo(() => items.map((item) => ({ item, detail: parseDirectSale(item.description) }))
    .filter((entry): entry is { item: WorkItem; detail: DirectSale } => Boolean(entry.detail && entry.item.record_type === directSaleRecordType(flow) && entry.detail.flow === flow)), [items, flow]);
  const sellers = [...new Set(sales.map(({ detail }) => detail.seller).filter(Boolean))];
  const products = [...new Set(sales.flatMap(({ detail }) => detail.products.map((entry) => entry.product)).filter(Boolean))];
  const filtered = sales.filter(({ item, detail }) => {
    if (month && !detail.saleDate.startsWith(month)) return false;
    if (seller !== "all" && detail.seller !== seller) return false;
    if (product !== "all" && !detail.products.some((entry) => entry.product === product)) return false;
    const search = `${detail.saleId} ${detail.name} ${detail.origin} ${detail.version} ${detail.seller} ${item.title}`.toLocaleLowerCase("pt-BR");
    return !query.trim() || search.includes(query.trim().toLocaleLowerCase("pt-BR"));
  });
  const total = filtered.reduce((sum, entry) => sum + entry.detail.totalCents, 0);
  return <section className="commercial-leads-module direct-sales-module">
    <PageHeader eyebrow={`OPERAÇÃO · ${commercialFlowLabel(flow).toUpperCase()}`} title="Vendas diretas" description={`Vendas registradas diretamente no ${commercialFlowLabel(flow)}, sem passagem pelo funil de leads.`} action={<span className="commercial-header-actions">{onOpenSettings && <button className="icon-button commercial-settings-button" type="button" onClick={onOpenSettings} aria-label="Configurar cadastros comerciais"><Settings size={18} /></button>}<button className="secondary-button" type="button" onClick={onBack}><ChevronRight className="direct-sales-back-icon" size={17} /> Voltar ao CRM</button>{canCreate && <button className="primary-button" type="button" onClick={() => setCreating(true)}><Plus size={17} /> Adicionar venda direta</button>}</span>} />
    <section className="direct-sales-summary panel"><div><span>Período selecionado</span><strong>{month ? new Date(`${month}-02T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "Todos os períodos"}</strong></div><div><span>Vendas encontradas</span><strong>{filtered.length}</strong></div><div className="direct-sales-total"><span>Valor total do mês</span><strong>{formatMoney(total)}</strong><small>Descontos já aplicados</small></div></section>
    <section className="commercial-lead-filters direct-sales-filters panel">
      <label className="commercial-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar por ID, nome, origem ou versão" /></label>
      <label>Mês<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
      <label>Vendedor<select value={seller} onChange={(event) => setSeller(event.target.value)}><option value="all">Todos</option>{sellers.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
      <label>Produto<select value={product} onChange={(event) => setProduct(event.target.value)}><option value="all">Todos</option>{products.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
    </section>
    <section className="direct-sales-list panel">
      <div className="direct-sales-row direct-sales-head"><span>ID · DATA</span><span>CLIENTE</span><span>ORIGEM</span><span>PRODUTOS</span><span>VERSÃO</span><span>VENDEDOR</span><span>DESCONTO</span><span>VALOR FINAL</span><span>AÇÕES</span></div>
      {filtered.length === 0 ? <EmptyState text="Nenhuma venda direta encontrada para os filtros selecionados." /> : filtered.map(({ item, detail }) => <article className="direct-sales-row" key={item.id}><span><strong>{detail.saleId}</strong><small>{detail.saleDate ? new Date(`${detail.saleDate}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</small></span><span><strong>{detail.name}</strong><small>{commercialFlowLabel(flow)}</small></span><span>{detail.origin || "—"}</span><span><strong>{detail.products.length} produto(s)</strong><small>{detail.products.map((entry) => `${entry.product}${entry.plan ? ` · ${entry.plan}` : ""}`).join(", ")}</small></span><span>{detail.version || "—"}</span><span>{detail.seller || item.owner}</span><span>{detail.discountCents ? `− ${formatMoney(detail.discountCents)}` : "—"}</span><span className="direct-sale-value"><small>{formatMoney(detail.subtotalCents)}</small><strong>{formatMoney(detail.totalCents)}</strong></span><span className="direct-sales-actions">{canEdit && <button type="button" onClick={() => setEditing({ item, detail })} title="Editar venda direta" aria-label={`Editar venda direta ${detail.saleId}`}><Pencil size={14} /></button>}{canDelete && <button type="button" className="delete" onClick={() => void operate({ action: "deleteWorkItem", id: item.id }, "Venda direta excluída com sucesso.")} title="Excluir venda direta" aria-label={`Excluir venda direta ${detail.saleId}`}><Trash2 size={14} /></button>}{!canEdit && !canDelete && <small>—</small>}</span></article>)}
    </section>
    {creating && <DirectSaleModal flow={flow} catalogs={catalogs} items={items} currentUser={currentUser} busy={busy} onClose={() => setCreating(false)} onSave={async (detail) => { const result = await operate({ action: "createWorkItem", module: "commercial", recordType: directSaleRecordType(flow), title: `${detail.name} · ${detail.saleId}`, customerName: detail.name, owner: detail.seller, team: commercialFlowLabel(flow), priority: "P3", amountCents: detail.totalCents, description: JSON.stringify(detail) }, "Venda direta adicionada com sucesso."); if (!result) return; const isLia=detail.followUpTrack==="lia"; const journey = isLia?{kind:"liaJourney",clientId:detail.saleId,startDate:new Date().toISOString(),sector:"Comercial",requestType:"Venda direta",history:[{id:crypto.randomUUID(),text:`Venda direta ${detail.saleId} encaminhada para a LIA.`,at:new Date().toISOString(),author:detail.seller}]}:{kind:"csJourney",track:detail.followUpTrack,phase:"validation",sourceLeadId:result.id,clientId:detail.saleId,commerciallyApproved:true,status:"Pendente",featuresBase:[],featuresActive:[],featuresPlus:[],labels:[],follows:[{kind:"Origem comercial",text:`Venda direta ${detail.saleId} enviada para acompanhamento de ${followUpTrackLabel(detail.followUpTrack)}.`,createdAt:new Date().toISOString(),actor:detail.seller}]}; const routed = await operate({action:"createWorkItem",module:isLia?"lia":"cs",recordType:isLia?"Projeto LIA":detail.followUpTrack==="activation"?"Acompanhamento de ativação":"Acompanhamento de retenção",title:detail.name,customerName:detail.name,owner:isLia?"Coordenação de LIA":"Coordenação de CS",team:isLia?"LIA":detail.followUpTrack==="activation"?"Sucesso do Cliente · Ativação":"Sucesso do Cliente · Retenção",status:isLia?"AguardandoKickoff":undefined,priority:"P3",amountCents:detail.totalCents,description:JSON.stringify(journey)},`Cliente direcionado para acompanhamento ${followUpTrackLabel(detail.followUpTrack)}.`); if (routed) setCreating(false); }} />}
    {editing && <DirectSaleModal flow={flow} catalogs={catalogs} items={items} currentUser={currentUser} busy={busy} sale={editing.detail} onClose={() => setEditing(null)} onSave={async (detail) => { const result = await operate({ action: "updateWorkItem", requireConfirmation: true, id: editing.item.id, title: `${detail.name} · ${detail.saleId}`, customerName: detail.name, owner: detail.seller, amountCents: detail.totalCents, version: editing.item.version, description: JSON.stringify(detail) }, "Venda direta atualizada com sucesso."); if (result) setEditing(null); }} />}
  </section>;
}

function DirectSaleModal({ flow, catalogs, items, currentUser, busy, sale, onClose, onSave }: { flow: Exclude<CommercialFlow, "qualification">; catalogs: CustomerCatalogOption[]; items: WorkItem[]; currentUser: AppData["user"]; busy: boolean; sale?: DirectSale; onClose: () => void; onSave: (detail: DirectSale) => Promise<void> }) {
  const today = new Date().toLocaleDateString("en-CA");
  const existingIds = items.map((item) => parseDirectSale(item.description)?.saleId ?? "").filter(Boolean);
  const yearPrefix = String(new Date().getFullYear()).slice(-2);
  const yearNumbers = existingIds.filter((id) => id.startsWith(yearPrefix)).map((id) => Number(id.slice(2))).filter(Number.isFinite);
  const saleId = sale?.saleId ?? `${yearPrefix}${String(Math.max(0, ...yearNumbers) + 1).padStart(4, "0")}`;
  const origins = catalogs.filter((entry) => entry.active && entry.catalog === "acquisitionChannel");
  const productCatalogs = catalogs.filter((entry) => entry.active && entry.catalog === "commercialProduct");
  const versionOptions = [...new Set([
    ...catalogs.filter((entry) => entry.active && /version/i.test(entry.catalog)).map((entry) => entry.name),
    ...productCatalogs.flatMap((entry) => (commercialDetails(entry.description).plans ?? []).filter((plan) => plan.active).map((plan) => plan.name)),
  ].filter(Boolean))];
  const [saleDate, setSaleDate] = useState(sale?.saleDate ?? today);
  const [name, setName] = useState(sale?.name ?? "");
  const [origin, setOrigin] = useState(sale?.origin ?? "");
  const [version, setVersion] = useState(sale?.version ?? "");
  const [productId, setProductId] = useState("");
  const [plan, setPlan] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<DirectSale["products"]>(sale?.products ?? []);
  const [discount, setDiscount] = useState((sale?.discountCents ?? 0) / 100);
  const [followUpTrack, setFollowUpTrack] = useState<FollowUpTrack>(sale?.followUpTrack ?? (flow === "retention" ? "retention" : "activation"));
  const selectedProduct = productCatalogs.find((entry) => entry.id === productId);
  const plans = (selectedProduct ? commercialDetails(selectedProduct.description).plans ?? [] : []).filter((entry) => entry.active);
  const selectedPlan = plans.find((entry) => entry.name === plan);
  const subtotalCents = selectedProducts.reduce((sum, entry) => sum + Math.round(entry.unitValue * entry.quantity * 100), 0);
  const discountCents = Math.min(subtotalCents, Math.max(0, Math.round(discount * 100)));
  const totalCents = Math.max(0, subtotalCents - discountCents);
  const addProduct = () => {
    if (!selectedProduct) return;
    const unitValue = Number(selectedPlan?.value ?? 0);
    setSelectedProducts((current) => [...current, { product: selectedProduct.name, plan, unitValue, quantity }]);
    setProductId(""); setPlan(""); setQuantity(1);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const effectiveProducts=selectedProducts.length?selectedProducts:selectedProduct?[{product:selectedProduct.name,plan,unitValue:Number(selectedPlan?.value??0),quantity}]:[];
    if (!name.trim() || !origin || !version || effectiveProducts.length === 0) return;
    const effectiveSubtotal=effectiveProducts.reduce((sum,entry)=>sum+Math.round(entry.unitValue*entry.quantity*100),0);const effectiveDiscount=Math.min(effectiveSubtotal,discountCents);const effectiveTotal=Math.max(0,effectiveSubtotal-effectiveDiscount);
    await onSave({ kind: "directSale", flow, followUpTrack, saleId, saleDate, name: name.trim(), origin, version, seller: sale?.seller || currentUser.displayName, products: effectiveProducts, subtotalCents:effectiveSubtotal, discountCents:effectiveDiscount, totalCents:effectiveTotal });
  };
  return <ModalShell title={sale ? "Editar venda direta" : "Adicionar venda direta"} subtitle={`${commercialFlowLabel(flow)} · ID ${saleId}${sale ? "" : " gerado automaticamente"}`} onClose={onClose}><form className="form-grid direct-sale-form" onSubmit={submit}>
    <label>Data *<input type="date" required value={saleDate} onChange={(event) => setSaleDate(event.target.value)} /></label><label>ID da venda<input readOnly value={saleId} /></label>
    <label className="wide">Nome *<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do cliente ou empresa" /></label>
    <label>Origem *<select required value={origin} onChange={(event) => setOrigin(event.target.value)}><option value="">Selecionar origem</option>{origins.map((entry) => <option value={entry.name} key={entry.id}>{entry.name}</option>)}</select></label>
    <label>Versão *<select required value={version} onChange={(event) => setVersion(event.target.value)}><option value="">Selecionar versão</option>{versionOptions.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
    <label className="wide direct-sale-routing">Tipo de acompanhamento *<select required value={followUpTrack} disabled={Boolean(sale)} onChange={(event) => setFollowUpTrack(event.target.value as FollowUpTrack)}><option value="activation">Acompanhamento Ativação</option><option value="retention">Acompanhamento Retenção</option><option value="lia">Acompanhamento LIA</option></select><small>{sale ? "O encaminhamento original é preservado durante a edição." : "Ao salvar, o cliente será encaminhado automaticamente para a fila selecionada."}</small></label>
    <fieldset className="wide direct-sale-products"><legend>Produtos da venda *</legend><div className="direct-sale-product-picker"><label>Produto<select value={productId} onChange={(event) => { setProductId(event.target.value); setPlan(""); }}><option value="">Selecionar produto</option>{productCatalogs.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label><label>Plano / versão<select value={plan} onChange={(event) => setPlan(event.target.value)} disabled={!selectedProduct}><option value="">Sem plano</option>{plans.map((entry) => <option value={entry.name} key={entry.name}>{entry.name} · R$ {entry.value}</option>)}</select></label><label>Valor unitário<input readOnly value={selectedProduct ? formatMoney(Math.round(Number(selectedPlan?.value ?? 0) * 100)) : "R$ 0,00"} /></label><label>Qtd.<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></label><button type="button" className="secondary-button" disabled={!selectedProduct} onClick={addProduct}><Plus size={15} /> Adicionar</button></div>
      <div className="direct-sale-selected-products">{selectedProducts.length === 0 ? <p>Adicione um ou mais produtos para calcular o valor.</p> : selectedProducts.map((entry, index) => <article key={`${entry.product}-${entry.plan}-${index}`}><span><strong>{entry.product}</strong><small>{entry.plan || "Sem plano"} · {entry.quantity} un.</small></span><b>{formatMoney(Math.round(entry.unitValue * entry.quantity * 100))}</b><button type="button" aria-label="Remover produto" onClick={() => setSelectedProducts((current) => current.filter((_, currentIndex) => currentIndex !== index))}><Trash2 size={15} /></button></article>)}</div>
    </fieldset>
    <label>Subtotal<input readOnly value={formatMoney(subtotalCents)} /></label><label>Desconto (R$)<input type="number" min="0" step="0.01" value={discount || ""} onChange={(event) => setDiscount(Math.max(0, Number(event.target.value) || 0))} placeholder="0,00" /></label>
    <div className="direct-sale-final-value wide"><span>Valor final da venda</span><strong>{formatMoney(totalCents)}</strong><small>{discountCents > 0 ? `${formatMoney(discountCents)} de desconto aplicado` : "Sem desconto aplicado"}</small></div>
    <div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={busy || !name.trim() || !origin || !version || (selectedProducts.length === 0&&!selectedProduct)}><Save size={16} /> {busy ? "Salvando..." : sale ? "Salvar alterações" : "Salvar venda direta"}</button></div>
  </form></ModalShell>;
}

function CommercialLeadCard({ item, canEdit, canDelete, onOpen, onEdit, onDelete, onDragStart, onDragEnd }: { item: WorkItem; canEdit: boolean; canDelete: boolean; onOpen: () => void; onEdit: () => void; onDelete: () => void; onDragStart: (event: React.DragEvent<HTMLElement>) => void; onDragEnd: () => void }) {
  const lead = parseCommercialLead(item.description);
  const customer = lead?.customer || item.customer_name || "Lead sem cliente vinculado";
  const score = Math.max(0, Math.min(5, lead?.score ?? 0));
  return <article className="commercial-lead-card commercial-card-with-actions" draggable={canEdit} onDragStart={onDragStart} onDragEnd={onDragEnd}>
    <div className="commercial-card-open" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(); }}>
      <span className="commercial-card-top">
        <b>{item.title.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</b>
        <span className="commercial-card-heading"><strong>{item.title}</strong><small>{customer}</small></span>
        <i aria-label={`Lead score ${score} de 5`}>{score > 0 ? "★".repeat(score) : "☆"}</i>
      </span>
      <span className="commercial-card-context"><BriefcaseBusiness size={14} />{customer}</span>
      <span className="commercial-card-follow"><Clock3 size={14} />{lead?.follows.length ? `${lead.follows.length} follow-up(s) registrado(s)` : lead?.phone || "Telefone não informado"}</span>
      {lead?.labels.length ? <span className="commercial-card-labels">{lead.labels.map((label) => <em key={label} style={{ "--label-color": commercialLabelColor(label) } as CSSProperties}>{label}</em>)}</span> : null}
      <footer><span>{lead?.temperature || "Sem temperatura"}</span><b><small>Valor estimado</small>{item.amount_cents > 0 ? formatMoney(item.amount_cents) : "—"}</b></footer>
    </div>
    {(canEdit || canDelete) && <span className="card-inline-actions">{canEdit && <button type="button" onClick={onEdit} title="Editar lead" aria-label="Editar lead"><Pencil size={14} /></button>}{canDelete && <button type="button" className="delete" onClick={onDelete} title="Excluir lead" aria-label="Excluir lead"><Trash2 size={14} /></button>}</span>}
  </article>;
}

function CommercialLeadList({ leads, canEdit, onOpen, onEdit, onDelete }: { leads: WorkItem[]; canEdit: boolean; onOpen: (item: WorkItem) => void; onEdit: (item: WorkItem) => void; onDelete: (item: WorkItem) => void }) {
  return <div className="table-card commercial-lead-list"><div className="data-table work-table"><div className="table-row table-head"><span>Lead</span><span>Etapa</span><span>Responsável</span><span>Interações</span><span>Valor</span></div>{leads.length === 0 ? <EmptyState text="Nenhum lead encontrado." /> : leads.map((item) => { const lead = parseCommercialLead(item.description); return <div className="commercial-list-row" key={item.id}><button className="table-row" onClick={() => onOpen(item)}><span><b className="commercial-list-avatar">{item.title.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</b><span><strong>{item.title}</strong><small>{lead?.customer || item.customer_name || "Sem cliente vinculado"}</small></span></span><span><b className="status-pill neutral">{lead?.stage || "Sem etapa"}</b></span><span>{item.owner || "Não atribuído"}</span><span>{lead?.follows.length ?? 0} registro(s)</span><span>{item.amount_cents ? formatMoney(item.amount_cents) : "—"}<ChevronRight size={16} /></span></button>{canEdit && <span className="card-inline-actions"><button type="button" title="Editar cliente" onClick={() => onEdit(item)}><Pencil size={14} /></button><button type="button" className="delete" title="Excluir cliente" onClick={() => onDelete(item)}><Trash2 size={14} /></button></span>}</div>; })}</div></div>;
}

function RetentionLeadCard({ item, statuses, canEdit, canDelete, onOpen, onEdit, onDelete, onStatusChange, onDragStart, onDragEnd }: { item: WorkItem; statuses: CustomerCatalogOption[]; canEdit: boolean; canDelete: boolean; onOpen: () => void; onEdit: () => void; onDelete: () => void; onStatusChange: (status: string) => void; onDragStart: (event: React.DragEvent<HTMLElement>) => void; onDragEnd: () => void }) {
  const lead = parseCommercialLead(item.description);
  const temperature = lead?.temperature || "Frio";
  const status = lead?.retentionStatus || "";
  const statusColor = commercialDetails(statuses.find((entry) => entry.name === status)?.description ?? "").color || "var(--muted)";
  return <article className="retention-lead-card" draggable={canEdit} onDragStart={onDragStart} onDragEnd={onDragEnd} style={{ "--retention-status-color": statusColor } as CSSProperties}>
    <div className="retention-card-main" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(); } }}>
      <div className="retention-card-head"><strong>#{lead?.clientId || item.title}</strong><span className="retention-card-status" onClick={(event) => event.stopPropagation()}><i /><select aria-label={`Status de ${lead?.customer || item.title}`} value={status} disabled={!canEdit} onChange={(event) => onStatusChange(event.target.value)}><option value="">Status</option>{status && !statuses.some((entry) => entry.name === status) && <option value={status}>{status}</option>}{statuses.map((entry) => <option key={entry.id} value={entry.name}>{entry.name}</option>)}</select></span></div>
      <span className="retention-card-company" title={lead?.customer || item.title}>{lead?.customer || item.title}</span>
      <span className="retention-card-phone">{lead?.phone || "WhatsApp não informado"}</span>
      <div className="retention-card-meta"><span>{lead?.version || "Sem versão"}</span><span className={`retention-temperature ${temperature.toLocaleLowerCase("pt-BR")}`}><i />{temperature}</span></div>
      <small className="retention-card-owner"><UserRound size={12} />{lead?.seller || item.owner || "Sem responsável"}</small>
    </div>
    {(canEdit || canDelete) && <div className="retention-card-actions">{canEdit && <button type="button" onClick={onEdit} title="Editar cliente" aria-label="Editar cliente"><Pencil size={13} /></button>}{canDelete && <button type="button" onClick={onDelete} title="Excluir cliente" aria-label="Excluir cliente"><Trash2 size={13} /></button>}</div>}
  </article>;
}

function RetentionLeadModal({ funnel, details, catalogs, employees, currentUser, busy, onClose, onSave }: { funnel: CustomerCatalogOption; details: CommercialDetails; catalogs: CustomerCatalogOption[]; employees: Employee[]; currentUser: AppData["user"]; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const stages = details.stages?.filter((entry) => entry.name.trim()) ?? [];
  const versions = catalogs.filter((entry) => entry.catalog === "retentionVersion" && entry.active);
  const responsible = employees.find((entry) => entry.active && entry.email.toLocaleLowerCase() === currentUser.email.toLocaleLowerCase())?.displayName || currentUser.displayName;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const company = String(form.get("company") ?? "").trim();
    const owner = responsible;
    const lead: CommercialLead = { kind: "commercialLead", clientId: String(form.get("clientId") ?? "").trim(), customer: company, entryDate: String(form.get("entryDate") ?? ""), version: String(form.get("version") ?? "").trim(), phone: String(form.get("phone") ?? "").trim(), seller: owner, source: "CRM Retenção", funnel: funnel.name, stage: stages[0]?.name ?? "", temperature: "", labels: [], products: [], score: 0, follows: [], comments: [], retentionStatus: "", retentionMarks: [] };
    onSave({ title: company, customerName: company, owner, team: "CRM Retenção", priority: "P3", amountCents: 0, description: JSON.stringify(lead) });
  };
  return <ModalShell title="Adicionar cliente · CRM Retenção" subtitle="Informe os dados para iniciar a tratativa no funil." onClose={onClose}><form className="form-grid retention-lead-form" onSubmit={submit}>
    <label>ID *<input name="clientId" required inputMode="numeric" maxLength={6} pattern="[0-9]{6}" placeholder="ID do cliente" autoFocus /></label>
    <label>Data de cadastro *<input name="entryDate" type="date" required defaultValue={new Date().toLocaleDateString("en-CA")} /></label>
    <label className="wide">Razão social *<input name="company" required placeholder="Nome da empresa / cliente" /></label>
    <label>Versão *{versions.length ? <select name="version" required defaultValue=""><option value="">Selecionar versão</option>{versions.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select> : <input name="version" required placeholder="Ex.: Essencial" />}</label>
    <label>WhatsApp *<input name="phone" required type="tel" placeholder="(00) 00000-0000" /></label>
    <label className="wide">Responsável<input readOnly value={responsible} /><small>Preenchido automaticamente pelo colaborador vinculado ao acesso.</small></label>
    <div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={busy}><Save size={16} /> Cadastrar cliente</button></div>
  </form></ModalShell>;
}

type RetentionBulkRow = { key: string; clientId: string; company: string; entryDate: string; version: string; phone: string };
const makeRetentionBulkRow = (): RetentionBulkRow => ({ key: crypto.randomUUID(), clientId: "", company: "", entryDate: new Date().toLocaleDateString("en-CA"), version: "", phone: "" });

function RetentionBulkModal({ funnel, stages, employees, currentUser, catalogs, busy, onClose, onCreate }: { funnel: CustomerCatalogOption; stages: NonNullable<CommercialDetails["stages"]>; employees: Employee[]; currentUser: AppData["user"]; catalogs: CustomerCatalogOption[]; busy: boolean; onClose: () => void; onCreate: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const [rows, setRows] = useState<RetentionBulkRow[]>([makeRetentionBulkRow()]);
  const [error, setError] = useState("");
  const [processed, setProcessed] = useState(0);
  const [sending, setSending] = useState(false);
  const responsible = employees.find((entry) => entry.active && entry.email.toLocaleLowerCase() === currentUser.email.toLocaleLowerCase())?.displayName || currentUser.displayName;
  const versions = catalogs.filter((entry) => entry.catalog === "retentionVersion" && entry.active).map((entry) => entry.name);
  const update = (key: string, patch: Partial<RetentionBulkRow>) => { setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row)); setError(""); };
  const ready = rows.filter((row) => /^\d{6}$/.test(row.clientId) && row.company.trim() && row.entryDate && row.version && row.phone.trim());
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rows.length || rows.length > 500 || ready.length !== rows.length) { setError("Preencha ID de 6 dígitos, razão social, data, versão e WhatsApp em todos os clientes."); return; }
    const ids = rows.map((row) => row.clientId);
    if (new Set(ids).size !== ids.length) { setError("Existem IDs repetidos na lista. Cada cliente deve aparecer apenas uma vez."); return; }
    setSending(true); setProcessed(0); setError("");
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const lead: CommercialLead = { kind: "commercialLead", clientId: row.clientId, customer: row.company.trim(), entryDate: row.entryDate, version: row.version, phone: row.phone.trim(), seller: responsible, source: "CRM Retenção", funnel: funnel.name, stage: stages[0]?.name ?? defaultRetentionStages[0].name, temperature: "", labels: [], products: [], score: 0, follows: [], comments: [], retentionStatus: "", retentionMarks: [] };
      const saved = await onCreate({ title: row.company.trim(), customerName: row.company.trim(), owner: responsible, team: "CRM Retenção", priority: "P3", amountCents: 0, description: JSON.stringify(lead) });
      if (!saved) { setRows((current) => current.slice(index)); setError(`${index} cliente(s) foram salvos. Corrija os registros restantes e tente novamente.`); setSending(false); setProcessed(0); return; }
      setProcessed(index + 1);
    }
    setSending(false); onClose();
  };
  return <ModalShell className="retention-bulk-modal" title="Inserção em massa · CRM Retenção" subtitle="Adicione cada cliente em uma linha e use o botão + para incluir novos registros." onClose={onClose}><form className="retention-bulk-form" onSubmit={(event) => { void submit(event).catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : "Não foi possível salvar os clientes."); setSending(false); }); }}><div className="retention-bulk-scroll">{rows.map((row, index) => <article className="retention-bulk-row" key={row.key}><header><b>Cliente #{index + 1}</b>{rows.length > 1 && <button type="button" onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))} aria-label={`Remover cliente ${index + 1}`}><Trash2 size={15}/></button>}</header><div><label>ID *<input required inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={row.clientId} onChange={(event) => update(row.key, { clientId: event.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="000000" /></label><label className="company">Razão social *<input required value={row.company} onChange={(event) => update(row.key, { company: event.target.value })} placeholder="Nome da empresa / cliente" /></label><label>Data de cadastro *<input required type="date" value={row.entryDate} onChange={(event) => update(row.key, { entryDate: event.target.value })} /></label><label>Versão *{versions.length ? <select required value={row.version} onChange={(event) => update(row.key, { version: event.target.value })}><option value="">Selecionar</option>{versions.map((entry) => <option key={entry}>{entry}</option>)}</select> : <input required value={row.version} onChange={(event) => update(row.key, { version: event.target.value })} placeholder="Ex.: Essencial" />}</label><label>WhatsApp *<input required type="tel" value={row.phone} onChange={(event) => update(row.key, { phone: event.target.value })} placeholder="(00) 00000-0000" /></label><label>Responsável<input readOnly value={responsible} /></label></div></article>)}<button className="retention-add-entry" type="button" disabled={rows.length >= 500 || sending} onClick={() => setRows((current) => [...current, makeRetentionBulkRow()])}><Plus size={17}/> Adicionar outro cliente</button></div>{error && <p role="alert" className="retention-bulk-error">{error}</p>}<footer className="retention-bulk-footer"><span><strong>{ready.length}</strong> de {rows.length} pronto(s) para envio</span><div><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || sending || ready.length !== rows.length}><Save size={15}/>{sending ? `Salvando ${processed} de ${rows.length}...` : `Criar ${rows.length} cliente(s)`}</button></div></footer></form></ModalShell>;
}

function CommercialLeadModal({ flow, catalogs, funnel, details, employees, existingCustomerNames, busy, onClose, onSave }: { flow: CommercialFlow; catalogs: CustomerCatalogOption[]; funnel: CustomerCatalogOption; details: CommercialDetails; employees: Employee[]; existingCustomerNames: string[]; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const products = catalogs.filter((entry) => entry.catalog === "commercialProduct");
  const channels = catalogs.filter((entry) => entry.catalog === "acquisitionChannel");
  const temperatures = catalogs.filter((entry) => entry.catalog === "temperature");
  const stages = details.stages?.filter((entry) => entry.name.trim()) ?? [];
  const [score, setScore] = useState(0);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [plan, setPlan] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<Array<{ product: string; plan: string; value: number; quantity: number }>>([]);
  const [validationError, setValidationError] = useState("");
  const product = products.find((entry) => entry.id === productId);
  const plans = commercialDetails(product?.description ?? "").plans?.filter((entry) => entry.active) ?? [];
  const total = selectedProducts.reduce((sum, entry) => sum + entry.value * entry.quantity, 0);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const customer = String(form.get("customer") ?? "").trim();
    if (customer && existingCustomerNames.includes(customer.toLocaleLowerCase("pt-BR"))) { setValidationError("Este cliente já possui uma oportunidade cadastrada."); return; }
    const pendingPlan=plans.find(entry=>entry.name===plan);const effectiveProducts=selectedProducts.length?selectedProducts:product?[{product:product.name,plan,value:Number(pendingPlan?.value??0),quantity}]:[];
    const effectiveTotal=effectiveProducts.reduce((sum,entry)=>sum+entry.value*entry.quantity,0);
    const payload: CommercialLead = { kind: "commercialLead", phone: String(form.get("phone") ?? ""), source: String(form.get("source") ?? ""), seller: String(form.get("owner") ?? ""), funnel: funnel.name, stage: String(form.get("stage") ?? ""), temperature: String(form.get("temperature") ?? ""), labels: [], products: effectiveProducts, score, entryDate: String(form.get("entryDate") ?? ""), customer, follows: [], comments: [] };
    onSave({ title: String(form.get("name") ?? ""), customerName: payload.customer, owner: payload.seller, team: "Comercial", priority: "P3", amountCents: Math.round(effectiveTotal * 100), description: JSON.stringify(payload) });
  };
  return <ModalShell title="Novo lead" subtitle={`Inclua a oportunidade no funil de ${commercialFlowLabel(flow)}.`} onClose={onClose}><form className="form-grid commercial-lead-form" onSubmit={submit}>
    <label className="wide">Nome *<input name="name" required autoFocus placeholder="Nome do lead" /></label><label className="wide">Telefone *<input name="phone" required placeholder="(11) 99999-9999" /></label>
    <label>Cliente / empresa<input name="customer" onChange={() => setValidationError("")} placeholder="Nome do cliente ou empresa" /></label><label>Origem<select name="source"><option value="">Selecionar</option>{channels.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label>{validationError && <small className="field-validation-error wide">{validationError}</small>}
    <label>Vendedor<select name="owner" defaultValue=""><option value="">Selecionar</option>{employees.filter((entry) => entry.active).map((entry) => <option key={entry.id}>{entry.displayName}</option>)}</select></label><label>Etapa inicial<select name="stage" required>{stages.map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></label>
    <label>Temperatura<select name="temperature"><option value="">Selecionar</option>{temperatures.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label><label>Data de entrada<input name="entryDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
    <fieldset className="wide commercial-products"><legend>Produtos do lead</legend>{selectedProducts.length === 0 && <p>Nenhum produto vinculado ao lead ainda.</p>}{selectedProducts.map((entry, index) => <div key={`${entry.product}-${index}`}><span><strong>{entry.product}</strong><small>{entry.plan || "Plano não definido"} · {entry.quantity} un.</small></span><b>{formatMoney(Math.round(entry.value * entry.quantity * 100))}</b><button type="button" onClick={() => setSelectedProducts((current) => current.filter((_, currentIndex) => currentIndex !== index))}><Trash2 size={14} /></button></div>)}<section><select value={productId} onChange={(event) => { setProductId(event.target.value); setPlan(""); }}><option value="">Produto</option>{products.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select><select value={plan} onChange={(event) => setPlan(event.target.value)}><option value="">Plano</option>{plans.map((entry) => <option key={entry.name} value={entry.name}>{entry.name} · R$ {entry.value}</option>)}</select><label className="commercial-product-value">Valor<input readOnly value={plan ? formatMoney(Math.round(Number(plans.find((entry) => entry.name === plan)?.value ?? 0) * 100)) : "R$ 0,00"} /></label><input value={quantity} type="number" min="1" aria-label="Quantidade" onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /><button type="button" disabled={!product} onClick={() => { const p = plans.find((entry) => entry.name === plan); setSelectedProducts((current) => [...current, { product: product?.name ?? "", plan, value: Number(p?.value ?? 0), quantity }]); }}>Adicionar</button></section>{total > 0 && <footer>Total: <b>{formatMoney(Math.round(total * 100))}</b></footer>}</fieldset>
    <fieldset className="wide lead-score"><legend>Lead score</legend>{[1, 2, 3, 4, 5].map((value) => <button type="button" className={value <= score ? "selected" : ""} key={value} onClick={() => setScore(value)} aria-label={`${value} estrelas`}>★</button>)}</fieldset>
    <div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} type="submit"><Save size={16} /> {busy ? "Criando..." : "Criar lead"}</button></div>
  </form></ModalShell>;
}

function LeadLabelPicker({ selected, labels, busy, onClose, onChange }: { selected: string[]; labels: CustomerCatalogOption[]; busy: boolean; onClose: () => void; onChange: (labels: string[]) => void }) {
  const [values, setValues] = useState(selected);
  const toggle = (label: string) => setValues((current) => current.includes(label) ? current.filter((entry) => entry !== label) : [...current, label]);
  return <div className="modal-backdrop label-picker-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="modal lead-label-modal" role="dialog" aria-modal="true" aria-label="Selecionar etiquetas"><div className="modal-head"><div><span className="eyebrow">ETIQUETAS</span><h2>Selecionar etiquetas</h2><p>Escolha uma ou mais sinalizações para o card.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></div><div className="label-picker-options">{labels.map((entry) => { const checked = values.includes(entry.name); return <button type="button" className={checked ? "selected" : ""} key={entry.id} onClick={() => toggle(entry.name)}><i style={{ background: commercialLabelColor(entry.name) }} />{checked && <Check size={14} />}{entry.name}</button>; })}</div><div className="form-actions"><button type="button" onClick={onClose}>Cancelar</button><button type="button" className="primary-button" disabled={busy} onClick={() => onChange(values)}><Save size={15} /> Salvar etiquetas</button></div></section></div>;
}

function CommercialLeadDrawer({ item, catalogs, agendaModule, funnels, funnel, details, busy, canEdit, canDelete, startEditing, startLossReason, onClose, onSave, onAgendaOperation, onDelete }: { item: WorkItem; catalogs: CustomerCatalogOption[]; agendaModule: AgendaModuleData | null; funnels: Array<{ entry: CustomerCatalogOption; details: CommercialDetails }>; funnel?: CustomerCatalogOption; details?: CommercialDetails; busy: boolean; canEdit: boolean; canDelete: boolean; startEditing: boolean; startLossReason: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<OperationResult>; onAgendaOperation: (payload: Record<string, unknown>, success: string) => Promise<OperationResult>; onDelete: () => Promise<void> }) {
  const lead = parseCommercialLead(item.description) ?? { kind: "commercialLead", phone: "", source: "", seller: item.owner, funnel: funnel?.name ?? "", stage: "", temperature: "", labels: [], products: [], score: 0, entryDate: "", customer: item.customer_name, follows: [], comments: [] };
  const flow = commercialFlowFromRecordType(item.record_type);
  const stages = details?.stages?.filter((entry) => entry.name.trim()) ?? [];
  const labelCatalogs = catalogs.filter((entry) => entry.catalog === "commercialLabel");
  const followTypes = catalogs.filter((entry) => entry.catalog === "followUpType");
  const lossReasons = catalogs.filter((entry) => entry.catalog === "lossReason");
  const crmFunnels = funnels.filter((entry) => entry.details.functionality === commercialFlowLabel("crm") || entry.details.functionality === commercialFlowLabel("retention"));
  const transferableFunnels = crmFunnels.filter((entry) => entry.entry.name !== lead.funnel);
  const [editing, setEditing] = useState(startEditing);
  const [labelPicker, setLabelPicker] = useState(false);
  const [qualifying, setQualifying] = useState(false);
  const [lossPrompt, setLossPrompt] = useState(startLossReason);
  const [lossReason, setLossReason] = useState("");
  const [targetFunnelId, setTargetFunnelId] = useState("");
  const [transferFunnelId, setTransferFunnelId] = useState("");
  const [transferStage, setTransferStage] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [followText, setFollowText] = useState("");
  const [followType, setFollowType] = useState("");
  const [commentText, setCommentText] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [followUpTrack, setFollowUpTrack] = useState<FollowUpTrack>(flow === "retention" ? "retention" : "activation");
  const entryDate = useMemo(() => { const date = lead.entryDate ? new Date(`${lead.entryDate}T12:00:00`) : new Date(item.created_at); date.setDate(date.getDate() + 1); return date.toISOString().slice(0, 10); }, [item.created_at, lead.entryDate]);
  const [slotDate, setSlotDate] = useState(entryDate);
  const [slot, setSlot] = useState("");
  const [checkingSlots, setCheckingSlots] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [clientId, setClientId] = useState(lead.onboarding?.clientId || lead.clientId || "");
  const [releaseVersion, setReleaseVersion] = useState(lead.onboarding?.version || lead.version || "");
  const [clientIdError, setClientIdError] = useState("");
  const transferFunnel = transferableFunnels.find((entry) => entry.entry.id === transferFunnelId);
  const transferStages = transferFunnel?.details.stages?.filter((entry) => entry.name.trim()) ?? [];
  useEffect(() => {
    setTransferStage(transferStages[0]?.name ?? "");
  }, [transferFunnelId]);
  const copyLeadLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("mod", "commercial");
    url.searchParams.set("commercialFlow", flow);
    url.searchParams.set("lead", item.id);
    await navigator.clipboard.writeText(url.toString());
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2200);
  };
  const normalizeAgendaName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const activationCalendar = agendaModule?.calendars.find((calendar) => {
    const value = normalizeAgendaName(`${calendar.name} ${calendar.departmentName}`);
    return followUpTrack === "lia" ? value.includes("lia") : value.includes("sucesso do cliente") && value.includes(followUpTrack === "retention" ? "retencao" : "ativacao");
  }) ?? agendaModule?.calendars.find((calendar) => normalizeAgendaName(`${calendar.name} ${calendar.departmentName}`).includes("sucesso do cliente")) ?? agendaModule?.calendars.find((calendar) => calendar.active);
  const slotOptions = ["09:30", "11:00", "14:00", "16:00"];
  const saoPauloDate = (value: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  };
  const isBusinessDay = (date: string) => {
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const fixedHolidays = new Set(["01-01","04-21","05-01","09-07","10-12","11-02","11-15","11-20","12-25"]);
    return weekday >= 1 && weekday <= 5 && !fixedHolidays.has(date.slice(5));
  };
  const availableSlotsFor = (date: string) => slotOptions.filter((candidate) => {
    if (!activationCalendar || !agendaModule || date < entryDate || !isBusinessDay(date)) return false;
    const dayCommitments = agendaModule.commitments.filter((commitment) => {
      const start = new Date(commitment.startsAt);
      const commitmentDate = saoPauloDate(start);
      return commitment.agendaId === activationCalendar.id && commitmentDate === date && !/cancelad/i.test(commitment.statusName);
    });
    if(dayCommitments.length>=3)return false;
    return !dayCommitments.some((commitment) => {
      const start=new Date(commitment.startsAt);
      const commitmentTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(start);
      return commitmentTime===candidate||/bloquead/i.test(`${commitment.statusName} ${commitment.title}`);
    });
  });
  const availableSlots = availableSlotsFor(slotDate);
  const nextAvailableDays = (() => {
    const days: Array<{ date: string; slots: string[] }> = [];
    const date = new Date(`${entryDate}T12:00:00`);
    while (days.length < 5) {
      const value = date.toISOString().slice(0, 10);
      if (isBusinessDay(value)) days.push({ date: value, slots: availableSlotsFor(value) });
      date.setDate(date.getDate() + 1);
    }
    return days;
  })();
  const saveLead = async (next: CommercialLead) => onSave({ description: JSON.stringify(next) });
  const qualifiedStage = stages.find((entry) => /qualificado|conclu/i.test(entry.name))?.name ?? "Qualificado";
  const wonStage = stages.find((entry) => entry.won || /ganho|conclu/i.test(entry.name))?.name ?? lead.stage;
  const lostStage = stages.find((entry) => entry.lost || /perd/i.test(entry.name))?.name ?? "Perdido";
  const sendToOnboarding = async (scheduled?: { date: string; time: string; startsAt: string; commitmentId?: string }, details?: { clientId: string; version: string }) => {
    const cleanClientId = (details?.clientId ?? clientId).replace(/\D/g, "");
    if (!/^\d{6}$/.test(cleanClientId)) { setClientIdError("Informe o ID do cliente com 6 números."); return false; }
    const isLia = followUpTrack === "lia";
    const journey = isLia
      ? { kind: "liaJourney", clientId: cleanClientId, startDate: new Date().toISOString(), kickoffDate: scheduled?.date ?? "", kickoffTime: scheduled?.time ?? "", sector: "Comercial", requestType: "Cliente ganho", history: [{ id: crypto.randomUUID(), text: "Cliente encaminhado pelo CRM para a LIA.", at: new Date().toISOString(), author: lead.seller || item.owner }] }
      : { kind: "csJourney", track: followUpTrack, phase: "validation", sourceLeadId: item.id, clientId: cleanClientId, scheduledAt: scheduled?.startsAt ?? "", scheduling: scheduled ? "scheduled" : "not-scheduled", commerciallyApproved: true, firstMeetingAt: scheduled?.startsAt ?? "", firstMeetingTime: scheduled?.time ?? "", firstMeetingCommitmentId: scheduled?.commitmentId, trainingAt: "", rescheduledAt: "", status: "Pendente", featuresBase: [], featuresActive: [], featuresPlus: [], labels: [], follows: [{ kind: "Origem comercial", text: scheduled ? `Cliente enviado para acompanhamento de ${followUpTrackLabel(followUpTrack)} com Kick off agendado em ${scheduled.date} às ${scheduled.time}.` : `Cliente enviado para acompanhamento de ${followUpTrackLabel(followUpTrack)}.`, createdAt: new Date().toISOString(), actor: lead.seller || item.owner }] };
    const created = await onAgendaOperation({ action: "createWorkItem", module: isLia ? "lia" : "cs", recordType: isLia ? "Projeto LIA" : followUpTrack === "activation" ? "Acompanhamento de ativação" : "Acompanhamento de retenção", title: item.title, customerName: lead.customer || item.customer_name, owner: isLia ? "Coordenação de LIA" : "Coordenação de CS", team: isLia ? "LIA" : followUpTrack === "activation" ? "Sucesso do Cliente · Ativação" : "Sucesso do Cliente · Retenção", status: isLia ? (scheduled ? "KickoffAgendado" : "AguardandoKickoff") : undefined, priority: "P3", amountCents: item.amount_cents, description: JSON.stringify(journey) }, `Cliente enviado para acompanhamento ${followUpTrackLabel(followUpTrack)}.`);
    if (created) await saveLead({ ...lead, stage: wonStage, onboarding: { status: scheduled ? "scheduled" : "sent", date: scheduled?.date, time: scheduled?.time, commitmentId: scheduled?.commitmentId, sentAt: new Date().toISOString(), clientId: cleanClientId, version: details?.version ?? releaseVersion, commerciallyApproved: true } });
  };
  const scheduleOnboarding = async ({ description, customerId, version }: { description: string; customerId: string; version: string }) => {
    const cleanClientId = customerId.replace(/\D/g, "");
    if (!/^\d{6}$/.test(cleanClientId)) { setClientIdError("Informe o ID do cliente com 6 números."); return false; }
    if (!version.trim()) return false;
    const type = agendaModule?.types.find((entry) => entry.active);
    const status = agendaModule?.statuses.find((entry) => entry.active);
    const responsible = agendaModule?.collaborators.find((entry) => entry.departmentId === activationCalendar?.departmentId);
    if (!activationCalendar || !type || !status || !responsible || !slot) return false;
    const startsAt = new Date(`${slotDate}T${slot}:00`).toISOString();
    const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString();
    const created = await onAgendaOperation({ action: "createAgendaCommitment", agendaId: activationCalendar.id, agendaTypeId: type.id, agendaStatusId: status.id, responsibleUserId: responsible.id, title: `Kick off (${version.trim()}) - ID: ${cleanClientId}`, description: description || `Kick off comercial de ${lead.customer || item.title}`, startsAt, endsAt, participantUserIds: [], recurrence: "none" }, "Kick off agendado com sucesso.");
    if (created) { await sendToOnboarding({ date: slotDate, time: slot, startsAt, commitmentId: created.id }, { clientId: cleanClientId, version: version.trim() }); return true; }
    return false;
  };
  const qualifyAndCopy = async () => {
    const target = crmFunnels.find((entry) => entry.entry.id === targetFunnelId);
    const targetStage = target?.details.stages?.find((entry) => entry.name.trim())?.name;
    if (!target || !targetStage) return;
    const now = new Date().toISOString(); const note = { type: "Qualificação", text: `Lead qualificado e enviado para ${target.entry.name}.`, createdAt: now };
    const copy = { ...lead, qualification: "qualified" as const, funnel: target.entry.name, stage: targetStage, follows: [...lead.follows, note] };
    const created = await onAgendaOperation({ action: "createWorkItem", module: "commercial", recordType: commercialRecordType("crm"), title: item.title, customerName: lead.customer || item.customer_name, owner: lead.seller || item.owner, team: item.team || "Comercial", priority: item.priority || "P3", amountCents: item.amount_cents, description: JSON.stringify(copy) }, "Lead enviado para o CRM.");
    if (created) { await saveLead({ ...lead, qualification: "qualified", stage: qualifiedStage, follows: [...lead.follows, note] }); onClose(); }
  };
  const confirmLoss = async () => { if (!lossReason) return; const label = flow === "qualification" ? "desqualificado" : "perdido"; const result = await saveLead({ ...lead, stage: flow === "qualification" ? "Desqualificado" : lostStage, qualification: flow === "qualification" ? "disqualified" : lead.qualification, comments: [...lead.comments, { text: `Motivo ${label}: ${lossReason}`, createdAt: new Date().toISOString() }] }); if (result) setLossPrompt(false); };
  const transferLead = async () => {
    if (!transferFunnel || !transferStage) return;
    const previousFunnel = lead.funnel || funnel?.name || "funil anterior";
    const targetFlow: CommercialFlow = transferFunnel.details.functionality === commercialFlowLabel("retention") ? "retention" : "crm";
    const next = { ...lead, funnel: transferFunnel.entry.name, stage: transferStage, follows: [...lead.follows, { type: "Transferência de CRM", text: `Card transferido de ${previousFunnel} para ${commercialFlowLabel(targetFlow)} · ${transferFunnel.entry.name}, na etapa ${transferStage}.`, createdAt: new Date().toISOString() }] };
    const moved = await onSave({ recordType: commercialRecordType(targetFlow), description: JSON.stringify(next) });
    if (moved) onClose();
  };
  if (flow === "retention") return <><RetentionLeadDetail item={item} lead={lead} stages={stages.length ? stages : defaultRetentionStages} catalogs={catalogs} busy={busy} canEdit={canEdit} canDelete={canDelete} onClose={onClose} onEdit={() => setEditing(true)} onDelete={onDelete} onMove={async (stage) => { await saveLead({ ...lead, stage, follows: [...lead.follows, { type: "Movimentação", text: `Cliente movido para ${stage}.`, createdAt: new Date().toISOString(), author: lead.seller || item.owner }] }); }} onSave={saveLead} onSendToOnboarding={async () => { await sendToOnboarding(undefined, { clientId: lead.clientId || clientId, version: lead.version || releaseVersion }); }} />{editing && <RetentionLeadEditModal item={item} lead={lead} busy={busy} onClose={() => setEditing(false)} onSave={async (payload) => { const saved = await onSave({ ...payload, requireConfirmation: true }); if (saved) setEditing(false); return saved; }} />}</>;
  return <div className="drawer-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><aside className="drawer commercial-lead-drawer"><header className="drawer-head simple"><div><span className="eyebrow">{commercialFlowLabel(flow)} · {lead.stage || "Sem etapa"}</span><h2>{item.title}</h2><p>{lead.customer || "Lead sem cliente vinculado"}</p></div><div className="lead-header-actions"><button className="secondary-button commercial-copy-link" type="button" onClick={() => void copyLeadLink()}><ClipboardCheck size={15} /> {linkCopied ? "Link copiado" : "Copiar link"}</button><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div></header><div className="commercial-lead-drawer-content">
    <section className="lead-summary-grid"><div><span>Contato</span><strong>{lead.phone || "Não informado"}</strong><small>{lead.source || "Origem não definida"}</small></div><div><span>Responsável</span><strong>{lead.seller || item.owner || "Não definido"}</strong><small>{lead.temperature || "Sem temperatura"}</small></div><div><span>Valor estimado</span><strong>{item.amount_cents ? formatMoney(item.amount_cents) : "—"}</strong><small>Score {"★".repeat(lead.score || 0) || "—"}</small></div>{lead.onboarding?.clientId && <div className="lead-client-id-summary"><span>ID do cliente</span><strong>{lead.onboarding.clientId}</strong><button type="button" onClick={() => void navigator.clipboard?.writeText(lead.onboarding?.clientId ?? "")}>Copiar ID</button></div>}</section>
    <section className="lead-drawer-section lead-labels-section"><div className="panel-header"><div><span className="eyebrow">ETIQUETAS</span><h3>Classificar lead</h3><p>As etiquetas selecionadas ficam visíveis no card.</p></div><button type="button" className="secondary-button" disabled={!canEdit || busy || labelCatalogs.length === 0} onClick={() => setLabelPicker(true)}><Plus size={15} /> Selecionar etiquetas</button></div>{lead.labels.length > 0 && <div className="selected-label-list">{lead.labels.map((label) => <span key={label} style={{ "--label-color": commercialLabelColor(label) } as CSSProperties}><i />{label}</span>)}</div>}</section>
    {flow === "qualification" && <section className="lead-drawer-section commercial-outcome-section"><span className="eyebrow">VALIDAÇÃO</span><h3>Qualificação do lead</h3>{!qualifying && !lossPrompt ? <div className="drawer-actions"><button className="secondary-button danger-action" disabled={!canEdit || busy} onClick={() => setLossPrompt(true)}>Desqualificado</button><button className="primary-button" disabled={!canEdit || busy} onClick={() => setQualifying(true)}>Qualificado (com envio para CRM)</button></div> : qualifying ? <div className="lead-control-grid"><label className="wide">Enviar para o CRM<select value={targetFunnelId} onChange={(event) => setTargetFunnelId(event.target.value)}><option value="">Selecione o CRM</option>{crmFunnels.map(({ entry }) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><div className="drawer-actions wide"><button className="secondary-button" onClick={() => setQualifying(false)}>Cancelar</button><button className="primary-button" disabled={!targetFunnelId || busy} onClick={() => void qualifyAndCopy()}>Enviar para o CRM</button></div></div> : null}</section>}
    {(flow === "crm" || lossPrompt) && <section className="lead-drawer-section commercial-outcome-section">{flow === "crm" && !lossPrompt && <><span className="eyebrow">RESULTADO COMERCIAL</span><h3>Fechar oportunidade</h3><div className="drawer-actions"><button className="primary-button" disabled={!canEdit || busy} onClick={() => setShowOnboarding(true)}>Ganho</button><button className="secondary-button danger-action" disabled={!canEdit || busy} onClick={() => setLossPrompt(true)}>Perdido</button></div></>}{lossPrompt && <div className="lead-control-grid"><label className="wide">Motivo da perda<select value={lossReason} onChange={(event) => setLossReason(event.target.value)}><option value="">Selecione o motivo</option>{lossReasons.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select>{lossReasons.length === 0 && <small>Cadastre os motivos em Comercial › Configuração › Motivos de perda.</small>}</label><div className="drawer-actions wide"><button className="secondary-button" onClick={() => setLossPrompt(false)}>Cancelar</button><button className="secondary-button danger-action" disabled={!lossReason || busy} onClick={() => void confirmLoss()}>Confirmar perda</button></div></div>}</section>}
    {flow === "crm" && showOnboarding && <section className="lead-drawer-section commercial-onboarding-box"><span className="eyebrow">ENCAMINHAMENTO</span><h3>Direcionar acompanhamento</h3><div className="commercial-routing-grid"><label className="commercial-followup-track">Tipo de acompanhamento *<select value={followUpTrack} onChange={(event) => { setFollowUpTrack(event.target.value as FollowUpTrack); setSlot(""); }}><option value="activation">Acompanhamento Ativação</option><option value="retention">Acompanhamento Retenção</option><option value="lia">Acompanhamento LIA</option></select></label><label>ID do cliente *<input inputMode="numeric" maxLength={6} value={clientId} onChange={(event) => setClientId(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" /></label><label>Versão *<input value={releaseVersion} onChange={(event) => setReleaseVersion(event.target.value)} placeholder="Ex.: Essencial" /></label></div><p>{lead.onboarding?.status === "scheduled" ? `Agendado para ${lead.onboarding.date} às ${lead.onboarding.time}.` : "Selecione o destino e reserve um horário para encaminhar o cliente à fila correta."}</p><div className="drawer-actions"><button className="secondary-button" disabled={busy || !clientId || !releaseVersion} onClick={() => void sendToOnboarding(undefined, { clientId, version: releaseVersion })}>Enviar sem agendamento</button><button className="primary-button" disabled={busy} onClick={() => setCheckingSlots(true)}>Verificar horários disponíveis</button></div>{checkingSlots && <div className="commercial-schedule-controls"><label>Data disponível a partir de amanhã<input type="date" min={entryDate} value={slotDate} onChange={(event) => { setSlotDate(event.target.value); setSlot(""); }} /></label><div><span>Horários disponíveis (segunda a sexta)</span><div className="commercial-slot-list">{availableSlots.map((candidate) => <button type="button" key={candidate} className={slot === candidate ? "selected" : ""} onClick={() => setSlot(candidate)}>{candidate}</button>)}</div>{availableSlots.length === 0 && <small>Não há vaga neste dia útil. Veja os horários sugeridos nos próximos cinco dias úteis.</small>}</div><div className="commercial-next-slots"><span>Próximos 5 dias úteis</span>{nextAvailableDays.map((day) => <div key={day.date}><b>{new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(`${day.date}T12:00:00`))}</b>{day.slots.length ? day.slots.map((candidate) => <button type="button" key={candidate} onClick={() => { setSlotDate(day.date); setSlot(candidate); }}>{candidate}</button>) : <small>Sem vagas</small>}</div>)}</div>{slot && <button type="button" className="primary-button" disabled={busy} onClick={() => setShowScheduleModal(true)}>Agendar e enviar</button>}</div>}</section>}
    {(canEdit || canDelete) && <section className={`lead-drawer-section commercial-drawer-management${showTransfer ? " transfer-open" : ""}`}><div><span className="eyebrow">GESTÃO DA OPORTUNIDADE</span><h3>Editar ou excluir lead</h3><p>As ações permanecem disponíveis para os usuários autorizados.</p></div><div className="drawer-actions">{canEdit && <button className="secondary-button commercial-transfer-trigger" type="button" aria-expanded={showTransfer} onClick={() => setShowTransfer((current) => !current)}><ArrowRightLeft size={15} /> Transferir CRM</button>}{canEdit && <button className="secondary-button" onClick={() => setEditing(true)}><Pencil size={15} /> Editar</button>}{canDelete && <button className="secondary-button danger-action" disabled={busy} onClick={() => void onDelete()}><Trash2 size={15} /> Excluir</button>}</div>{showTransfer && <div className="commercial-transfer-controls"><label>CRM / funil de destino<select value={transferFunnelId} onChange={(event) => setTransferFunnelId(event.target.value)}><option value="">Selecionar CRM</option>{transferableFunnels.map(({ entry, details: targetDetails }) => <option key={entry.id} value={entry.id}>{targetDetails.functionality} · {entry.name}</option>)}</select></label><label>Etapa de destino<select value={transferStage} disabled={!transferFunnelId} onChange={(event) => setTransferStage(event.target.value)}><option value="">Selecionar etapa</option>{transferStages.map((entry) => <option key={entry.name} value={entry.name}>{entry.name}</option>)}</select></label><button type="button" className="primary-button" disabled={busy || !transferFunnelId || !transferStage} onClick={() => void transferLead()}>Confirmar transferência <ChevronRight size={16} /></button></div>}</section>}
    <section className="lead-drawer-section"><span className="eyebrow">INTERAÇÕES</span><h3>Follow-up e comentários</h3><div className="lead-control-grid"><label>Tipo de follow-up<select value={followType} onChange={(event) => setFollowType(event.target.value)}><option value="">Selecionar</option>{followTypes.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label><label>Nova etapa<select defaultValue={lead.stage} id={`lead-stage-${item.id}`}>{stages.map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></label></div><label>Registrar follow-up<textarea value={followText} onChange={(event) => setFollowText(event.target.value)} rows={3} placeholder="Registre o que aconteceu e o próximo passo." /></label><div className="drawer-actions"><button className="primary-button" disabled={!followText.trim() || busy} onClick={() => { const nextStage = (document.getElementById(`lead-stage-${item.id}`) as HTMLSelectElement | null)?.value ?? lead.stage; void saveLead({ ...lead, stage: nextStage, follows: [...lead.follows, { type: followType || "Atualização", text: followText.trim(), createdAt: new Date().toISOString() }] }); }}>Registrar follow-up</button></div><label>Comentário interno<textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} rows={3} placeholder="Adicione uma observação para o histórico." /></label><div className="drawer-actions"><button className="secondary-button" disabled={!commentText.trim() || busy} onClick={() => void saveLead({ ...lead, comments: [...lead.comments, { text: commentText.trim(), createdAt: new Date().toISOString() }] })}><MessageSquareText size={15} /> Adicionar comentário</button></div>{[...lead.follows.map((entry) => ({ ...entry, kind: "Follow-up" })), ...lead.comments.map((entry) => ({ ...entry, kind: "Comentário" }))].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((entry, index) => <article className="lead-history-item" key={`${entry.createdAt}-${index}`}><strong>{entry.kind}{entry.type ? ` · ${entry.type}` : ""}</strong><time>{dateTime(entry.createdAt)}</time><p>{entry.text}</p></article>)}</section>
  </div>{labelPicker && <LeadLabelPicker selected={lead.labels} labels={labelCatalogs} busy={busy} onClose={() => setLabelPicker(false)} onChange={(labels) => { void saveLead({ ...lead, labels }).then((saved) => { if (saved) setLabelPicker(false); }); }} />}{showScheduleModal && slot && activationCalendar && <CommercialAgendaScheduleModal calendarName={activationCalendar.name} date={slotDate} time={slot} initialClientId={clientId} initialVersion={releaseVersion} busy={busy} onClose={() => setShowScheduleModal(false)} onConfirm={async (details) => { setClientId(details.clientId); setReleaseVersion(details.version); const saved = await scheduleOnboarding({ description: details.description, customerId: details.clientId, version: details.version }); if (saved) { setShowScheduleModal(false); onClose(); } }} />}{editing && <CommercialLeadEditModal item={item} lead={lead} catalogs={catalogs} stages={stages} busy={busy} onClose={() => setEditing(false)} onSave={async (payload) => { const saved = await onSave({ ...payload, requireConfirmation: true }); if (saved) setEditing(false); return saved; }} />}</aside></div>;
}

type RetentionConfigTab = "stages" | "comments" | "statuses" | "versions";

function RetentionCrmSettings({ catalogs, funnel, leads, busy, onClose, operate }: { catalogs: CustomerCatalogOption[]; funnel?: { entry: CustomerCatalogOption; details: CommercialDetails }; leads: WorkItem[]; busy: boolean; onClose: () => void; operate: (payload: Record<string, unknown>, success: string) => Promise<OperationResult> }) {
  const initialStages = funnel?.details.stages?.length ? funnel.details.stages : defaultRetentionStages;
  const [tab, setTab] = useState<RetentionConfigTab>("stages");
  const [stages, setStages] = useState<NonNullable<CommercialDetails["stages"]>>(initialStages.map((stage) => ({ ...stage })));
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");
  const definitions: Record<Exclude<RetentionConfigTab, "stages">, { catalog: string; label: string; placeholder: string; color: boolean }> = {
    comments: { catalog: "retentionCommentType", label: "Novo tipo de comentário", placeholder: "Ex.: Ligação, E-mail, Visita...", color: false },
    statuses: { catalog: "retentionStatus", label: "Novo status", placeholder: "Ex.: Em dia, Atrasado, Prioritário...", color: true },
    versions: { catalog: "retentionVersion", label: "Nova versão", placeholder: "Ex.: Ultra, Maxi, Essencial...", color: false },
  };
  const currentDefinition = tab === "stages" ? null : definitions[tab];
  const currentEntries = currentDefinition ? catalogs.filter((entry) => entry.catalog === currentDefinition.catalog) : [];
  const addCatalogEntry = async () => {
    if (!currentDefinition || !newName.trim()) return;
    const description = currentDefinition.color ? JSON.stringify({ color: newColor }) : "";
    const result = await operate({ action: "saveCustomerCatalog", catalog: currentDefinition.catalog, name: newName.trim(), catalogDescription: description, active: true }, `${tab === "comments" ? "Tipo de comentário" : tab === "statuses" ? "Status" : "Versão"} adicionado com sucesso.`);
    if (result) setNewName("");
  };
  const removeCatalogEntry = async (entry: CustomerCatalogOption) => {
    if (!window.confirm(`Excluir \"${entry.name}\"?`)) return;
    await operate({ action: "deleteCustomerCatalog", id: entry.id }, "Opção excluída com sucesso.");
  };
  const addStage = () => {
    if (!newName.trim()) return;
    setStages((current) => [...current, { name: newName.trim(), color: newColor, won: false, lost: false, automation: false }]);
    setNewName("");
  };
  const removeStage = (index: number) => {
    const stage = stages[index];
    const isUsed = leads.some((item) => parseCommercialLead(item.description)?.stage === stage.name);
    if (isUsed && !window.confirm(`A etapa \"${stage.name}\" possui clientes. Excluir mesmo assim?`)) return;
    setStages((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };
  const saveStages = async () => {
    if (!stages.length || stages.some((stage) => !stage.name.trim())) return;
    const normalizedStages = stages.map((stage, order) => {
      const normalized = stage.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
      return { ...stage, name: stage.name.trim(), won: stage.won || (/concluido|sucesso/.test(normalized) && !/sem sucesso/.test(normalized)), lost: stage.lost || /sem sucesso|perdido|cancelado/.test(normalized) };
    });
    const realFunnel = funnel?.entry.id && funnel.entry.id !== "retention-default";
    const result = await operate({ action: "saveCustomerCatalog", ...(realFunnel ? { id: funnel?.entry.id } : {}), catalog: "funnelStage", name: funnel?.entry.name || "CRM Retenção", catalogDescription: JSON.stringify({ f: "r", s: normalizedStages.map((stage) => [stage.name, stage.color, Boolean(stage.won), Boolean(stage.lost), Boolean(stage.automation), stage.alertDays || 1]) }), active: true }, "Etapas do CRM Retenção atualizadas com sucesso.");
    if (result) onClose();
  };
  const chooseTab = (next: RetentionConfigTab) => { setTab(next); setNewName(""); setNewColor("#3b82f6"); };
  return <div className="modal-backdrop retention-settings-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="modal retention-settings-modal" role="dialog" aria-modal="true" aria-label="Configurar funil CRM Retenção">
    <header><div><span className="eyebrow">CONFIGURAÇÃO</span><h2>Configurar Funil CRM</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={19}/></button></header>
    <nav className="retention-settings-tabs" aria-label="Seções da configuração"><button type="button" className={tab === "stages" ? "active" : ""} onClick={() => chooseTab("stages")}>Etapas</button><button type="button" className={tab === "comments" ? "active" : ""} onClick={() => chooseTab("comments")}>Comentários</button><button type="button" className={tab === "statuses" ? "active" : ""} onClick={() => chooseTab("statuses")}>Status</button><button type="button" className={tab === "versions" ? "active" : ""} onClick={() => chooseTab("versions")}>Versões</button></nav>
    {tab === "stages" ? <div className="retention-settings-content"><label>Nova etapa</label><div className="retention-settings-create"><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nome da etapa" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addStage(); } }} /><label className="retention-color-field">Cor<input type="color" value={newColor} onChange={(event) => setNewColor(event.target.value)} /></label><button className="primary-button" type="button" disabled={!newName.trim()} onClick={addStage}><Plus size={17}/></button></div><div className="retention-settings-list">{stages.map((stage, index) => <article key={`${stage.name}-${index}`}><span className="retention-stage-order">{index + 1}.</span><input type="color" aria-label={`Cor de ${stage.name}`} value={stage.color || "#3b82f6"} onChange={(event) => setStages((current) => current.map((entry, currentIndex) => currentIndex === index ? { ...entry, color: event.target.value } : entry))} /><input aria-label={`Nome da etapa ${index + 1}`} value={stage.name} onChange={(event) => setStages((current) => current.map((entry, currentIndex) => currentIndex === index ? { ...entry, name: event.target.value } : entry))} /><button className="retention-settings-delete" type="button" onClick={() => removeStage(index)} aria-label={`Excluir ${stage.name}`}><Trash2 size={15}/></button></article>)}</div></div> : currentDefinition && <div className="retention-settings-content"><label>{currentDefinition.label}</label><div className="retention-settings-create"><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={currentDefinition.placeholder} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addCatalogEntry(); } }} />{currentDefinition.color && <label className="retention-color-field">Cor<input type="color" value={newColor} onChange={(event) => setNewColor(event.target.value)} /></label>}<button className="primary-button retention-settings-add" type="button" disabled={!newName.trim() || busy} onClick={() => void addCatalogEntry()}><Plus size={16}/> Adicionar</button></div><div className="retention-settings-list">{currentEntries.length ? currentEntries.map((entry) => { const color = commercialDetails(entry.description).color || "#3b82f6"; return <article key={entry.id}>{currentDefinition.color && <i className="retention-config-swatch" style={{ background: color }}/>}<strong>{entry.name}</strong><span className={entry.active ? "retention-active-label" : "retention-inactive-label"}>{entry.active ? "Ativo" : "Inativo"}</span><button className="retention-settings-delete" type="button" disabled={busy} onClick={() => void removeCatalogEntry(entry)} aria-label={`Excluir ${entry.name}`}><Trash2 size={15}/></button></article>; }) : <EmptyState compact text="Nenhuma opção cadastrada." />}</div></div>}
    <footer><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>{tab === "stages" ? <button type="button" className="primary-button" disabled={busy || !stages.length} onClick={() => void saveStages()}><Save size={15}/> Concluir</button> : <button type="button" className="primary-button" onClick={onClose}>Concluir</button>}</footer>
  </section></div>;
}

function RetentionLeadDetail({ item, lead, stages, catalogs, busy, canEdit, canDelete, onClose, onEdit, onDelete, onMove, onSave, onSendToOnboarding }: { item: WorkItem; lead: CommercialLead; stages: NonNullable<CommercialDetails["stages"]>; catalogs: CustomerCatalogOption[]; busy: boolean; canEdit: boolean; canDelete: boolean; onClose: () => void; onEdit: () => void; onDelete: () => Promise<void>; onMove: (stage: string) => Promise<void>; onSave: (lead: CommercialLead) => Promise<OperationResult>; onSendToOnboarding: () => Promise<void> }) {
  const commentTypes = catalogs.filter((entry) => entry.active && entry.catalog === "retentionCommentType");
  const temperatures = catalogs.filter((entry) => entry.active && entry.catalog === "temperature");
  const statuses = catalogs.filter((entry) => entry.active && entry.catalog === "retentionStatus");
  const [type, setType] = useState("");
  const [text, setText] = useState("");
  const [temperature, setTemperature] = useState(lead.temperature || "");
  const history = [...lead.follows.map((entry) => ({ ...entry, kind: entry.type || "Tratativa" })), ...lead.comments.map((entry) => ({ ...entry, kind: entry.type || "Comentário" }))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const statusColor = commercialDetails(statuses.find((entry) => entry.name === lead.retentionStatus)?.description ?? "").color || stages.find((entry) => entry.name === lead.stage)?.color || "var(--primary)";
  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim() || !type) return;
    const next = { ...lead, temperature, comments: [...lead.comments, { type, text: text.trim(), temperature, author: lead.seller || item.owner, createdAt: new Date().toISOString() }] };
    const saved = await onSave(next); if (saved) setText("");
  };
  return <div className="retention-detail-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="retention-detail-page">
    <header><div><span className="retention-detail-dot" style={{ background: statusColor }} /><h2>Cliente #{lead.clientId || item.title}</h2><small>· {lead.stage || "Sem etapa"}</small></div><div>{canEdit && <button type="button" className="icon-button" onClick={onEdit} title="Editar cliente"><Pencil size={16} /></button>}{canDelete && <button type="button" className="icon-button danger-action" onClick={() => void onDelete()} title="Excluir cliente"><Trash2 size={16} /></button>}<button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div></header>
    <div className="retention-detail-grid"><main>
      <section className="retention-detail-panel"><span className="eyebrow">INFORMAÇÕES DO CLIENTE</span><dl><div><dt>ID</dt><dd>#{lead.clientId || "Não informado"}</dd></div><div><dt>Razão social</dt><dd>{lead.customer || item.title}</dd></div><div><dt>Contato</dt><dd>{lead.phone || "Não informado"}</dd></div><div><dt>Data de cadastro</dt><dd>{lead.entryDate ? shortDate(lead.entryDate) : shortDate(item.created_at)}</dd></div><div><dt>Versão</dt><dd><b>{lead.version || "Não informada"}</b></dd></div><div><dt>Responsável</dt><dd><UserRound size={13}/>{lead.seller || item.owner}</dd></div><div><dt>Status</dt><dd>{lead.retentionStatus || "Não definido"}</dd></div><div><dt>Temperatura</dt><dd>{lead.temperature || "Não definida"}</dd></div></dl></section>
      <section className="retention-detail-panel"><span className="eyebrow">MOVER ENTRE ETAPAS</span><div className="retention-stage-actions">{stages.map((stage) => <button type="button" key={stage.name} className={lead.stage === stage.name ? "active" : ""} style={{ "--stage-color": stage.color } as CSSProperties} disabled={!canEdit || busy || lead.stage === stage.name} onClick={() => void onMove(stage.name)}>{stage.name}</button>)}</div></section>
      <section className="retention-forward-panel"><span className="eyebrow"><UserPlus size={14}/> ENCAMINHAMENTO</span><p>Encaminhe este cliente para o Onboarding Retenção preservando ID, versão, responsável e histórico.</p><button className="primary-button" type="button" disabled={!canEdit || busy || !/^\d{6}$/.test(lead.clientId || "") || !lead.version || Boolean(lead.onboarding)} onClick={() => void onSendToOnboarding()}><UserPlus size={15}/>{lead.onboarding ? "Cliente já encaminhado" : "Encaminhar para Onboarding Retenção"}</button></section>
      <form className="retention-comment-form retention-detail-panel" onSubmit={(event) => void submitComment(event)}><span className="eyebrow"><MessageSquareText size={14}/> ADICIONAR COMENTÁRIO</span><label>Tipo *<select required value={type} onChange={(event) => setType(event.target.value)}><option value="">Selecione o tipo</option>{commentTypes.length ? commentTypes.map((entry) => <option key={entry.id}>{entry.name}</option>) : ["Análise", "Comentário", "Ligação", "WhatsApp", "E-mail"].map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Comentário *<textarea required rows={4} value={text} onChange={(event) => setText(event.target.value)} placeholder="Digite o comentário..." /></label><fieldset><legend>Temperatura do cliente</legend><div>{(temperatures.length ? temperatures.map((entry) => entry.name) : ["Frio", "Morno", "Quente"]).map((entry) => <label key={entry}><input type="radio" name="retention-temperature" value={entry} checked={temperature === entry} onChange={() => setTemperature(entry)} /><i />{entry}</label>)}</div></fieldset><button className="primary-button" disabled={!canEdit || busy || !type || !text.trim()}>Registrar comentário</button></form>
    </main><aside><span className="eyebrow">HISTÓRICO DE TRATATIVAS ({history.length})</span><div className="retention-history-list">{history.length ? history.map((entry, index) => <article key={`${entry.createdAt}-${index}`}><header><b>{entry.kind}</b><time><CalendarDays size={12}/>{dateTime(entry.createdAt)}</time></header><p>{entry.text}</p><footer><span className={`retention-history-temperature ${(entry.temperature || lead.temperature || "").toLocaleLowerCase("pt-BR")}`}><i />{entry.temperature || lead.temperature || "Sem temperatura"}</span><small>por {entry.author || lead.seller || item.owner}</small></footer></article>) : <div className="empty-state"><MessageSquareText/><strong>Nenhuma tratativa registrada.</strong></div>}</div></aside></div>
  </section></div>;
}

function RetentionStatusPanel({ lead, catalogs, canEdit, busy, onSave }: { lead: CommercialLead; catalogs: CustomerCatalogOption[]; canEdit: boolean; busy: boolean; onSave: (lead: CommercialLead) => Promise<OperationResult> }) {
  const statuses = catalogs.filter((entry) => entry.active && entry.catalog === "retentionStatus");
  const flags = catalogs.filter((entry) => entry.active && entry.catalog === "retentionFlag");
  const [status, setStatus] = useState(lead.retentionStatus || "");
  const [marks, setMarks] = useState(lead.retentionMarks || []);
  const changed = status !== (lead.retentionStatus || "") || JSON.stringify([...marks].sort()) !== JSON.stringify([...(lead.retentionMarks || [])].sort());
  return <section className="lead-drawer-section retention-status-panel"><div className="panel-header"><div><span className="eyebrow">CRM RETENÇÃO</span><h3>Status e marcações</h3></div>{canEdit && <button className="primary-button" disabled={!changed || busy} onClick={() => void onSave({ ...lead, retentionStatus: status, retentionMarks: marks })}><Save size={15} /> Salvar</button>}</div><div className="retention-status-controls"><label>Status<select disabled={!canEdit} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Selecionar status</option>{status && !statuses.some((entry) => entry.name === status) && <option>{status}</option>}{statuses.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label><div className="retention-mark-options"><span>Marcações</span>{flags.length ? flags.map((flag) => <label key={flag.id}><input type="checkbox" disabled={!canEdit} checked={marks.includes(flag.name)} onChange={() => setMarks((current) => current.includes(flag.name) ? current.filter((entry) => entry !== flag.name) : [...current, flag.name])} />{flag.name}</label>) : <small>Cadastre as opções em Configurações › Comercial › Marcações da retenção.</small>}</div></div></section>;
}

function RetentionLeadEditModal({ item, lead, busy, onClose, onSave }: { item: WorkItem; lead: CommercialLead; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<OperationResult> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const company = String(form.get("company") || "").trim(); const next: CommercialLead = { ...lead, clientId: String(form.get("clientId") || "").trim(), customer: company, entryDate: String(form.get("entryDate") || ""), version: String(form.get("version") || "").trim(), phone: String(form.get("phone") || "").trim() }; void onSave({ title: company, customerName: company, description: JSON.stringify(next) }); };
  return <ModalShell title="Editar cliente · CRM Retenção" subtitle="Atualize os dados cadastrais sem perder o histórico do card." onClose={onClose}><form className="form-grid commercial-lead-form" onSubmit={submit}><label>ID *<input name="clientId" required inputMode="numeric" maxLength={6} pattern="[0-9]{6}" defaultValue={lead.clientId || lead.onboarding?.clientId || ""} /></label><label>Razão social *<input name="company" required defaultValue={lead.customer || item.title} /></label><label>Data de cadastro *<input name="entryDate" type="date" required defaultValue={lead.entryDate || item.created_at.slice(0, 10)} /></label><label>Versão *<input name="version" required defaultValue={lead.version || lead.onboarding?.version || ""} /></label><label>WhatsApp *<input name="phone" required type="tel" defaultValue={lead.phone} /></label><label>Responsável<input readOnly value={lead.seller || item.owner} /></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={busy}><Save size={16} /> Salvar alterações</button></div></form></ModalShell>;
}

function CommercialAgendaScheduleModal({ calendarName, date, time, initialClientId, initialVersion, busy, onClose, onConfirm }: { calendarName: string; date: string; time: string; initialClientId: string; initialVersion: string; busy: boolean; onClose: () => void; onConfirm: (details: { description: string; clientId: string; version: string }) => Promise<void> }) {
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState(initialClientId);
  const [version, setVersion] = useState(initialVersion);
  const valid = /^\d{6}$/.test(clientId.replace(/\D/g, "")) && Boolean(version.trim());
  return <ModalShell title="Agendar e enviar para Onboarding" subtitle={`${calendarName} · ${date} às ${time}`} onClose={onClose}><div className="form-grid"><label>Versão *<input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="Ex.: Essencial" /></label><label>ID do cliente *<input inputMode="numeric" maxLength={6} value={clientId} onChange={(event) => setClientId(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" /></label><label className="wide">Descrição do compromisso<textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Adicione os detalhes para a agenda." /></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || !valid} onClick={() => void onConfirm({ description, clientId, version })}><Save size={15} /> Agendar e enviar</button></div></div></ModalShell>;
}

function CommercialLeadDrawerLegacy({ item, catalogs, agendaModule, funnels, funnel, details, busy, canEdit, canDelete, startEditing, startLossReason, onClose, onSave, onAgendaOperation, onDelete }: { item: WorkItem; catalogs: CustomerCatalogOption[]; agendaModule: AgendaModuleData | null; funnels: Array<{ entry: CustomerCatalogOption; details: CommercialDetails }>; funnel?: CustomerCatalogOption; details?: CommercialDetails; busy: boolean; canEdit: boolean; canDelete: boolean; startEditing: boolean; startLossReason: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<OperationResult>; onAgendaOperation: (payload: Record<string, unknown>, success: string) => Promise<OperationResult>; onDelete: () => Promise<void> }) {
  const lead = parseCommercialLead(item.description) ?? { kind: "commercialLead", phone: "", source: "", seller: item.owner, funnel: funnel?.name ?? "", stage: "", temperature: "", labels: [], products: [], score: 0, entryDate: "", customer: item.customer_name, follows: [], comments: [] };
  const [followText, setFollowText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [editing, setEditing] = useState(startEditing);
  const stages = details?.stages?.filter((entry) => entry.name.trim()) ?? [];
  const followTypes = catalogs.filter((entry) => entry.catalog === "followUpType");
  const labelCatalogs = catalogs.filter((entry) => entry.catalog === "commercialLabel");
  const [stage, setStage] = useState(lead.stage);
  const flow: CommercialFlow = item.record_type === commercialRecordType("qualification") ? "qualification" : "crm";
  const [showQualification, setShowQualification] = useState(false);
  const [showLossReason, setShowLossReason] = useState(startLossReason);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [lossReason, setLossReason] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [targetFunnelId, setTargetFunnelId] = useState("");
  const minimumScheduleDate = useMemo(() => {
    const base = lead.entryDate ? new Date(`${lead.entryDate}T12:00:00`) : new Date(item.created_at);
    base.setDate(base.getDate() + 1);
    return base.toISOString().slice(0, 10);
  }, [item.created_at, lead.entryDate]);
  const [slotDate, setSlotDate] = useState(minimumScheduleDate);
  const [slot, setSlot] = useState("");
  const [scheduleMessage, setScheduleMessage] = useState("");
  const crmFunnels = funnels.filter((entry) => entry.details.functionality === commercialFlowLabel("crm"));
  const lossReasons = catalogs.filter((entry) => entry.catalog === "lossReason");
  const wonStage = stages.find((entry) => entry.won)?.name ?? stages.find((entry) => /ganho|conclu/i.test(entry.name))?.name ?? lead.stage;
  const lostStage = stages.find((entry) => entry.lost)?.name ?? stages.find((entry) => /perd/i.test(entry.name))?.name ?? lead.stage;
  const activationCalendar = agendaModule?.calendars.find((calendar) => `${calendar.name} ${calendar.departmentName}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("sucesso do cliente ativacao"));
  const slotOptions = ["09:30", "11:00", "14:00", "16:00"];
  const availableSlots = slotOptions.filter((option) => {
    if (!activationCalendar || !agendaModule || slotDate < minimumScheduleDate) return false;
    const appointments = agendaModule.commitments.filter((commitment) => commitment.agendaId === activationCalendar.id && new Date(commitment.startsAt).toISOString().slice(0, 10) === slotDate && new Date(commitment.startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false }) === option);
    return appointments.length < 2 && !appointments.some((commitment) => /bloquead/i.test(commitment.statusName));
  });
  const saveLead = async (next: CommercialLead) => { const result = await onSave({ description: JSON.stringify(next) }); if (result) { setFollowText(""); setCommentText(""); } return result; };
  const qualifiedStage = stages.find((entry) => /qualificado|conclu/i.test(entry.name))?.name ?? "Qualificado";
  const sendQualifiedCopyToCrm = async () => {
    const target = crmFunnels.find((entry) => entry.entry.id === targetFunnelId);
    const targetStage = target?.details.stages?.find((entry) => entry.name.trim())?.name;
    if (!target || !targetStage) return;
    const now = new Date().toISOString();
    const note = { type: "Qualificação", text: `Lead qualificado e enviado para ${target.entry.name}.`, createdAt: now };
    const copy = { ...lead, qualification: "qualified" as const, funnel: target.entry.name, stage: targetStage, follows: [...lead.follows, note] };
    const copied = await onAgendaOperation({ action: "createWorkItem", module: "commercial", recordType: commercialRecordType("crm"), title: item.title, customerName: lead.customer || item.customer_name, owner: lead.seller || item.owner, team: item.team || "Comercial", priority: item.priority || "P3", amountCents: item.amount_cents, description: JSON.stringify(copy) }, "Lead enviado para o CRM.");
    if (copied) await saveLead({ ...lead, qualification: "qualified", stage: qualifiedStage, follows: [...lead.follows, note] });
  };
  return <div className="drawer-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><aside className="drawer commercial-lead-drawer"><header className="drawer-head simple"><div><span className="eyebrow">{commercialFlowLabel(item.record_type.includes("qualificação") ? "qualification" : "crm")} · {lead.stage || "Sem etapa"}</span><h2>{item.title}</h2><p>{lead.customer || "Lead sem cliente vinculado"}</p></div><div className="lead-header-actions">{canEdit && <button className="secondary-button" onClick={() => setEditing(true)}><Pencil size={15} /> Editar</button>}{canDelete && <button className="secondary-button danger-action" disabled={busy} onClick={() => void onDelete()}><Trash2 size={15} /> Excluir</button>}<button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div></header><div className="commercial-lead-drawer-content">
    <section className="lead-summary-grid"><div><span>Contato</span><strong>{lead.phone || "Não informado"}</strong><small>{lead.source || "Origem não definida"}</small></div><div><span>Responsável</span><strong>{lead.seller || item.owner || "Não definido"}</strong><small>{lead.temperature || "Sem temperatura"}</small></div><div><span>Valor estimado</span><strong>{item.amount_cents ? formatMoney(item.amount_cents) : "—"}</strong><small>Score {"★".repeat(lead.score || 0) || "—"}</small></div></section>
    <section className="lead-drawer-section lead-labels-section"><div className="panel-header"><div><span className="eyebrow">ETIQUETAS</span><h3>Classificar lead</h3><p>As etiquetas selecionadas ficam visíveis diretamente no card.</p></div><button type="button" className="secondary-button" disabled={!canEdit || busy || labelCatalogs.length === 0} onClick={() => setShowLabelPicker(true)}><Plus size={15} /> Selecionar etiquetas</button></div>{lead.labels.length > 0 && <div className="selected-label-list">{lead.labels.map((label) => <span key={label} style={{ "--label-color": commercialLabelColor(label) } as CSSProperties}><i />{label}</span>)}</div>}{labelCatalogs.length === 0 && <small>Cadastre etiquetas em Comercial › Configuração › Etiquetas.</small>}{showLabelPicker && <LeadLabelPicker selected={lead.labels} labels={labelCatalogs} busy={busy} onClose={() => setShowLabelPicker(false)} onChange={(labels) => { void saveLead({ ...lead, labels }).then((result) => { if (result) setShowLabelPicker(false); }); }} />}</section>
    {flow === "qualification" && <section className="lead-drawer-section commercial-outcome-section"><div className="panel-header"><div><span className="eyebrow">VALIDAÇÃO</span><h3>Qualificação do lead</h3></div></div>{!showQualification && !showLossReason ? <div className="drawer-actions"><button className="secondary-button danger-action" disabled={!canEdit || busy} onClick={() => setShowLossReason(true)}>Desqualificado</button><button className="primary-button" disabled={!canEdit || busy} onClick={() => setShowQualification(true)}>Qualificado (com envio para CRM)</button></div> : showLossReason ? <div className="lead-control-grid"><label className="wide">Motivo da perda<select value={lossReason} onChange={(event) => setLossReason(event.target.value)}><option value="">Selecione o motivo</option>{lossReasons.map((entry) => <option key={entry.id} value={entry.name}>{entry.name}</option>)}</select>{lossReasons.length === 0 && <small>Cadastre os motivos em Comercial › Configuração › Motivos de perda.</small>}</label><div className="drawer-actions wide"><button className="secondary-button" onClick={() => setShowLossReason(false)}>Cancelar</button><button className="secondary-button danger-action" disabled={!canEdit || busy || !lossReason} onClick={() => void saveLead({ ...lead, qualification: "disqualified", stage: "Desqualificado", comments: [...lead.comments, { text: `Motivo da perda: ${lossReason}`, createdAt: new Date().toISOString() }] })}>Confirmar desqualificação</button></div></div> : <div className="lead-control-grid"><label className="wide">Enviar para o CRM<select value={targetFunnelId} onChange={(event) => setTargetFunnelId(event.target.value)}><option value="">Selecione o CRM</option>{crmFunnels.map(({ entry }) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><div className="drawer-actions wide"><button className="secondary-button" onClick={() => setShowQualification(false)}>Cancelar</button><button className="primary-button" disabled={!canEdit || busy || !targetFunnelId} onClick={() => { const target = crmFunnels.find((entry) => entry.entry.id === targetFunnelId); const targetStage = target?.details.stages?.find((entry) => entry.name.trim())?.name; if (target && targetStage) void onSave({ recordType: commercialRecordType("crm"), description: JSON.stringify({ ...lead, qualification: "qualified", funnel: target.entry.name, stage: targetStage }) }).then((result) => { if (result) onClose(); }); }}>Enviar para o CRM</button></div></div>}</section>}
    {flow === "crm" && <section className="lead-drawer-section commercial-outcome-section"><div className="panel-header"><div><span className="eyebrow">RESULTADO COMERCIAL</span><h3>Fechar oportunidade</h3></div></div><div className="drawer-actions"><button className="primary-button" disabled={!canEdit || busy} onClick={() => { setStage(wonStage); setShowOnboarding(true); }}>Ganho</button><button className="secondary-button danger-action" disabled={!canEdit || busy} onClick={() => void saveLead({ ...lead, stage: lostStage })}>Perdido</button></div>{showOnboarding && <div className="commercial-onboarding-box"><strong>Valor convertido: {formatMoney(item.amount_cents)}</strong><p>Defina se o onboarding será encaminhado com ou sem um horário reservado.</p><div className="drawer-actions"><button className="secondary-button" disabled={!canEdit || busy} onClick={() => { const journey = { kind: "csJourney", phase: "validation", sourceLeadId: item.id, firstMeetingAt: "", trainingAt: "", rescheduledAt: "", follows: [] }; void onAgendaOperation({ action: "createWorkItem", module: "cs", recordType: "Onboarding", title: item.title, customerName: lead.customer || item.customer_name, owner: "Coordenação de CS", team: "Sucesso do Cliente", priority: "P3", amountCents: item.amount_cents, description: JSON.stringify(journey) }, "Cliente enviado para validação de Onboarding.").then((result) => { if (result) void saveLead({ ...lead, stage: wonStage, onboarding: { status: "sent", sentAt: new Date().toISOString() } }); }); }}>Encaminhar para Onboarding</button><button className="primary-button" type="button" onClick={() => setScheduleMessage("Selecione uma data e um dos horários disponíveis.")}>Verificar horários disponíveis</button></div>{scheduleMessage && <div className="commercial-schedule-controls"><label>Data<input type="date" value={slotDate} onChange={(event) => { setSlotDate(event.target.value); setSlot(""); }} /></label><div><span>Horários disponíveis</span><div className="commercial-slot-list">{availableSlots.map((option) => <button type="button" key={option} className={slot === option ? "selected" : ""} onClick={() => setSlot(option)}>{option}</button>)}</div>{availableSlots.length === 0 && <small>Não há vaga neste dia. Selecione outra data para ver horários próximos.</small>}</div>{slot && <button className="primary-button" disabled={busy || !canEdit} onClick={() => { const type = agendaModule?.types.find((entry) => entry.active); const status = agendaModule?.statuses.find((entry) => entry.active); const responsible = agendaModule?.collaborators.find((entry) => entry.departmentId === activationCalendar?.departmentId); if (!activationCalendar || !type || !status || !responsible) { setScheduleMessage("Configure agenda, tipo, status e colaborador ativo em Sucesso do Cliente Ativação."); return; } const startsAt = new Date(`${slotDate}T${slot}:00`).toISOString(); const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString(); void onAgendaOperation({ action: "createAgendaCommitment", agendaId: activationCalendar.id, agendaTypeId: type.id, agendaStatusId: status.id, responsibleUserId: responsible.id, title: `Kick off · ${item.title}`, description: `Kick off agendado pelo Comercial para ${lead.customer || item.title}`, startsAt, endsAt, participantUserIds: [], recurrence: "none" }, "Horário de onboarding reservado com sucesso.").then((result) => { if (result) void onAgendaOperation({ action: "createWorkItem", module: "cs", recordType: "Onboarding", title: item.title, customerName: lead.customer || item.customer_name, owner: "Coordenação de CS", team: "Sucesso do Cliente", priority: "P3", amountCents: item.amount_cents, description: JSON.stringify({ kind: "csJourney", phase: "validation", sourceLeadId: item.id, scheduledAt: startsAt, firstMeetingAt: startsAt, firstMeetingTime: slot, firstMeetingCommitmentId: result.id, status: "Pendente", follows: [{ kind: "Comercial", text: `Kick off agendado pelo Comercial para ${new Intl.DateTimeFormat("pt-BR").format(new Date(startsAt))} às ${slot}.`, createdAt: new Date().toISOString(), actor: lead.seller || item.owner }] }) }, "Cliente enviado para validação de Onboarding.").then((created) => { if (created) void saveLead({ ...lead, stage: wonStage, onboarding: { status: "scheduled", date: slotDate, time: slot, commitmentId: result.id, sentAt: new Date().toISOString() } }); }); }); }}>Marcar como agendado</button>}</div>}</div>}</section>}
    <section className="lead-drawer-section"><div className="panel-header"><div><span className="eyebrow">PRODUTOS</span><h3>Interesse do lead</h3></div></div>{lead.products.length === 0 ? <p>Nenhum produto vinculado.</p> : <div className="lead-products-drawer">{lead.products.map((product, index) => <div key={`${product.product}-${index}`}><span><strong>{product.product}</strong><small>{product.plan || "Plano"} · {product.quantity} un.</small></span><b>{formatMoney(Math.round(product.value * product.quantity * 100))}</b></div>)}</div>}</section>
    <section className="lead-drawer-section lead-interaction-section"><div className="panel-header"><div><span className="eyebrow">ETAPA E FOLLOW-UP</span><h3>Registrar interação</h3></div></div><div className="lead-control-grid"><label>Etapa atual<select value={stage} disabled={!canEdit} onChange={(event) => setStage(event.target.value)}>{stages.map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></label><label>Tipo de follow-up<select id="lead-follow-type" disabled={!canEdit}><option value="">Selecionar</option>{followTypes.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label></div><label>O que aconteceu?<textarea value={followText} disabled={!canEdit} onChange={(event) => setFollowText(event.target.value)} placeholder="Registre o contexto, acordo ou próximo passo." rows={4} /></label><div className="drawer-actions"><button className="primary-button" disabled={busy || !canEdit || (!followText.trim() && stage === lead.stage)} onClick={() => { const type = (document.getElementById("lead-follow-type") as HTMLSelectElement | null)?.value || "Atualização"; void saveLead({ ...lead, stage, follows: followText.trim() ? [...lead.follows, { type, text: followText.trim(), createdAt: new Date().toISOString() }] : lead.follows }); }}>Registrar follow-up</button></div></section>
    <section className="lead-drawer-section"><div className="panel-header"><div><span className="eyebrow">COMENTÁRIO INTERNO</span><h3>Histórico do lead</h3></div></div><label>Adicionar comentário<textarea value={commentText} disabled={!canEdit} onChange={(event) => setCommentText(event.target.value)} placeholder="Inclua uma observação avulsa para o histórico." rows={3} /></label><div className="drawer-actions"><button className="secondary-button" disabled={busy || !canEdit || !commentText.trim()} onClick={() => void saveLead({ ...lead, comments: [...lead.comments, { text: commentText.trim(), createdAt: new Date().toISOString() }] })}><MessageSquareText size={15} /> Adicionar comentário</button></div>{lead.comments.length > 0 && <div className="lead-follow-history lead-comments-history">{lead.comments.slice().reverse().map((comment, index) => <article key={`${comment.createdAt}-${index}`}><strong>Comentário interno</strong><time>{dateTime(comment.createdAt)}</time><p>{comment.text}</p></article>)}</div>}</section>
    <section className="lead-drawer-section"><div className="panel-header"><div><span className="eyebrow">HISTÓRICO</span><h3>Follow-ups</h3></div></div>{lead.follows.length === 0 ? <p>Nenhuma interação registrada.</p> : <div className="lead-follow-history">{lead.follows.slice().reverse().map((follow, index) => <article key={`${follow.createdAt}-${index}`}><strong>{follow.type}</strong><time>{dateTime(follow.createdAt)}</time><p>{follow.text}</p></article>)}</div>}</section>
  </div>{editing && <CommercialLeadEditModal item={item} lead={lead} catalogs={catalogs} stages={stages} busy={busy} onClose={() => setEditing(false)} onSave={async (payload) => { const result = await onSave({ ...payload, requireConfirmation: true }); if (result) setEditing(false); return result; }} />}</aside></div>;
}

function CommercialLeadEditModal({ item, lead, catalogs, stages, busy, onClose, onSave }: { item: WorkItem; lead: CommercialLead; catalogs: CustomerCatalogOption[]; stages: NonNullable<CommercialDetails["stages"]>; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<OperationResult> }) {
  const temperatures = catalogs.filter((entry) => entry.catalog === "temperature");
  const products = catalogs.filter((entry) => entry.catalog === "commercialProduct");
  const labels = catalogs.filter((entry) => entry.catalog === "commercialLabel");
  const employees = [...new Set(catalogs.filter((entry) => entry.catalog === "seller").map((entry) => entry.name).concat(item.owner, lead.seller))].filter(Boolean);
  const [selectedProducts, setSelectedProducts] = useState(lead.products);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [plan, setPlan] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [manualValue, setManualValue] = useState("");
  const [selectedLabels, setSelectedLabels] = useState(lead.labels);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [score, setScore] = useState(lead.score);
  const product = products.find((entry) => entry.id === productId);
  const plans = commercialDetails(product?.description ?? "").plans?.filter((entry) => entry.active) ?? [];
  const total = selectedProducts.reduce((sum, entry) => sum + entry.value * entry.quantity, 0);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const next = { ...lead, phone: String(form.get("phone") ?? ""), customer: String(form.get("customer") ?? ""), seller: String(form.get("owner") ?? ""), temperature: String(form.get("temperature") ?? ""), stage: String(form.get("stage") ?? ""), products: selectedProducts, labels: selectedLabels, score }; void onSave({ title: String(form.get("title") ?? ""), owner: next.seller, customerName: next.customer, amountCents: Math.round(total * 100), description: JSON.stringify(next) }); };
  return <ModalShell title="Editar lead" subtitle="Atualize os produtos, etiquetas e informaÃ§Ãµes da oportunidade." onClose={onClose}>
    <form className="form-grid commercial-lead-edit" onSubmit={submit}>
      <label className="wide">Nome *<input name="title" required defaultValue={item.title} /></label>
      <label>Telefone *<input name="phone" required defaultValue={lead.phone} /></label><label>Cliente / empresa<input name="customer" defaultValue={lead.customer} /></label>
      <label>ResponsÃ¡vel<input name="owner" defaultValue={lead.seller || item.owner} list="lead-owners" /><datalist id="lead-owners">{employees.map((entry) => <option key={entry} value={entry} />)}</datalist></label>
      <label>Temperatura<select name="temperature" defaultValue={lead.temperature}><option value="">Selecionar</option>{temperatures.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label><label>Etapa<select name="stage" defaultValue={lead.stage}>{stages.map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></label>
      <fieldset className="commercial-products wide"><legend>Produtos e valores</legend><section><label>Produto<select value={productId} onChange={(event) => { setProductId(event.target.value); setPlan(""); setManualValue(""); }}><option value="">Selecionar</option>{products.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label><label>Plano<select value={plan} onChange={(event) => { const nextPlan = event.target.value; setPlan(nextPlan); setManualValue(String(plans.find((entry) => entry.name === nextPlan)?.value ?? "")); }}><option value="">Sem plano</option>{plans.map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></label><label className="commercial-product-value">Valor (R$)<input type="number" min="0" step="0.01" value={manualValue} onChange={(event) => setManualValue(event.target.value)} placeholder="0,00" /></label><label>Qtd.<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></label><button type="button" disabled={!product} onClick={() => { if (!product) return; setSelectedProducts((current) => [...current, { product: product.name, plan, value: Number(manualValue || plans.find((entry) => entry.name === plan)?.value || 0), quantity }]); setPlan(""); setManualValue(""); setQuantity(1); }}>Adicionar</button></section>{selectedProducts.length === 0 ? <p>Nenhum produto vinculado.</p> : selectedProducts.map((entry, index) => <div key={`${entry.product}-${index}`}><span><strong>{entry.product}</strong><small>{entry.plan || "Sem plano"}</small></span><input aria-label={`Valor de ${entry.product}`} type="number" min="0" step="0.01" value={entry.value} onChange={(event) => setSelectedProducts((current) => current.map((currentEntry, currentIndex) => currentIndex === index ? { ...currentEntry, value: Number(event.target.value) || 0 } : currentEntry))} /><input aria-label={`Quantidade de ${entry.product}`} type="number" min="1" value={entry.quantity} onChange={(event) => setSelectedProducts((current) => current.map((currentEntry, currentIndex) => currentIndex === index ? { ...currentEntry, quantity: Math.max(1, Number(event.target.value) || 1) } : currentEntry))} /><b>{formatMoney(Math.round(entry.value * entry.quantity * 100))}</b><button type="button" aria-label={`Remover ${entry.product}`} onClick={() => setSelectedProducts((current) => current.filter((_, currentIndex) => currentIndex !== index))}><Trash2 size={15} /></button></div>)}<footer>Total estimado: <b>{formatMoney(Math.round(total * 100))}</b></footer></fieldset>
      <fieldset className="lead-score wide"><legend>Etiquetas e prioridade do lead</legend><div className="lead-edit-score-row"><div><button type="button" className="secondary-button" onClick={() => setShowLabelPicker(true)}><Plus size={15} /> Selecionar etiquetas</button>{selectedLabels.length > 0 && <div className="selected-label-list">{selectedLabels.map((label) => <span key={label} style={{ "--label-color": commercialLabelColor(label) } as CSSProperties}><i />{label}</span>)}</div>}</div><div className="score-selector" aria-label="Prioridade do lead">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} className={score >= value ? "selected" : ""} onClick={() => setScore(value)}>★</button>)}</div></div></fieldset>
      <div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} type="submit"><Save size={16} /> Salvar alterações</button></div>
    </form>{showLabelPicker && <LeadLabelPicker selected={selectedLabels} labels={labels} busy={busy} onClose={() => setShowLabelPicker(false)} onChange={(next) => { setSelectedLabels(next); setShowLabelPicker(false); }} />}
  </ModalShell>;
  return <ModalShell title="Editar lead" subtitle="Atualize as informações principais da oportunidade." onClose={onClose}><form className="form-grid commercial-lead-edit" onSubmit={submit}><label className="wide">Nome *<input name="title" required defaultValue={item.title} /></label><label>Telefone *<input name="phone" required defaultValue={lead.phone} /></label><label>Cliente / empresa<input name="customer" defaultValue={lead.customer} /></label><label>Responsável<input name="owner" defaultValue={lead.seller || item.owner} list="lead-owners" /><datalist id="lead-owners">{employees.map((entry) => <option key={entry} value={entry} />)}</datalist></label><label>Temperatura<select name="temperature" defaultValue={lead.temperature}><option value="">Selecionar</option>{temperatures.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label><label>Etapa<select name="stage" defaultValue={lead.stage}>{stages.map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} type="submit"><Save size={16} /> Salvar alterações</button></div></form></ModalShell>;
}

type CsJourney = { kind: "csJourney"; phase: "validation" | "activation" | "validationFinal" | "evolution" | "closed"; sourceLeadId?: string; clientId?: string; scheduledAt?: string; commerciallyApproved?: boolean; firstMeetingAt?: string; firstMeetingTime?: string; firstMeetingCommitmentId?: string; trainingAt?: string; trainingTime?: string; trainingCommitmentId?: string; rescheduledAt?: string; rescheduledTime?: string; meetingLink?: string; finalReason?: string; approvalReason?: string; status?: string; usage?: string; callStatus?: string; conferenceRequestedAt?: string; conferenceConfirmedAt?: string; features?: string[]; featuresBase?: string[]; featuresActive?: string[]; featuresPlus?: string[]; labels?: string[]; follows: Array<{ text: string; createdAt: string }> };
const parseCsJourney = (value: string): CsJourney | null => { try { const item = JSON.parse(value) as Partial<CsJourney>; return item.kind === "csJourney" ? { kind: "csJourney", phase: item.phase ?? "validation", sourceLeadId: item.sourceLeadId, clientId: item.clientId, scheduledAt: item.scheduledAt, commerciallyApproved: Boolean(item.commerciallyApproved), firstMeetingAt: item.firstMeetingAt, firstMeetingTime: item.firstMeetingTime, firstMeetingCommitmentId: item.firstMeetingCommitmentId, trainingAt: item.trainingAt, trainingTime: item.trainingTime, trainingCommitmentId: item.trainingCommitmentId, rescheduledAt: item.rescheduledAt, rescheduledTime: item.rescheduledTime, meetingLink: item.meetingLink, finalReason: item.finalReason, approvalReason: item.approvalReason, status: item.status, usage: item.usage, callStatus: item.callStatus, conferenceRequestedAt: item.conferenceRequestedAt, conferenceConfirmedAt: item.conferenceConfirmedAt, features: Array.isArray(item.features) ? item.features : [], featuresBase: Array.isArray(item.featuresBase) ? item.featuresBase : [], featuresActive: Array.isArray(item.featuresActive) ? item.featuresActive : [], featuresPlus: Array.isArray(item.featuresPlus) ? item.featuresPlus : [], labels: Array.isArray(item.labels) ? item.labels : [], follows: Array.isArray(item.follows) ? item.follows : [] } : null; } catch { return null; } };

type EnterpriseFeature = { id: string; name: string; category: string; status: string; percentage: number; activatedAt: string; updatedAt: string; owner: string; notes: string };
type EnterpriseUnit = { id: string; name: string; externalId: string; city: string; state: string; contact: string; phone: string; email: string; usageStatus: string; usagePercent: number; lastAnalysis: string; implementationAt?: string; notes: string; status: string; active: boolean; features: EnterpriseFeature[] };
type EnterpriseHistory = { id: string; createdAt: string; user: string; type: string; text: string; unitId?: string; previousStatus?: string; nextStatus?: string };
type EnterpriseNetwork = { kind: "enterpriseNetwork"; contact: string; phone: string; email: string; status: string; notes: string; startedAt: string; units: EnterpriseUnit[]; history: EnterpriseHistory[] };
const networkId = () => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const parseEnterpriseNetwork = (value: string): EnterpriseNetwork | null => { try { const entry = JSON.parse(value) as Partial<EnterpriseNetwork>; return entry.kind === "enterpriseNetwork" ? { kind: "enterpriseNetwork", contact: entry.contact ?? "", phone: entry.phone ?? "", email: entry.email ?? "", status: entry.status ?? "Em acompanhamento", notes: entry.notes ?? "", startedAt: entry.startedAt ?? "", units: Array.isArray(entry.units) ? entry.units.map((unit) => ({ id: unit.id ?? networkId(), name: unit.name ?? "", externalId: unit.externalId ?? "", city: unit.city ?? "", state: unit.state ?? "", contact: unit.contact ?? "", phone: unit.phone ?? "", email: unit.email ?? "", usageStatus: unit.usageStatus ?? "Não iniciada", usagePercent: Number(unit.usagePercent ?? 0), lastAnalysis: unit.lastAnalysis ?? "", implementationAt: unit.implementationAt ?? "", notes: unit.notes ?? "", status: unit.status ?? "Não iniciada", active: unit.active !== false, features: Array.isArray(unit.features) ? unit.features : [] })) : [], history: Array.isArray(entry.history) ? entry.history : [] } : null; } catch { return null; } };
const enterpriseNetworkFor=(item:WorkItem):EnterpriseNetwork=>parseEnterpriseNetwork(item.description)??{kind:"enterpriseNetwork",contact:"",phone:"",email:"",status:item.status||"Em acompanhamento",notes:item.description||"Registro estratégico importado",startedAt:item.created_at.slice(0,10),units:[],history:[]};
const enterpriseUnitStatuses = ["Não iniciada", "Em implantação", "Em acompanhamento", "Em risco", "Utilização parcial", "Utilização completa", "Inativa"];
const enterpriseFeatureStatuses = ["Não contratada", "Contratada", "Aguardando configuração", "Em configuração", "Configurada", "Em utilização", "Com baixa utilização", "Com problema", "Inativa"];
const enterpriseTone = (percent: number, active = true) => !active ? "neutral" : percent >= 75 ? "positive" : percent >= 40 ? "warning" : "negative";
const normalizeEnterprise = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const enterpriseUnitScore = (unit: EnterpriseUnit, featureUniverse: string[] = []) => {
  const universe = [...new Set((featureUniverse.length ? featureUniverse : unit.features.map(feature => feature.name)).map(normalizeEnterprise).filter(Boolean))];
  if (!universe.length) return 0;
  const inUse = new Set(unit.features.filter(feature => /em utilização|configurada/i.test(feature.status) || /ativa/i.test(feature.category)).map(feature => normalizeEnterprise(feature.name)));
  return Math.round(Math.max(0, Math.min(1, inUse.size / universe.length)) * 100);
};
const enterpriseHealthScore = (units: EnterpriseUnit[], featureUniverse: string[] = []) => {
  const activeUnits = units.filter(unit => unit.active);
  return activeUnits.length ? Math.round(activeUnits.reduce((sum, unit) => sum + enterpriseUnitScore(unit, featureUniverse), 0) / activeUnits.length) : 0;
};

function EnterpriseNetworksModule({ items, employees, catalogs, currentUser, busy, canEdit, canDelete, operate, onOpenSettings }: { items: WorkItem[]; employees: Employee[]; catalogs: CustomerCatalogOption[]; currentUser: AppData["user"]; busy: boolean; canEdit: boolean; canDelete: boolean; operate: (payload: Record<string, unknown>, success: string) => Promise<OperationResult>; onOpenSettings?: () => void }) {
  const [query, setQuery] = useState(""); const [owner, setOwner] = useState("all"); const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false); const [editing, setEditing] = useState<WorkItem | null>(null); const [selected, setSelected] = useState<WorkItem | null>(null); const [enterpriseView,setEnterpriseView]=useState<"grid"|"list">("grid");
  const networks = items.filter((item) => item.module === "cs" && (parseEnterpriseNetwork(item.description)||/conta estrat|cliente grande|rede/i.test(item.record_type)));
  const filtered = networks.filter((item) => { const network = enterpriseNetworkFor(item); return (!query || `${item.title} ${network.contact} ${network.phone}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))) && (owner === "all" || item.owner === owner) && (status === "all" || network.status === status); });
  const save = async (item: WorkItem | null, payload: Record<string, unknown>) => {
    const result = item ? await operate({ action: "updateWorkItem", requireConfirmation: true, id: item.id, title: payload.title, owner: payload.owner, customerName: payload.customerName, amountCents: 0, version: item.version, description: payload.description }, "Rede atualizada com sucesso.") : await operate({ action: "createWorkItem", module: "cs", recordType: "Conta estratégica", team: "CS", priority: "P2", amountCents: 0, ...payload }, "Rede cadastrada com sucesso.");
    if (result) { setCreating(false); setEditing(null); } return result;
  };
  const configuredFeatures = catalogs.filter((entry) => entry.active && ["enterpriseFeatureActive", "enterpriseFeatureBase", "enterpriseFeaturePlus"].includes(entry.catalog));
  const fallbackFeatures = catalogs.filter((entry) => entry.active && ["csFeature", "csFeatureActive", "csFeatureBase", "csFeaturePlus"].includes(entry.catalog));
  const featureCatalog = (configuredFeatures.length ? configuredFeatures : fallbackFeatures).map((entry) => ({ name: entry.name, category: entry.catalog.toLocaleLowerCase("pt-BR").includes("plus") ? "Plus" : entry.catalog.toLocaleLowerCase("pt-BR").includes("active") ? "Ativa" : "Base" }));
  const featureOptions = [...new Set(featureCatalog.map((entry) => entry.name))];
  const totalUnits=networks.reduce((sum,item)=>sum+enterpriseNetworkFor(item).units.length,0);const activeUnits=networks.reduce((sum,item)=>sum+enterpriseNetworkFor(item).units.filter(unit=>unit.active).length,0);const owners=new Set(networks.map(item=>item.owner).filter(Boolean)).size;const average=totalUnits?Math.round(networks.reduce((sum,item)=>sum+enterpriseHealthScore(enterpriseNetworkFor(item).units,featureOptions)*enterpriseNetworkFor(item).units.length,0)/totalUnits):0;
  if (selected) return <EnterpriseNetworkDrawer item={selected} network={parseEnterpriseNetwork(selected.description)!} employees={employees} products={catalogs.filter(entry => entry.active && entry.catalog === "commercialProduct").map(entry => entry.name)} featureOptions={featureOptions} featureCatalog={featureCatalog} unitStatuses={catalogs.filter(entry => entry.active && entry.catalog === "enterpriseUnitStatus").map(entry => entry.name)} usageStatuses={catalogs.filter(entry => entry.active && entry.catalog === "enterpriseUsageStatus").map(entry => entry.name)} currentUser={currentUser} busy={busy} canEdit={canEdit} canDelete={canDelete} onClose={() => setSelected(null)} onEdit={() => { setEditing(selected); setSelected(null); }} onDelete={async () => { const result = await operate({ action: "deleteWorkItem", id: selected.id }, "Rede excluída com sucesso."); if (result) setSelected(null); }} onSave={async (next, message) => { const result = await operate({ action: "updateWorkItem", id: selected.id, title: selected.title, owner: selected.owner, customerName: selected.customer_name, amountCents: 0, version: selected.version, description: JSON.stringify(next) }, message); if (result) setSelected(current => current ? { ...current, description: JSON.stringify(next), version: current.version + 1, updated_at: new Date().toISOString() } : current); return result; }} />;
  return <section className="enterprise-module"><PageHeader eyebrow="OPERAÇÃO · CS" title="Contas estratégicas" description="Gestão de redes, unidades, responsáveis e evolução dos clientes." action={<div className="commercial-header-actions">{onOpenSettings && <button className="icon-button commercial-settings-button" onClick={onOpenSettings} title="Configurações de Contas estratégicas" aria-label="Abrir configurações de Contas estratégicas"><Settings size={18} /></button>}{canEdit && <button className="primary-button" onClick={() => setCreating(true)}><Plus size={17} /> Nova rede</button>}</div>} />
    <section className="enterprise-kpis"><article><span>REDES EXIBIDAS</span><strong>{networks.length}</strong><small>{filtered.length} no filtro atual</small></article><article><span>UNIDADES</span><strong>{totalUnits}</strong><small>{activeUnits} ativas</small></article><article><span>RESPONSÁVEIS INTERNOS</span><strong>{owners}</strong><small>colaboradores vinculados</small></article><article><span>UTILIZAÇÃO MÉDIA</span><strong>{average}%</strong><small>health consolidado</small></article></section>
    <section className="enterprise-filters panel"><label className="commercial-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar rede ou responsável" /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos os status</option>{[...new Set(networks.map((item) => parseEnterpriseNetwork(item.description)?.status).filter(Boolean))].map((name) => <option key={name}>{name}</option>)}</select></label><label>Responsável<select value={owner} onChange={(event) => setOwner(event.target.value)}><option value="all">Todos os responsáveis</option>{[...new Set(networks.map((item) => item.owner).filter(Boolean))].map((name) => <option key={name}>{name}</option>)}</select></label><div className="enterprise-view-switch"><button className={enterpriseView==="grid"?"active":""} onClick={()=>setEnterpriseView("grid")} aria-label="Visualizar em cards"><Columns3 size={15}/></button><button className={enterpriseView==="list"?"active":""} onClick={()=>setEnterpriseView("list")} aria-label="Visualizar em lista"><List size={15}/></button></div></section>
    {enterpriseView==="grid"?<section className="enterprise-grid">{filtered.length === 0 ? <EmptyState text="Nenhuma rede cadastrada." /> : filtered.map((item) => <EnterpriseNetworkCard key={item.id} item={item} network={enterpriseNetworkFor(item)} featureOptions={featureOptions} canEdit={canEdit} canDelete={canDelete} onOpen={() => setSelected({...item,description:JSON.stringify(enterpriseNetworkFor(item))})} onEdit={() => setEditing(item)} onDelete={() => { void operate({ action: "deleteWorkItem", id: item.id }, "Rede excluída com sucesso."); }} />)}</section>:<EnterpriseNetworkList items={filtered} featureOptions={featureOptions} canEdit={canEdit} canDelete={canDelete} onOpen={item=>setSelected({...item,description:JSON.stringify(enterpriseNetworkFor(item))})} onEdit={setEditing} onDelete={item=>void operate({action:"deleteWorkItem",id:item.id},"Rede excluída com sucesso.")}/>}
    {creating && <EnterpriseNetworkModal employees={employees} networkStatuses={catalogs.filter((entry) => entry.active && entry.catalog === "enterpriseNetworkStatus").map((entry) => entry.name)} busy={busy} currentUser={currentUser} onClose={() => setCreating(false)} onSave={(payload) => save(null, payload)} />}
    {editing && <EnterpriseNetworkModal item={editing} employees={employees} networkStatuses={catalogs.filter((entry) => entry.active && entry.catalog === "enterpriseNetworkStatus").map((entry) => entry.name)} busy={busy} currentUser={currentUser} onClose={() => setEditing(null)} onSave={(payload) => save(editing, payload)} />}
  </section>;
}

function EnterpriseNetworkCard({ item, network, featureOptions, canEdit, canDelete, onOpen, onEdit, onDelete }: { item: WorkItem; network: EnterpriseNetwork; featureOptions: string[]; canEdit: boolean; canDelete: boolean; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const active = network.units.filter((unit) => unit.active); const average = enterpriseHealthScore(network.units, featureOptions);
  const lastInteraction = network.history.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt ?? item.created_at; const withoutInteraction = Math.max(0, Math.floor((Date.now() - new Date(lastInteraction).getTime()) / 86_400_000));
  return <article className="enterprise-card"><button className="enterprise-card-open" onClick={onOpen}><header><span className="enterprise-avatar">{item.title.slice(0, 2).toUpperCase()}</span><b className={`status-pill ${enterpriseTone(average, active.length > 0)}`}>{network.status}</b></header><h3>{item.title}</h3><p>{network.contact || "Responsável principal não informado"}</p><div className="enterprise-card-stats"><span><small>Unidades</small><strong>{network.units.length}</strong></span><span><small>Ativas</small><strong>{active.length}</strong></span><span><small>Health Score</small><strong>{average}%</strong></span></div><footer><span>{withoutInteraction} dia(s) sem interação</span><time>{dateTime(item.updated_at)}</time></footer></button>{(canEdit || canDelete) && <div className="card-inline-actions">{canEdit && <button onClick={onEdit}><Pencil size={14} /> Editar</button>}{canDelete && <button className="delete" onClick={onDelete}><Trash2 size={14} /> Excluir</button>}</div>}</article>;
}

function EnterpriseNetworkModal({ item, employees, networkStatuses, currentUser, busy, onClose, onSave }: { item?: WorkItem; employees: Employee[]; networkStatuses: string[]; currentUser: AppData["user"]; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<OperationResult> }) {
  const network = item ? parseEnterpriseNetwork(item.description) : null;
  const enterpriseUnitStatuses = networkStatuses.length ? ["", ...networkStatuses] : ["", "Em implantação", "Em acompanhamento", "Em risco", "Utilização parcial", "Utilização completa"];
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const next: EnterpriseNetwork = { kind: "enterpriseNetwork", contact: String(form.get("contact") ?? ""), phone: String(form.get("phone") ?? ""), email: String(form.get("email") ?? ""), status: String(form.get("status") ?? "Em acompanhamento"), notes: String(form.get("notes") ?? ""), startedAt: String(form.get("startedAt") ?? ""), units: network?.units ?? [], history: [...(network?.history ?? []), { id: networkId(), createdAt: new Date().toISOString(), user: currentUser.displayName, type: item ? "Atualização interna" : "Cadastro", text: item ? "Dados gerais da rede atualizados." : "Rede cadastrada." }] }; void onSave({ title: String(form.get("title") ?? ""), owner: String(form.get("owner") ?? ""), customerName: String(form.get("title") ?? ""), description: JSON.stringify(next) }); };
  return <ModalShell title={item ? "Editar rede" : "Nova rede"} subtitle="Dados centrais da rede e do acompanhamento." onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="wide">Nome da rede *<input name="title" required defaultValue={item?.title} /></label><label>Responsável principal *<input name="contact" required defaultValue={network?.contact} /></label><label>Telefone<input name="phone" defaultValue={network?.phone} /></label><label>E-mail<input name="email" type="email" defaultValue={network?.email} /></label><label>Responsável interno<select name="owner" defaultValue={item?.owner || currentUser.displayName}>{employees.map((employee) => <option key={employee.id}>{employee.displayName}</option>)}</select></label><label>Status geral<select name="status" defaultValue={network?.status ?? "Em acompanhamento"}>{enterpriseUnitStatuses.slice(1, 6).map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Início do acompanhamento<input name="startedAt" type="date" defaultValue={network?.startedAt} /></label><label className="wide">Observações iniciais<textarea name="notes" rows={4} defaultValue={network?.notes} /></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}><Save size={16} /> Salvar</button></div></form></ModalShell>;
}

function EnterpriseNetworkDrawer({ item, network, employees, products, featureOptions, featureCatalog, unitStatuses, usageStatuses, currentUser, busy, canEdit, canDelete, onClose, onEdit, onDelete, onSave }: { item: WorkItem; network: EnterpriseNetwork; employees: Employee[]; products: string[]; featureOptions: string[]; featureCatalog: { name: string; category: string }[]; unitStatuses: string[]; usageStatuses: string[]; currentUser: AppData["user"]; busy: boolean; canEdit: boolean; canDelete: boolean; onClose: () => void; onEdit: () => void; onDelete: () => Promise<void>; onSave: (network: EnterpriseNetwork, message: string) => Promise<OperationResult> }) {
  const [selectedUnitId, setSelectedUnitId] = useState(network.units[0]?.id ?? ""); const [unitEditor, setUnitEditor] = useState<EnterpriseUnit | null | undefined>(undefined); const [featureEditor, setFeatureEditor] = useState<EnterpriseFeature | null | undefined>(undefined); const [featureManagerOpen, setFeatureManagerOpen] = useState(false); const [comment, setComment] = useState(""); const [interactionType, setInteractionType] = useState("Atualização interna");
  const unit = network.units.find((entry) => entry.id === selectedUnitId) ?? network.units[0]; const active = network.units.filter((entry) => entry.active); const average = enterpriseHealthScore(network.units, featureOptions);
  const unitScore = (entry: EnterpriseUnit) => enterpriseUnitScore(entry, featureOptions);
  const save = (next: EnterpriseNetwork, message: string) => onSave({ ...next, history: [...next.history, { id: networkId(), createdAt: new Date().toISOString(), user: currentUser.displayName, type: "Atualização interna", text: message }] }, message);
  const saveUnit = async (draft: EnterpriseUnit) => { const exists = network.units.some((entry) => entry.id === draft.id); const next = { ...network, units: exists ? network.units.map((entry) => entry.id === draft.id ? draft : entry) : [...network.units, draft] }; const result = await save(next, exists ? `Unidade ${draft.name} atualizada.` : `Unidade ${draft.name} adicionada.`); if (result) { setSelectedUnitId(draft.id); setUnitEditor(undefined); } };
  const saveFeature = async (draft: EnterpriseFeature) => { if (!unit) return; const exists = unit.features.some((entry) => entry.id === draft.id); const nextUnit = { ...unit, features: exists ? unit.features.map((entry) => entry.id === draft.id ? draft : entry) : [...unit.features, draft], lastAnalysis: new Date().toISOString().slice(0, 10) }; const result = await save({ ...network, units: network.units.map((entry) => entry.id === unit.id ? nextUnit : entry) }, exists ? `Feature ${draft.name} atualizada.` : `Feature ${draft.name} adicionada.`); if (result) setFeatureEditor(undefined); };
  const saveManagedFeatures = async (features: EnterpriseFeature[]) => { if (!unit) return; const nextUnit = { ...unit, features, lastAnalysis: new Date().toISOString().slice(0, 10) }; const result = await save({ ...network, units: network.units.map((entry) => entry.id === unit.id ? nextUnit : entry) }, `Features da unidade ${unit.name} atualizadas.`); if (result) setFeatureManagerOpen(false); };
  return <section className="enterprise-detail-page"><div className="enterprise-detail-shell"><header className="drawer-head simple"><div><span className="eyebrow">CS · CONTAS ESTRATÉGICAS</span><h2>{item.title}</h2><p>{network.status} · Atualizado {dateTime(item.updated_at)}</p></div><div className="lead-header-actions">{canEdit && <button className="secondary-button" onClick={onEdit}><Pencil size={15} /> Editar rede</button>}{canDelete && <button className="secondary-button danger-action" onClick={() => void onDelete()}><Trash2 size={15} /> Excluir</button>}<button className="icon-button" onClick={onClose}><X size={20} /></button></div></header><div className="enterprise-drawer-content"><section className="enterprise-summary"><span><small>Total de unidades</small><strong>{network.units.length}</strong></span><span><small>Unidades ativas</small><strong>{active.length}</strong></span><span><small>Em implantação</small><strong>{network.units.filter((entry) => entry.status === "Em implantação").length}</strong></span><span><small>Em risco</small><strong>{network.units.filter((entry) => entry.status === "Em risco").length}</strong></span><span><small>Utilização média</small><strong>{average}%</strong></span></section>
    <section className="enterprise-insights"><article><header>Ativas vs inativas</header><div className="enterprise-donut" style={{"--active-angle":`${network.units.length?Math.round(active.length*360/network.units.length):0}deg`} as CSSProperties}><span><strong>{active.length}</strong><small>ativas</small></span></div><footer><b>{active.length} ativas</b><b>{network.units.length-active.length} inativas</b></footer></article><article><header>Unidades por status</header><div className="enterprise-status-bars">{[...new Set(network.units.map(entry=>entry.status))].slice(0,5).map(entry=>{const count=network.units.filter(unitEntry=>unitEntry.status===entry).length;return <span key={entry}><small>{entry}</small><i><b style={{width:`${network.units.length?Math.max(5,count*100/network.units.length):0}%`}}/></i><strong>{count}</strong></span>})}</div></article><article><header>Health score por unidade</header><div className="enterprise-health-bars">{network.units.slice(0,14).map(entry=><span key={entry.id} title={`${entry.name}: ${enterpriseUnitScore(entry)}%`}><i style={{height:`${Math.max(4,enterpriseUnitScore(entry))}%`}}/><small>{entry.name.slice(0,3).toUpperCase()}</small></span>)}</div></article></section>
    <section className="enterprise-units-section"><div className="panel-header"><div><span className="eyebrow">UNIDADES</span><h3>Operação da rede</h3></div>{canEdit && <button className="primary-button" onClick={() => setUnitEditor(null)}><Plus size={15} /> Nova unidade</button>}</div><div className="enterprise-unit-tabs enterprise-unit-card-grid">{network.units.map((entry) => <button key={entry.id} className={unit?.id === entry.id ? "active" : ""} onClick={() => setSelectedUnitId(entry.id)}><i className={enterpriseTone(enterpriseUnitScore(entry), entry.active)} />{entry.name}</button>)}</div>{!unit ? <EmptyState compact text="Cadastre a primeira unidade da rede." /> : <><div className="enterprise-unit-head"><div><h3>{unit.name}</h3><p>{unit.city}{unit.state ? ` · ${unit.state}` : ""} · ID {unit.externalId || "não informado"}</p></div><div>{canEdit && <button className="secondary-button" onClick={() => setUnitEditor(unit)}><Pencil size={14} /> Editar</button>}{canEdit && <button className="secondary-button" onClick={() => void save({ ...network, units: network.units.map((entry) => entry.id === unit.id ? { ...entry, active: !entry.active, status: !entry.active ? "Em acompanhamento" : "Inativa" } : entry) }, unit.active ? `Unidade ${unit.name} desativada.` : `Unidade ${unit.name} reativada.`)}>{unit.active ? "Desativar" : "Reativar"}</button>}{canDelete && <button className="secondary-button danger-action" onClick={() => void save({ ...network, units: network.units.filter((entry) => entry.id !== unit.id) }, `Unidade ${unit.name} excluída.`)}><Trash2 size={14} /> Excluir</button>}</div></div><div className="enterprise-unit-details"><span><small>Status</small><b className={`status-pill ${enterpriseTone(enterpriseUnitScore(unit), unit.active)}`}>{unit.status}</b></span><span><small>Utilização</small><strong>{enterpriseUnitScore(unit)}% · {unit.usageStatus}</strong></span><span><small>Responsável local</small><strong>{unit.contact || "Não informado"}</strong></span><span><small>Última análise</small><strong>{unit.lastAnalysis || "Não realizada"}</strong></span></div><p className="enterprise-notes">{unit.notes || "Sem observações para esta unidade."}</p>
      <div className="panel-header enterprise-feature-head"><div><span className="eyebrow">FEATURES</span><h3>Funcionalidades da unidade</h3></div>{canEdit && <button className="secondary-button" onClick={() => setFeatureManagerOpen(true)}><Settings size={14} /> Gerenciar features</button>}</div><div className="enterprise-features">{unit.features.length === 0 ? <p>Nenhuma feature cadastrada.</p> : unit.features.map((feature) => <article key={feature.id}><span className={`enterprise-feature-dot ${enterpriseTone(feature.percentage, feature.status !== "Inativa")}`} /><div><strong>{feature.name}</strong><small>{feature.category || "Sem categoria"} · {feature.status}</small><p>{feature.percentage}% de utilização</p></div><time>{feature.updatedAt || "Sem atualização"}</time>{canEdit && <button onClick={() => setFeatureEditor(feature)}><Pencil size={14} /></button>}{canDelete && <button className="delete" onClick={() => void save({ ...network, units: network.units.map((entry) => entry.id === unit.id ? { ...entry, features: entry.features.filter((current) => current.id !== feature.id) } : entry) }, `Feature ${feature.name} removida.`)}><Trash2 size={14} /></button>}</article>)}</div></>}</section>
    <section className="enterprise-history"><div className="panel-header"><div><span className="eyebrow">HISTÓRICO DE EVOLUÇÃO</span><h3>Interações da rede</h3></div></div><div className="enterprise-comment-form"><select value={interactionType} disabled={!canEdit} onChange={(event) => setInteractionType(event.target.value)}>{["Reunião", "Treinamento", "Ligação", "WhatsApp", "E-mail", "Análise de utilização", "Pendência", "Atualização interna", "Outro"].map((entry) => <option key={entry}>{entry}</option>)}</select><textarea value={comment} disabled={!canEdit} onChange={(event) => setComment(event.target.value)} placeholder="Registre uma interação ou decisão importante..." rows={3} /><button className="primary-button" disabled={!canEdit || busy || !comment.trim()} onClick={() => { const next = { ...network, history: [...network.history, { id: networkId(), createdAt: new Date().toISOString(), user: currentUser.displayName, type: interactionType, text: comment.trim(), unitId: unit?.id }] }; void onSave(next, "Interação registrada na linha do tempo.").then((result) => { if (result) setComment(""); }); }}>Registrar</button></div><div className="enterprise-timeline">{network.history.length === 0 ? <p>Nenhuma interação registrada.</p> : network.history.slice().reverse().map((entry) => <article key={entry.id}><i /><div><strong>{entry.type}</strong><small>{entry.user} · {dateTime(entry.createdAt)}{entry.unitId ? ` · ${network.units.find((unit) => unit.id === entry.unitId)?.name ?? "Unidade"}` : ""}</small><p>{entry.text}</p></div></article>)}</div></section>
    {unitEditor !== undefined && <EnterpriseUnitModal unit={unitEditor ?? undefined} products={products} unitStatuses={unitStatuses} usageStatuses={usageStatuses} busy={busy} onClose={() => setUnitEditor(undefined)} onSave={saveUnit} />}{featureEditor !== undefined && unit && <EnterpriseFeatureModal feature={featureEditor ?? undefined} featureOptions={featureOptions} employees={employees} busy={busy} onClose={() => setFeatureEditor(undefined)} onSave={saveFeature} />}{featureManagerOpen && unit && <EnterpriseFeatureManager unit={unit} catalog={featureCatalog} busy={busy} onClose={() => setFeatureManagerOpen(false)} onSave={saveManagedFeatures} />}
  </div></div></section>;
}

function EnterpriseUnitModal({ unit, products, unitStatuses, usageStatuses, busy, onClose, onSave }: { unit?: EnterpriseUnit; products: string[]; unitStatuses: string[]; usageStatuses: string[]; busy: boolean; onClose: () => void; onSave: (unit: EnterpriseUnit) => Promise<void> }) {
  const selectedModules = unit?.features.map((feature) => feature.name) ?? [];
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const moduleNames = form.getAll("modules").map(String); const previous = unit?.features ?? []; const features = moduleNames.map((name) => previous.find((entry) => entry.name === name) ?? { id: networkId(), name, category: "Base", status: "Contratada", percentage: 0, activatedAt: "", updatedAt: new Date().toISOString().slice(0, 10), owner: "", notes: "" }); void onSave({ id: unit?.id ?? networkId(), name: String(form.get("name") ?? ""), externalId: String(form.get("externalId") ?? ""), city: String(form.get("city") ?? ""), state: String(form.get("state") ?? ""), contact: String(form.get("contact") ?? ""), phone: String(form.get("phone") ?? ""), email: String(form.get("email") ?? ""), usageStatus: String(form.get("usageStatus") ?? "Não iniciada"), usagePercent: unit?.usagePercent ?? 0, lastAnalysis: "", implementationAt: String(form.get("implementationAt") ?? ""), notes: String(form.get("notes") ?? ""), status: String(form.get("status") ?? "Não iniciada"), active: form.get("active") === "on", features }); };
  return <ModalShell title={unit ? "Editar unidade" : "Nova unidade"} subtitle="Dados da unidade, implantação e módulos contratados." onClose={onClose}><form className="form-grid" onSubmit={submit}><label>Nome da unidade *<input name="name" required defaultValue={unit?.name} /></label><label>ID da unidade<input name="externalId" defaultValue={unit?.externalId} /></label><label>Cidade<input name="city" defaultValue={unit?.city} /></label><label>Estado<input name="state" defaultValue={unit?.state} /></label><label>Responsável local<input name="contact" defaultValue={unit?.contact} /></label><label>Telefone<input name="phone" defaultValue={unit?.phone} /></label><label>E-mail<input name="email" type="email" defaultValue={unit?.email} /></label><label>Data da implantação<input name="implementationAt" type="date" defaultValue={(unit as EnterpriseUnit & { implementationAt?: string })?.implementationAt} /></label><label>Status da unidade<select name="status" defaultValue={unit?.status ?? "Não iniciada"}>{(unitStatuses.length ? unitStatuses : enterpriseUnitStatuses).map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Status de utilização<select name="usageStatus" defaultValue={unit?.usageStatus ?? "Não iniciada"}>{(usageStatuses.length ? usageStatuses : ["Não iniciada", "Parcial", "Completa"]).map((entry) => <option key={entry}>{entry}</option>)}</select></label><label className="wide">Módulos da unidade<select name="modules" multiple defaultValue={selectedModules}>{products.map((entry) => <option key={entry}>{entry}</option>)}</select><small>Selecione um ou mais produtos cadastrados no Comercial.</small></label><label className="checkbox-label"><input name="active" type="checkbox" defaultChecked={unit?.active ?? true} /> Unidade ativa</label><label className="wide">Resumo e observações<textarea name="notes" rows={3} defaultValue={unit?.notes} /></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>Salvar unidade</button></div></form></ModalShell>;
}

function EnterpriseFeatureModal({ feature, featureOptions, employees, busy, onClose, onSave }: { feature?: EnterpriseFeature; featureOptions: string[]; employees: Employee[]; busy: boolean; onClose: () => void; onSave: (feature: EnterpriseFeature) => Promise<void> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); void onSave({ id: feature?.id ?? networkId(), name: String(form.get("name") ?? ""), category: String(form.get("category") ?? ""), status: String(form.get("status") ?? "Contratada"), percentage: Number(form.get("percentage") ?? 0), activatedAt: String(form.get("activatedAt") ?? ""), updatedAt: String(form.get("updatedAt") ?? new Date().toISOString().slice(0, 10)), owner: String(form.get("owner") ?? ""), notes: String(form.get("notes") ?? "") }); };
  return <ModalShell title={feature ? "Atualizar feature" : "Adicionar feature"} subtitle="Selecione uma feature cadastrada nas configurações de Redes e Franquias e registre seu uso na unidade." onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="wide">Feature *<select name="name" required defaultValue={feature?.name ?? ""}><option value="">Selecionar feature</option>{featureOptions.map((option) => <option key={option}>{option}</option>)}</select></label><label>Categoria<select name="category" defaultValue={feature?.category ?? "Base"}><option>Base</option><option>Ativa</option><option>Plus</option></select></label><label>Status<select name="status" defaultValue={feature?.status ?? "Contratada"}>{enterpriseFeatureStatuses.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Data de ativação<input name="activatedAt" type="date" defaultValue={feature?.activatedAt} /></label><label>Responsável<select name="owner" defaultValue={feature?.owner}>{employees.map((employee) => <option key={employee.id}>{employee.displayName}</option>)}</select></label><label className="wide">Comentários da feature<textarea name="notes" rows={3} defaultValue={feature?.notes} /></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>Salvar feature</button></div></form></ModalShell>;
}

function EnterpriseFeatureManager({ unit, catalog, busy, onClose, onSave }: { unit: EnterpriseUnit; catalog: { name: string; category: string }[]; busy: boolean; onClose: () => void; onSave: (features: EnterpriseFeature[]) => Promise<void> }) {
  const [selected, setSelected] = useState(() => new Set(unit.features.filter((entry) => entry.status !== "Inativa").map((entry) => `${entry.category || "Base"}:${entry.name}`)));
  const groups = ["Ativa", "Base", "Plus"];
  const toggle = (key: string) => setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const saveSelection = () => {
    const today = new Date().toISOString().slice(0, 10);
    const features = catalog.filter((entry) => selected.has(`${entry.category}:${entry.name}`)).map((entry) => {
      const current = unit.features.find((feature) => feature.name === entry.name && (feature.category || "Base") === entry.category);
      return current ?? { id: networkId(), name: entry.name, category: entry.category, status: entry.category === "Ativa" ? "Em utilização" : "Contratada", percentage: entry.category === "Ativa" ? 100 : 0, activatedAt: entry.category === "Ativa" ? today : "", updatedAt: today, owner: "", notes: "" };
    });
    void onSave(features);
  };
  return <ModalShell title="Gerenciar features" subtitle="Selecione várias funcionalidades cadastradas. O score considera a quantidade total disponível no cadastro." onClose={onClose}><div className="enterprise-feature-manager">{groups.map((group) => { const options = [...new Map(catalog.filter((entry) => entry.category === group).map((entry) => [entry.name, entry])).values()]; return <section key={group}><header><span>{group === "Ativa" ? "EM USO" : group.toUpperCase()}</span><b>{options.filter((entry) => selected.has(`${entry.category}:${entry.name}`)).length}/{options.length}</b></header><div>{options.length === 0 ? <p>Nenhuma feature cadastrada nesta categoria.</p> : options.map((entry) => { const key = `${entry.category}:${entry.name}`; return <label key={key} className={selected.has(key) ? "selected" : ""}><input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} /><span>{entry.name}</span></label>; })}</div></section>; })}<div className="form-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} onClick={saveSelection}><Save size={15} /> Salvar seleção</button></div></div></ModalShell>;
}

function CustomerSuccessModule({ flow, catalogs, items, agendaModule, employees, currentUser, busy, canEdit, canDelete, operate, onOpenSettings }: { flow: CsFlow; catalogs: CustomerCatalogOption[]; items: WorkItem[]; agendaModule: AgendaModuleData | null; employees: Employee[]; currentUser: AppData["user"]; busy: boolean; canEdit: boolean; canDelete: boolean; operate: (payload: Record<string, unknown>, success: string) => Promise<OperationResult>; onOpenSettings?: () => void }) {
  const [tab, setTab] = useState<"validation" | "activation">("validation");
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [usageFilter, setUsageFilter] = useState("all");
  const [conferenceOnly, setConferenceOnly] = useState(false);
  const activeCatalogs = catalogs.filter((entry) => entry.active);
  const onboardingItems = items.filter((item) => item.module === "cs" && parseCsJourney(item.description));
  const isCoordinator = currentUser.isCoordinator || /admin|gestor|coordenador/i.test(currentUser.role);
  if (flow === "enterprise") return <EnterpriseNetworksModule items={items} catalogs={activeCatalogs} employees={employees.filter((entry) => entry.active)} currentUser={currentUser} busy={busy} canEdit={canEdit} canDelete={canDelete} operate={operate} onOpenSettings={onOpenSettings} />;
  const visible = flow === "onboarding"
    ? onboardingItems.filter((item) => { const journey = parseCsJourney(item.description); return tab === "validation" ? journey?.phase === "validation" || journey?.phase === "validationFinal" : journey?.phase === "activation" && (isCoordinator || item.owner === currentUser.displayName); })
    : flow === "evolution" ? onboardingItems.filter((item) => parseCsJourney(item.description)?.phase === "evolution" && (isCoordinator || item.owner === currentUser.displayName))
      : onboardingItems.filter((item) => parseCsJourney(item.description)?.phase !== "closed");
  const filtered = visible.filter((item) => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    const matchesQuery = !needle || `${item.id} ${item.title} ${item.customer_name} ${item.owner}`.toLocaleLowerCase("pt-BR").includes(needle);
    const journey = parseCsJourney(item.description);
    return matchesQuery
      && (ownerFilter === "all" || item.owner === ownerFilter)
      && (usageFilter === "all" || journey?.usage === usageFilter)
      && (!conferenceOnly || journey?.status === "Conferência");
  });
  const requestConference = async (item: WorkItem) => {
    const journey = parseCsJourney(item.description);
    if (!journey || journey.status === "Conferência") return;
    await operate({ action: "updateWorkItem", id: item.id, title: item.title, owner: item.owner, amountCents: item.amount_cents, version: item.version, description: JSON.stringify({ ...journey, status: "Conferência", conferenceRequestedAt: new Date().toISOString(), follows: [...journey.follows, { text: "Cliente encaminhado para conferência da coordenação.", createdAt: new Date().toISOString() }] }) }, "Cliente enviado para conferência.");
  };
  const title = flow === "onboarding" ? "Onboarding" : flow === "evolution" ? "Evolução" : "Contas estratégicas";
  const description = flow === "onboarding" ? "Valide novas vendas e acompanhe a ativação de cada cliente." : flow === "evolution" ? "Acompanhe a jornada, utilização e follow-ups dos clientes ativos." : "Acompanhe contas prioritárias e suas interações.";
  return <section className="commercial-leads-module cs-module"><PageHeader eyebrow="OPERAÇÃO · CS" title={title} description={description} />
    {flow === "onboarding" && <div className="segmented cs-tabs"><button className={tab === "validation" ? "active" : ""} onClick={() => setTab("validation")}>Validação coordenação</button><button className={tab === "activation" ? "active" : ""} onClick={() => setTab("activation")}>Ativação</button></div>}
    <section className="cs-journey-filters panel"><label className="commercial-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar por ID, cliente ou responsável" /></label><label>Colaborador<select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="all">Todos os colaboradores</option>{[...new Set(onboardingItems.map((item) => item.owner).filter(Boolean))].map((owner) => <option key={owner}>{owner}</option>)}</select></label><label>Utilização<select value={usageFilter} onChange={(event) => setUsageFilter(event.target.value)}><option value="all">Todas</option>{activeCatalogs.filter((entry) => entry.catalog === "csUsage").map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label><button type="button" className={`secondary-button cs-conference-filter ${conferenceOnly ? "active" : ""}`} onClick={() => setConferenceOnly((current) => !current)}>Para conferir</button><span>{filtered.length} cliente(s) encontrado(s)</span></section>
    <section className="cs-journey-grid">{filtered.length === 0 ? <div className="commercial-empty panel"><ClipboardCheck size={23} /><h2>Nenhum cliente nesta etapa</h2><p>Os clientes enviados pelo CRM Comercial aparecerão aqui automaticamente.</p></div> : filtered.map((item) => { const journey = parseCsJourney(item.description); return <CsJourneyCard key={item.id} item={item} commercialSource={items.find((entry) => entry.id === journey?.sourceLeadId)} canEdit={canEdit} canDelete={canDelete} onOpen={() => setSelected(item)} onRequestConference={flow === "evolution" && canEdit ? () => { void requestConference(item); } : undefined} onDelete={() => { void operate({ action: "deleteWorkItem", id: item.id }, "Cliente excluído com sucesso."); }} />; })}</section>
    {selected && <CsJourneyDrawer item={selected} commercialSource={items.find((entry) => entry.id === parseCsJourney(selected.description)?.sourceLeadId)} catalogs={activeCatalogs} agendaModule={agendaModule} employees={employees.filter((entry) => entry.active)} currentUser={currentUser} busy={busy} canEdit={canEdit} isCoordinator={isCoordinator} onClose={() => setSelected(null)} onAgendaOperation={operate} onSave={async (payload) => {
      const result = await operate({ action: "updateWorkItem", id: selected.id, title: selected.title, owner: selected.owner, amountCents: selected.amount_cents, version: selected.version, ...payload }, "Onboarding atualizado com sucesso.");
      if (result) setSelected((current) => current ? { ...current, ...("owner" in payload ? { owner: String(payload.owner) } : {}), ...("description" in payload ? { description: String(payload.description) } : {}), version: current.version + 1, updated_at: new Date().toISOString() } : current);
      return result;
    }} />}
  </section>;
}

function CsJourneyCard({ item, commercialSource, canEdit, canDelete, onOpen, onRequestConference, onDelete }: { item: WorkItem; commercialSource?: WorkItem; canEdit: boolean; canDelete: boolean; onOpen: () => void; onRequestConference?: () => void; onDelete: () => void }) {
  const journey = parseCsJourney(item.description);
  const commercial = commercialSource ? parseCommercialLead(commercialSource.description) : null;
  const days = Math.max(0, Math.floor((Date.now() - new Date(item.updated_at).getTime()) / 86_400_000));
  const base = journey?.featuresBase ?? [];
  const active = journey?.featuresActive ?? [];
  const healthScore = base.length ? Math.max(0, Math.min(1, active.filter((feature) => base.includes(feature)).length / base.length)) : null;
  const usagePercent = healthScore === null ? null : Math.round(healthScore * 100);
  return <article className="commercial-lead-card cs-journey-card"><button className="cs-card-open" onClick={onOpen}><span className="commercial-card-top"><b>{item.title.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</b><i>{journey?.phase === "evolution" ? "Evolução" : journey?.phase === "activation" ? "Ativação" : "Validação"}</i></span><strong>{item.title}</strong><small>{item.customer_name || "Cliente não informado"}</small><p>{journey?.status || (journey?.firstMeetingAt ? "1ª reunião realizada" : "Aguardando validação")}</p>{commercial && <small className="cs-commercial-context">Comercial · {commercial.source || "Origem não informada"} · {commercial.products.length} produto(s)</small>}{journey?.labels && journey.labels.length > 0 && <div className="cs-card-labels">{journey.labels.map((label) => <span key={label}>{label}</span>)}</div>}<div className="cs-card-usage"><span><small>Utilização</small><strong>{journey?.usage || "Não definida"}</strong></span><span><small>Aderência</small><strong>{usagePercent === null ? "—" : `${usagePercent}%`}</strong></span></div><footer><span>{days} dia(s) em acompanhamento</span><b>{usagePercent === null ? "Features pendentes" : `${active.length}/${base.length} ativas`}</b></footer></button><div className="cs-card-actions">{canEdit && <button type="button" onClick={onOpen}><Pencil size={14} /> Editar</button>}{canDelete && <button type="button" className="delete" onClick={onDelete}><Trash2 size={14} /> Excluir</button>}</div>{onRequestConference && journey?.status !== "Conferência" && <button type="button" className="cs-conference-button" onClick={onRequestConference}>Enviar para conferência</button>}</article>;
}

function CsMultiChoiceList({ label, help, options, selected, disabled, onChange }: { label: string; help: string; options: CustomerCatalogOption[]; selected: string[]; disabled: boolean; onChange: (values: string[]) => void }) {
  const toggle = (value: string, checked: boolean) => onChange(checked ? [...new Set([...selected, value])] : selected.filter((entry) => entry !== value));
  return <fieldset className="cs-multi-choice"><legend>{label}<small>{selected.length} selecionada(s)</small></legend><div>{options.length === 0 ? <span className="cs-empty-choice">Nenhuma opção cadastrada.</span> : options.map((option) => <label key={option.id}><input type="checkbox" checked={selected.includes(option.name)} disabled={disabled} onChange={(event) => toggle(option.name, event.target.checked)} /><span>{option.name}</span></label>)}</div><small>{help}</small></fieldset>;
}

function CsJourneyDrawer({ item, commercialSource, catalogs, agendaModule, employees, currentUser, busy, canEdit, isCoordinator, onClose, onAgendaOperation, onSave }: { item: WorkItem; commercialSource?: WorkItem; catalogs: CustomerCatalogOption[]; agendaModule: AgendaModuleData | null; employees: Employee[]; currentUser: AppData["user"]; busy: boolean; canEdit: boolean; isCoordinator: boolean; onClose: () => void; onAgendaOperation: (payload: Record<string, unknown>, success: string) => Promise<OperationResult>; onSave: (payload: Record<string, unknown>) => Promise<OperationResult> }) {
  const journey = parseCsJourney(item.description) ?? { kind: "csJourney", phase: "validation", follows: [] as CsJourney["follows"] };
  const commercial = commercialSource ? parseCommercialLead(commercialSource.description) : null;
  const [responsible, setResponsible] = useState(item.owner === "Coordenação de CS" ? "" : item.owner);
  const [firstMeeting, setFirstMeeting] = useState(journey.firstMeetingAt?.slice(0, 10) ?? "");
  const [firstMeetingTime, setFirstMeetingTime] = useState(journey.firstMeetingTime ?? "");
  const [training, setTraining] = useState(journey.trainingAt?.slice(0, 10) ?? "");
  const [trainingTime, setTrainingTime] = useState(journey.trainingTime ?? "");
  const [rescheduled, setRescheduled] = useState(journey.rescheduledAt?.slice(0, 10) ?? "");
  const [rescheduledTime, setRescheduledTime] = useState(journey.rescheduledTime ?? "");
  const [meetingLink, setMeetingLink] = useState(journey.meetingLink ?? "");
  const [reason, setReason] = useState(journey.finalReason ?? "");
  const [approvalReason, setApprovalReason] = useState(journey.approvalReason ?? "");
  const [follow, setFollow] = useState("");
  const [comment, setComment] = useState("");
  const catalogEntries = (catalog: string, fallback?: string) => { const current = catalogs.filter((entry) => entry.active && entry.catalog === catalog); return current.length || !fallback ? current : catalogs.filter((entry) => entry.active && entry.catalog === fallback); };
  const statuses = catalogEntries("csFinalStatus", "csStatus"); const usages = catalogEntries("csUsage"); const callStatuses = catalogEntries("csCallStatus"); const reasons = catalogEntries("csRejectionReason", "csReason"); const approvalReasons = catalogEntries("csApprovalReason"); const featureBaseOptions = catalogEntries("csFeatureBase", "csFeature"); const featureActiveOptions = catalogEntries("csFeatureActive", "csFeature"); const featurePlusOptions = catalogEntries("csFeaturePlus", "csFeature"); const labelOptions = catalogEntries("csLabel");
  const [status, setStatus] = useState(journey.status ?? ""); const [usage, setUsage] = useState(journey.usage ?? ""); const [callStatus, setCallStatus] = useState(journey.callStatus ?? "");
  const [featuresBase, setFeaturesBase] = useState(journey.featuresBase ?? []); const [featuresActive, setFeaturesActive] = useState(journey.featuresActive ?? []); const [featuresPlus, setFeaturesPlus] = useState(journey.featuresPlus ?? []); const [labels, setLabels] = useState(journey.labels ?? []);
  const save = (next: CsJourney, owner = item.owner, message = "Atualização registrada no Onboarding.") => onSave({ owner, description: JSON.stringify({ ...next, follows: [...next.follows, { text: message, createdAt: new Date().toISOString() }] }) });
  const activationCalendar = agendaModule?.calendars.find((calendar) => {
    const value = `${calendar.name} ${calendar.departmentName}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return value.includes("sucesso do cliente") && value.includes("ativacao");
  }) ?? agendaModule?.calendars.find((calendar) => `${calendar.name} ${calendar.departmentName}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("sucesso do cliente"));
  const scheduleInAgenda = async (kind: "1ª reunião de onboarding" | "Treinamento", date: string, time: string, commitmentKey: "firstMeetingCommitmentId" | "trainingCommitmentId") => {
    if (!agendaModule || !activationCalendar || !date) return false;
    if (journey[commitmentKey]) return false;
    const type = agendaModule.types.find((entry) => entry.active);
    const status = agendaModule.statuses.find((entry) => entry.active);
    const responsible = agendaModule.collaborators.find((entry) => entry.name === item.owner) ?? agendaModule.collaborators.find((entry) => entry.departmentId === activationCalendar.departmentId);
    if (!type || !status || !responsible) return false;
    const startsAt = new Date(`${date}T${time || "09:30"}:00`).toISOString();
    const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString();
    return onAgendaOperation({ action: "createAgendaCommitment", agendaId: activationCalendar.id, agendaTypeId: type.id, agendaStatusId: status.id, responsibleUserId: responsible.id, title: `${kind} · ${item.title}`, description: `Onboarding do cliente ${journey.clientId || item.customer_name || item.title}. ${meetingLink ? `Link: ${meetingLink}` : ""}`, startsAt, endsAt, participantUserIds: [], recurrence: "none" }, `${kind} agendado na Agenda com sucesso.`);
  };
  const trackedDays = Math.max(0, Math.floor((Date.now() - new Date(item.updated_at).getTime()) / 86_400_000));
  const healthScore = featuresBase.length ? Math.max(0, Math.min(1, featuresActive.filter((feature) => featuresBase.includes(feature)).length / featuresBase.length)) : null;
  return <div className="drawer-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><aside className="drawer commercial-lead-drawer"><header className="drawer-head simple"><div><span className="eyebrow">CS · {journey.phase === "validation" ? "VALIDAÇÃO" : journey.phase === "activation" ? "ATIVAÇÃO" : "EVOLUÇÃO"}</span><h2>{item.title}</h2><p>{item.customer_name || "Cliente não informado"}</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></header><div className="commercial-lead-drawer-content"><section className="lead-summary-grid"><div><span>Responsável</span><strong>{item.owner}</strong><small>{journey.status || "Sem status"}</small></div><div><span>Valor comercial</span><strong>{formatMoney(item.amount_cents)}</strong><small>{journey.usage || "Utilização não definida"}</small></div><div><span>Interações</span><strong>{journey.follows.length}</strong><small>follow-ups registrados</small></div><div><span>Acompanhamento</span><strong>{trackedDays} dias</strong><small>{healthScore === null ? "Health Score não definido" : `Health Score ${Math.round(healthScore * 100)}%`}</small></div></section>
    {commercial && <section className="lead-drawer-section cs-commercial-context-panel"><div className="panel-header"><div><span className="eyebrow">ORIGEM COMERCIAL</span><h3>Informações preservadas da oportunidade</h3></div></div><div className="lead-control-grid"><label>Telefone<input readOnly value={commercial.phone || "Não informado"} /></label><label>Origem<input readOnly value={commercial.source || "Não informada"} /></label><label>Vendedor<input readOnly value={commercial.seller || commercialSource?.owner || "Não informado"} /></label><label>Temperatura<input readOnly value={commercial.temperature || "Não definida"} /></label></div>{commercial.products.length > 0 && <div className="lead-products-drawer">{commercial.products.map((product, index) => <div key={`${product.product}-${index}`}><span><strong>{product.product}</strong><small>{product.plan || "Plano não definido"} · {product.quantity} unidade(s)</small></span><b>{formatMoney(Math.round(product.value * product.quantity * 100))}</b></div>)}</div>}</section>}
    {journey.phase === "validation" && <section className="lead-drawer-section"><div className="panel-header"><div><span className="eyebrow">COORDENAÇÃO</span><h3>Validar e encaminhar ativação</h3></div></div><label>Responsável pela ativação<select value={responsible} disabled={!canEdit} onChange={(event) => setResponsible(event.target.value)}><option value="">Selecione um colaborador</option>{employees.map((employee) => <option key={employee.id}>{employee.displayName}</option>)}</select></label><div className="drawer-actions"><button className="primary-button" disabled={!canEdit || busy || !responsible} onClick={() => void save({ ...journey, phase: "activation" }, responsible)}>Aprovar e encaminhar</button></div></section>}
    {journey.phase === "activation" && <section className="lead-drawer-section cs-activation-section"><div className="panel-header"><div><span className="eyebrow">ATIVAÇÃO</span><h3>Reuniões, link e treinamento</h3><p>Agende os compromissos diretamente na Agenda para manter o Diário de Bordo atualizado.</p></div></div><div className="cs-meeting-grid"><label>1ª reunião de onboarding<input type="date" value={firstMeeting} disabled={!canEdit} onChange={(event) => setFirstMeeting(event.target.value)} /></label><label>Horário<input type="time" value={firstMeetingTime} disabled={!canEdit} onChange={(event) => setFirstMeetingTime(event.target.value)} /></label><label className="wide">Link da reunião (Google Meet)<input type="url" value={meetingLink} disabled={!canEdit} onChange={(event) => setMeetingLink(event.target.value)} placeholder="https://meet.google.com/..." /></label></div><div className="drawer-actions"><button className="secondary-button" disabled={!canEdit || busy || !firstMeeting || Boolean(journey.firstMeetingCommitmentId)} onClick={() => void (async () => { const scheduled = await scheduleInAgenda("1ª reunião de onboarding", firstMeeting, firstMeetingTime, "firstMeetingCommitmentId"); if (scheduled) await save({ ...journey, firstMeetingAt: `${firstMeeting}T${firstMeetingTime || "09:30"}:00`, firstMeetingTime, meetingLink, firstMeetingCommitmentId: scheduled.id }); })()}>{journey.firstMeetingCommitmentId ? "1ª reunião agendada" : "Agendar 1ª reunião"}</button></div><div className="cs-meeting-grid"><label>Treinamento<input type="date" value={training} disabled={!canEdit} onChange={(event) => setTraining(event.target.value)} /></label><label>Horário<input type="time" value={trainingTime} disabled={!canEdit} onChange={(event) => setTrainingTime(event.target.value)} /></label></div><div className="drawer-actions"><button className="primary-button" disabled={!canEdit || busy || !training || Boolean(journey.trainingCommitmentId)} onClick={() => void (async () => { const scheduled = await scheduleInAgenda("Treinamento", training, trainingTime, "trainingCommitmentId"); if (scheduled) await save({ ...journey, trainingAt: `${training}T${trainingTime || "09:30"}:00`, trainingTime, meetingLink, trainingCommitmentId: scheduled.id, phase: "evolution" }); })()}>{journey.trainingCommitmentId ? "Treinamento agendado" : "Agendar treinamento · enviar para Evolução"}</button></div><div className="cs-meeting-grid"><label>Treinamento remarcado<input type="date" value={rescheduled} disabled={!canEdit} onChange={(event) => setRescheduled(event.target.value)} /></label><label>Horário<input type="time" value={rescheduledTime} disabled={!canEdit} onChange={(event) => setRescheduledTime(event.target.value)} /></label></div><div className="drawer-actions"><button className="secondary-button" disabled={!canEdit || busy || !rescheduled} onClick={() => void save({ ...journey, rescheduledAt: `${rescheduled}T${rescheduledTime || "12:00"}:00`, rescheduledTime, meetingLink })}>Salvar remarcação</button><button className="secondary-button danger-action" disabled={!canEdit || busy} onClick={() => void save({ ...journey, phase: "validationFinal" }, "Coordenação de CS", "Cliente devolvido para validação por falta de retorno.")}>Finalizar por falta de retorno</button></div></section>}
    {journey.phase === "validationFinal" && <section className="lead-drawer-section"><div className="panel-header"><div><span className="eyebrow">VERIFICAÇÃO FINAL</span><h3>Finalizar por falta de retorno</h3></div></div><label>Motivo<select value={reason} disabled={!canEdit} onChange={(event) => setReason(event.target.value)}><option value="">Selecione um motivo</option>{reasons.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label><div className="drawer-actions"><button className="primary-button" disabled={!canEdit || busy || !reason} onClick={() => void save({ ...journey, phase: "closed", finalReason: reason })}>Confirmar finalização</button></div></section>}
    {journey.phase === "evolution" && <section className="lead-drawer-section cs-evolution-section"><div className="panel-header"><div><span className="eyebrow">EVOLUÇÃO</span><h3>Saúde, features e follow-up</h3><p>Atualize o acompanhamento e confira o Health Score do cliente.</p></div></div><div className="lead-control-grid"><label>Status final<select value={status} disabled={!canEdit} onChange={(event) => setStatus(event.target.value)}><option value="">Selecionar</option>{statuses.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label><label>Status de uso<select value={usage} disabled={!canEdit} onChange={(event) => setUsage(event.target.value)}><option value="">Selecionar</option>{usages.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label><label>Status de ligação<select value={callStatus} disabled={!canEdit} onChange={(event) => setCallStatus(event.target.value)}><option value="">Selecionar</option>{callStatuses.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label></div><div className="cs-feature-grid"><CsMultiChoiceList label="Features Base" help="Funcionalidades previstas para este cliente." options={featureBaseOptions} selected={featuresBase} disabled={!canEdit} onChange={setFeaturesBase} /><CsMultiChoiceList label="Features Ativas" help="Usadas no cálculo de aderência." options={featureActiveOptions} selected={featuresActive} disabled={!canEdit} onChange={setFeaturesActive} /><CsMultiChoiceList label="Features Plus" help="Funcionalidades adicionais contratadas." options={featurePlusOptions} selected={featuresPlus} disabled={!canEdit} onChange={setFeaturesPlus} /></div><CsMultiChoiceList label="Etiquetas" help="Marcadores visíveis no card do cliente." options={labelOptions} selected={labels} disabled={!canEdit} onChange={setLabels} /><label>Registro do follow-up<textarea value={follow} disabled={!canEdit} onChange={(event) => setFollow(event.target.value)} placeholder="Registre a interação com o cliente." rows={4} /></label><div className="drawer-actions"><button className="secondary-button" disabled={!canEdit || busy} onClick={() => void save({ ...journey, status, usage, callStatus, featuresBase, featuresActive, featuresPlus, labels }, item.owner, "Acompanhamento atualizado.")}>Salvar acompanhamento</button><button className="primary-button" disabled={!canEdit || busy || !follow.trim()} onClick={() => void save({ ...journey, status, usage, callStatus, featuresBase, featuresActive, featuresPlus, labels, follows: [...journey.follows, { text: follow.trim(), createdAt: new Date().toISOString() }] }, item.owner, "Follow-up registrado.")}>Registrar follow-up</button></div></section>}
    {journey.status === "Conferência" && isCoordinator && <section className="lead-drawer-section cs-conference-section"><div className="panel-header"><div><span className="eyebrow">CONFERÊNCIA DA COORDENAÇÃO</span><h3>Validar acompanhamento</h3><p>Registre sua análise antes de finalizar este cliente.</p></div></div><label>Motivo de aprovação<select value={approvalReason} disabled={!canEdit} onChange={(event) => setApprovalReason(event.target.value)}><option value="">Selecione um motivo</option>{approvalReasons.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label><label>Comentário da conferência<textarea value={comment} disabled={!canEdit} onChange={(event) => setComment(event.target.value)} placeholder="Descreva a conferência, decisão ou próximo passo..." rows={4} /></label><div className="drawer-actions"><button className="secondary-button" disabled={!canEdit || busy} onClick={() => void save({ ...journey, approvalReason, conferenceConfirmedAt: new Date().toISOString() }, item.owner, "Conferência visualizada pela coordenação.")}>Confirmar visualização</button><button className="primary-button" disabled={!canEdit || busy || !comment.trim() || (approvalReasons.length > 0 && !approvalReason)} onClick={() => void save({ ...journey, phase: "closed", status: "Finalizado", approvalReason, conferenceConfirmedAt: new Date().toISOString(), follows: [...journey.follows, { text: comment.trim(), createdAt: new Date().toISOString() }] }, item.owner, "Cliente finalizado pela coordenação.")}>Finalizar cliente</button></div></section>}
    <section className="lead-drawer-section cs-comments-section"><div className="panel-header"><div><span className="eyebrow">INTERAÇÕES</span><h3>Comentários e follow-ups</h3><p>Todos os times registram aqui uma linha única de histórico.</p></div></div><label>Adicionar comentário<textarea value={comment} disabled={!canEdit} onChange={(event) => setComment(event.target.value)} placeholder="Registre uma observação, decisão ou próximo passo..." rows={3} /></label><div className="drawer-actions"><button className="secondary-button" disabled={!canEdit || busy || !comment.trim()} onClick={() => void save({ ...journey, follows: [...journey.follows, { text: comment.trim(), createdAt: new Date().toISOString() }] }, item.owner, "Comentário adicionado.").then((result) => { if (result) setComment(""); })}>Adicionar comentário</button></div></section>
    {journey.follows.length > 0 && <section className="lead-drawer-section"><div className="panel-header"><div><span className="eyebrow">HISTÓRICO</span><h3>Interações</h3></div></div><div className="lead-follow-history">{journey.follows.slice().reverse().map((entry, index) => <article key={`${entry.createdAt}-${index}`}><strong>Follow-up</strong><time>{dateTime(entry.createdAt)}</time><p>{entry.text}</p></article>)}</div></section>}
  </div></aside></div>;
}

function AuditLogView({ events, departments = [] }: { events: AuditEvent[]; departments?: { name: string; active: boolean }[] }) {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("all");
  const [module, setModule] = useState("all");
  const [department, setDepartment] = useState("all");
  const [ipAddress, setIpAddress] = useState("all");
  const actions = [...new Set(events.map((entry) => entry.action))].sort();
  const modules = [...new Set(events.map((entry) => entry.module).filter(Boolean))].sort();
  const eventIp = (entry: AuditEvent) => { try { const detail=JSON.parse(entry.details) as Record<string,unknown>; return String(detail.IpAddress??detail.ipAddress??""); } catch { return ""; } };
  const surveyIps=[...new Set(events.map(eventIp).filter(Boolean))].sort();
  const actionLabel = (value: string) => ({
    Create: "Criação", Update: "Alteração", Delete: "Exclusão", Login: "Login", Logout: "Logout", Transition: "Movimentação", Upload: "Envio de arquivo", Download: "Download", Read: "Leitura", Save: "Salvamento", SurveyResponse: "Resposta de pesquisa",
  }[value.split(/[·._ -]/)[0] ?? value] ?? value.replace(/([a-z])([A-Z])/g, "$1 $2"));
  const moduleLabel = (value: string) => ({ admin: "Administração", commercial: "Comercial", cs: "CS", ti: "Desenvolvimento", tasks: "Tarefas", work: "Agenda", suggestions: "Sugestões", notices: "Avisos", diary: "Diário de Bordo", notes: "Anotações", access: "Acesso", surveys: "Pesquisa de satisfação" }[value] ?? value);
  const resourceLabel = (value: string) => ({ work_Item: "Registro", WorkItem: "Registro", CustomerCatalog: "Cadastro", Process: "Processo seletivo", Candidate: "Candidato" }[value] ?? value.replace(/_/g, " "));
  const visible = events.filter((entry) => {
    const matchesSearch = `${entry.action} ${entry.resource} ${entry.actor_email} ${entry.module} ${entry.details}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"));
    const matchesDepartment = department === "all" || `${entry.details} ${entry.module}`.toLocaleLowerCase("pt-BR").includes(department.toLocaleLowerCase("pt-BR"));
    return matchesSearch && matchesDepartment && (action === "all" || entry.action === action) && (module === "all" || entry.module === module) && (ipAddress==="all"||eventIp(entry)===ipAddress);
  });
  const formatDetails = (details: string) => {
    try {
      const value = JSON.parse(details) as Record<string, unknown>;
      const fields: Record<string, string> = { RecordType: "Tipo", Title: "Título", Status: "Status", Agenda: "Agenda", Type: "Tipo", Team: "Setor", Department: "Setor", Owner: "Responsável", Name: "Nome", Email: "E-mail", IpAddress:"IP", Employee:"Colaborador", Survey:"Pesquisa", Token:"Link individual" };
      return Object.entries(value).map(([key, content]) => `${fields[key] ?? key}: ${String(content)}`).join(" · ");
    } catch { return details || "Alteração registrada"; }
  };
  return <><PageHeader eyebrow="ADMINISTRAÇÃO" title="Auditoria" description="Histórico central de inclusões, alterações, exclusões, logins e movimentações." /><div className="toolbar audit-toolbar audit-filters"><div className="field-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar ação, usuário ou módulo" /></div><label>Ação<select value={action} onChange={(event) => setAction(event.target.value)}><option value="all">Todas</option>{actions.map((entry) => <option key={entry} value={entry}>{actionLabel(entry)}</option>)}</select></label><label>Setor<select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">Todos</option>{departments.filter((entry) => entry.active).map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></label><label>Módulo<select value={module} onChange={(event) => setModule(event.target.value)}><option value="all">Todos</option>{modules.map((entry) => <option key={entry} value={entry}>{moduleLabel(entry)}</option>)}</select></label><label>IP da pesquisa<select value={ipAddress} onChange={event=>setIpAddress(event.target.value)}><option value="all">Todos os IPs</option>{surveyIps.map(entry=><option key={entry}>{entry}</option>)}</select></label><span>{visible.length} evento(s)</span></div><section className="audit-list audit-full-list">{visible.length === 0 ? <EmptyState text="Nenhum evento encontrado." /> : visible.map((entry) => <article key={entry.id}><span className="audit-icon"><Activity size={15} /></span><span><strong>{actionLabel(entry.action)} · {resourceLabel(entry.resource)}</strong><small>{formatDetails(entry.details)}</small><small>{entry.actor_email} · {moduleLabel(entry.module)}</small></span><time>{dateTime(entry.created_at)}</time><b className={`status-pill ${statusTone(entry.result)}`}>{entry.result === "Success" ? "Sucesso" : entry.result === "Failure" ? "Falha" : entry.result}</b></article>)}</section></>;
}

function RecruitmentView({ data, busy, onOperate }: { data: AppData; busy: boolean; onOperate: (payload: Record<string, unknown>, success: string) => Promise<OperationResult> }) {
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const catalogs = data.customerModule?.catalogs.filter((entry) => entry.active) ?? [];
  const vacancies = catalogs.filter((entry) => entry.catalog === "recruitmentVacancy");
  const sectors = (data.access?.departments ?? []).filter((entry) => entry.active);
  const stages = catalogs.filter((entry) => entry.catalog === "recruitmentStage");
  const candidates = data.items.filter((item) => item.module === "admin" && item.record_type === "Candidato").filter((item) => `${item.title} ${item.customer_name} ${item.owner}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const result = await onOperate({ action: "createWorkItem", module: "admin", recordType: "Candidato", title: form.get("name"), customerName: form.get("email"), owner: form.get("phone"), team: form.get("sector"), status: form.get("stage") || stages[0]?.name || "Currículo", priority: "P3", amountCents: 0, description: JSON.stringify({ vacancy: form.get("vacancy"), notes: form.get("notes"), comments: [] }) }, "Candidato adicionado ao processo seletivo."); if (result) setCreating(false); };
  return <><PageHeader eyebrow="ADMINISTRAÇÃO" title="Processo seletivo" description="Organize vagas, candidaturas, comentários e evolução em etapas." action={<span className="catalog-head-actions"><button className="secondary-button" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/?application=processo-seletivo`)}><FileCheck2 size={16} /> Copiar link de inscrição</button><button className="primary-button" onClick={() => setCreating(true)}><UserPlus size={16} /> Adicionar candidato</button></span>} /><div className="toolbar"><div className="field-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar candidato, e-mail ou telefone" /></div><span>{candidates.length} candidato(s)</span></div><section className="recruitment-board">{(stages.length ? stages : [{ id: "initial", name: "Currículo" } as CustomerCatalogOption]).map((stage) => <article className="recruitment-column" key={stage.id}><header><strong>{stage.name}</strong><b>{candidates.filter((candidate) => candidate.status === stage.name).length}</b></header>{candidates.filter((candidate) => candidate.status === stage.name).map((candidate) => <button className="recruitment-candidate" key={candidate.id} onClick={() => setSelected(candidate)}><strong>{candidate.title}</strong><small>{candidate.customer_name}</small><span>{candidate.owner || "Sem telefone"}</span></button>)}</article>)}</section>{creating && <ModalShell title="Adicionar candidato" subtitle="O candidato será incluído na primeira etapa selecionada." onClose={() => setCreating(false)}><form className="form-grid" onSubmit={create}><label className="wide">Nome *<input name="name" required autoFocus /></label><label>E-mail *<input name="email" type="email" required /></label><label>Telefone<input name="phone" /></label><label>Vaga<select name="vacancy">{vacancies.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label>Setor<select name="sector">{sectors.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label>Etapa inicial<select name="stage">{stages.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label className="wide">Observações<textarea name="notes" rows={4} /></label><div className="form-actions wide"><button type="button" onClick={() => setCreating(false)}>Cancelar</button><button className="primary-button" disabled={busy} type="submit">Adicionar</button></div></form></ModalShell>}{selected && <CandidateDrawer candidate={selected} stages={stages} busy={busy} onClose={() => setSelected(null)} onOperate={onOperate} />}</>;
}

function PublicRecruitmentApplication({ data, processId, busy, onOperate }: { data: AppData; processId: string; busy: boolean; onOperate: (payload: Record<string, unknown>, success: string) => Promise<OperationResult> }) {
  const [sent, setSent] = useState(false);
  const catalogs = data.customerModule?.catalogs.filter((entry) => entry.active) ?? [];
  const stages = catalogs.filter((entry) => entry.catalog === "recruitmentStage");
  const process = data.items.find((item) => item.id === processId && item.module === "admin" && item.record_type === "Processo seletivo");
  const details = (() => { try { return JSON.parse(process?.description ?? "{}") as { vacancy?: string; sector?: string; description?: string; requirements?: string }; } catch { return {}; } })();
  const processIsOpen = Boolean(process && process.status === "Ativo");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!process || !processIsOpen) return;
    const form = new FormData(event.currentTarget);
    const curriculum = form.get("curriculum");
    const curriculumFile = curriculum instanceof File && curriculum.size > 0 ? curriculum : null;
    if (curriculumFile && curriculumFile.size > 8 * 1024 * 1024) return;
    const curriculumData = curriculumFile ? await fileAsDataUrl(curriculumFile) : "";
    const result = await onOperate({ action: "createWorkItem", module: "admin", recordType: "Candidato", title: form.get("name"), customerName: form.get("email"), owner: form.get("phone"), team: process.team, status: stages[0]?.name || "Currículo", priority: "P3", amountCents: 0, description: JSON.stringify({ processId: process.id, vacancy: details.vacancy || process.customer_name, sector: details.sector || process.team, notes: form.get("notes"), curriculumName: curriculumFile?.name ?? "", curriculumData, comments: [] }) }, "Candidatura enviada com sucesso.");
    if (result) setSent(true);
  };
  if (!process) return <main className="public-application"><section className="public-application-card"><Image src="/dontus-logo.png" alt="Dontus" width={190} height={56} priority unoptimized /><h1>Processo não encontrado</h1><p>O link de candidatura não é válido ou este processo não está mais disponível.</p></section></main>;
  return <main className="public-application"><section className="public-application-card"><Image src="/dontus-logo.png" alt="Dontus Gestão Odontológica" width={190} height={56} priority unoptimized /><span className="eyebrow">DONTUS · GESTÃO ODONTOLÓGICA</span><h1>{details.vacancy || process.customer_name || "Processo seletivo"}</h1><p className="public-application-sector">{details.sector || process.team}</p>{!processIsOpen ? <div className="public-application-closed"><XCircle size={28} /><h2>Inscrições encerradas</h2><p>Este processo seletivo foi finalizado e não está mais recebendo candidaturas.</p></div> : sent ? <div className="public-application-success"><CheckCircle2 size={28} /><h2>Candidatura enviada!</h2><p>Recebemos suas informações. Caso seu perfil avance, entraremos em contato.</p></div> : <><div className="public-job-description"><h2>Sobre a vaga</h2><p>{details.description || "Preencha seus dados para participar do processo seletivo."}</p>{details.requirements && <><h3>Requisitos</h3><p>{details.requirements}</p></>}</div><form className="public-application-form" onSubmit={submit}><label>Nome completo *<input name="name" required autoFocus placeholder="Seu nome completo" /></label><div className="public-application-split"><label>Celular (WhatsApp) *<input name="phone" required placeholder="(00) 00000-0000" /></label><label>E-mail *<input name="email" type="email" required placeholder="seu@email.com" /></label></div><label className="upload-document-field">Currículo / carta de apresentação *<input name="curriculum" type="file" required accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /><small>Envie um PDF, DOC ou DOCX de até 8 MB.</small></label><label>Observações adicionais<textarea name="notes" rows={3} placeholder="Alguma informação adicional?" /></label><button className="primary-button" disabled={busy} type="submit">{busy ? "Enviando..." : "Enviar candidatura"}</button></form></>}</section></main>;
}

function RecruitmentWorkflowView({ data, busy, onOperate }: { data: AppData; busy: boolean; onOperate: (payload: Record<string, unknown>, success: string) => Promise<OperationResult> }) {
  const [newProcess, setNewProcess] = useState(false);
  const [newCandidate, setNewCandidate] = useState(false);
  const [process, setProcess] = useState<WorkItem | null>(null);
  const [query, setQuery] = useState("");
  const [vacancyFilter, setVacancyFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const catalogs = data.customerModule?.catalogs.filter((entry) => entry.active) ?? [];
  const vacancies = catalogs.filter((entry) => entry.catalog === "recruitmentVacancy");
  const sectors = (data.access?.departments ?? []).filter((entry) => entry.active);
  const stages = catalogs.filter((entry) => entry.catalog === "recruitmentStage");
  const info = (item: WorkItem) => { try { return JSON.parse(item.description) as { processId?: string; vacancy?: string; sector?: string }; } catch { return {}; } };
  const processes = data.items.filter((item) => item.module === "admin" && item.record_type === "Processo seletivo").filter((item) => {
    const value = info(item);
    const text = `${item.title} ${value.vacancy ?? ""} ${value.sector ?? ""}`.toLocaleLowerCase("pt-BR");
    return (!vacancyFilter || value.vacancy === vacancyFilter) && (!sectorFilter || value.sector === sectorFilter) &&
      (!query || text.includes(query.toLocaleLowerCase("pt-BR")));
  });
  const candidates = data.items.filter((item) => item.module === "admin" && item.record_type === "Candidato")
    .filter((item) => !process || info(item).processId === process.id)
    .filter((item) => `${item.title} ${item.customer_name} ${item.owner}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const saveProcess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const result = await onOperate({ action: "createWorkItem", module: "admin", recordType: "Processo seletivo", title: form.get("title"), customerName: form.get("vacancy"), owner: "", team: form.get("sector"), status: "Ativo", priority: "P3", amountCents: Number(form.get("salary") || 0) * 100, description: JSON.stringify({ vacancy: form.get("vacancy"), sector: form.get("sector"), description: form.get("description"), requirements: form.get("requirements") }) }, "Processo seletivo criado com sucesso.");
    if (result) setNewProcess(false);
  };
  const saveCandidate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const curriculum = form.get("curriculum");
    const curriculumFile = curriculum instanceof File && curriculum.size > 0 ? curriculum : null;
    if (curriculumFile && curriculumFile.size > 8 * 1024 * 1024) return;
    const curriculumData = curriculumFile ? await fileAsDataUrl(curriculumFile) : "";
    const result = await onOperate({ action: "createWorkItem", module: "admin", recordType: "Candidato", title: form.get("name"), customerName: form.get("email"), owner: form.get("phone"), team: process?.team ?? "", status: form.get("stage") || stages[0]?.name || "Currículo", priority: "P3", amountCents: 0, description: JSON.stringify({ processId: process?.id, vacancy: process ? info(process).vacancy : "", sector: process?.team ?? "", notes: form.get("notes"), curriculumName: curriculumFile?.name ?? "", curriculumData, comments: [] }) }, "Candidato adicionado ao processo seletivo.");
    if (result) setNewCandidate(false);
  };
  const copyLink = (item: WorkItem) => void navigator.clipboard?.writeText(`${window.location.origin}/?application=processo-seletivo&process=${item.id}`);
  const setProcessStatus = (item: WorkItem, status: "Ativo" | "Finalizado") => {
    if (item.status === status) return;
    void onOperate({ action: "transitionWorkItem", id: item.id, nextStatus: status, version: item.version, confirmed: true },
      status === "Ativo" ? "Processo reaberto para inscrições." : "Processo finalizado e inscrições encerradas.");
  };
  const moveCandidate = (candidateId: string, nextStatus: string) => {
    const candidate = candidates.find((item) => item.id === candidateId);
    if (!candidate || candidate.status === nextStatus || busy) return;
    void onOperate({ action: "transitionWorkItem", id: candidate.id, nextStatus, version: candidate.version, confirmed: true, boardMove: true }, `Candidato movido para ${nextStatus}.`);
  };
  return <><PageHeader eyebrow="ADMINISTRAÇÃO" title="Processo seletivo" description="Crie o processo, divulgue o link de candidatura e acompanhe cada etapa." action={<button className="primary-button" onClick={() => setNewProcess(true)}><Plus size={17} /> Novo processo seletivo</button>} />
    <div className="toolbar recruitment-filters"><div className="field-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar candidato, e-mail ou telefone" /></div><label>Vaga<select value={vacancyFilter} onChange={(event) => setVacancyFilter(event.target.value)}><option value="">Todas</option>{vacancies.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label>Setor<select value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value)}><option value="">Todos</option>{sectors.map((item) => <option key={item.id}>{item.name}</option>)}</select></label></div>
    {!process ? <section className="recruitment-process-list">{processes.length === 0 ? <EmptyState text="Crie o primeiro processo seletivo para iniciar as candidaturas." /> : processes.map((item) => { const detail = info(item); const count = data.items.filter((candidate) => candidate.record_type === "Candidato" && info(candidate).processId === item.id).length; const isOpen = item.status === "Ativo"; return <article key={item.id}><div><span className="eyebrow">PROCESSO SELETIVO</span><h2>{item.title}</h2><p>{detail.vacancy || item.customer_name} · {detail.sector || item.team}</p><div className="recruitment-process-meta"><small>{count} candidato(s)</small><label className={`recruitment-status-control ${isOpen ? "open" : "closed"}`}>Inscrições<select value={isOpen ? "Ativo" : "Finalizado"} disabled={busy} onChange={(event) => setProcessStatus(item, event.target.value as "Ativo" | "Finalizado")}><option>Ativo</option><option>Finalizado</option></select></label></div></div><div className="recruitment-process-actions"><button className="secondary-button" onClick={() => copyLink(item)}><FileCheck2 size={14} /> Copiar link</button><button className="primary-button" onClick={() => setProcess(item)}>Gerenciar <ChevronRight size={15} /></button></div></article>; })}</section> : <><div className="recruitment-manage-head"><button className="secondary-button" onClick={() => setProcess(null)}>← Processos</button><span><strong>{process.title}</strong><small>{info(process).vacancy || process.customer_name} · {process.team}</small></span><button className="primary-button" onClick={() => setNewCandidate(true)}><UserPlus size={16} /> Adicionar candidato</button></div><section className="recruitment-board">{(stages.length ? stages : [{ id: "initial", name: "Currículo" } as CustomerCatalogOption]).map((stage) => <article className="recruitment-column" key={stage.id} onDragOver={(event) => { if (!busy) { event.preventDefault(); event.currentTarget.classList.add("drag-over"); } }} onDragLeave={(event) => event.currentTarget.classList.remove("drag-over")} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove("drag-over"); moveCandidate(event.dataTransfer.getData("application/x-dontus-candidate"), stage.name); }}><header><strong>{stage.name}</strong><b>{candidates.filter((candidate) => candidate.status === stage.name).length}</b></header>{candidates.filter((candidate) => candidate.status === stage.name).map((candidate) => <article className="recruitment-candidate" role="button" tabIndex={0} draggable={!busy} key={candidate.id} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-dontus-candidate", candidate.id); }} onClick={() => setSelected(candidate)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelected(candidate); }}><span className="kanban-drag-hint" aria-hidden="true">⋮⋮</span><strong>{candidate.title}</strong><small>{candidate.customer_name}</small><span>{candidate.owner || "Sem telefone"}</span></article>)}</article>)}</section></>}
    {newProcess && <ModalShell title="Novo processo seletivo" subtitle="Defina a vaga antes de abrir o CRM de candidaturas." onClose={() => setNewProcess(false)}><form className="form-grid recruitment-process-modal" onSubmit={saveProcess}><label className="wide">Título do processo *<input name="title" required autoFocus placeholder="Ex.: PROCESSO_01_CS" /></label><label>Vaga *<select name="vacancy" required defaultValue=""><option value="" disabled>Selecione</option>{vacancies.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label>Setor *<select name="sector" required defaultValue=""><option value="" disabled>Selecione</option>{sectors.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label>Salário (R$)<input name="salary" type="number" min="0" step="0.01" /></label><label className="wide">Descrição da vaga<textarea name="description" required rows={3} /></label><label className="wide">Requisitos<textarea name="requirements" required rows={3} /></label><div className="form-actions wide"><button type="button" onClick={() => setNewProcess(false)}>Cancelar</button><button className="primary-button compact-save" disabled={busy} type="submit">Criar processo</button></div></form></ModalShell>}
    {newCandidate && <ModalShell title="Adicionar candidato" subtitle="O candidato entra na primeira etapa do processo." onClose={() => setNewCandidate(false)}><form className="form-grid recruitment-candidate-modal compact-form" onSubmit={saveCandidate}><label className="wide">Nome completo *<input name="name" required autoFocus /></label><label>Celular (WhatsApp) *<input name="phone" required /></label><label>E-mail *<input name="email" required type="email" /></label><label className="wide upload-document-field">Currículo / carta de apresentação<input name="curriculum" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /><small>PDF, DOC ou DOCX · máximo de 8 MB</small></label><label className="wide">Etapa inicial<select name="stage">{stages.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label className="wide">Observações<textarea name="notes" rows={3} /></label><div className="form-actions wide compact-form-actions"><button type="button" onClick={() => setNewCandidate(false)}>Cancelar</button><button className="primary-button compact-save" disabled={busy} type="submit">Adicionar</button></div></form></ModalShell>}
    {selected && <CandidateDrawer candidate={selected} stages={stages} busy={busy} onClose={() => setSelected(null)} onOperate={onOperate} />}</>;
}

function CandidateDrawer({ candidate, stages, busy, onClose, onOperate }: { candidate: WorkItem; stages: CustomerCatalogOption[]; busy: boolean; onClose: () => void; onOperate: (payload: Record<string, unknown>, success: string) => Promise<OperationResult> }) {
  const [comment, setComment] = useState("");
  const payload = (() => { try { return JSON.parse(candidate.description) as { vacancy?: string; notes?: string; comments?: string[]; curriculumName?: string; curriculumData?: string }; } catch { return {}; } })();
  const save = async (stage?: string) => {
    const result = stage
      ? await onOperate({ action: "transitionWorkItem", id: candidate.id, nextStatus: stage, version: candidate.version, confirmed: true }, "Etapa do candidato atualizada.")
      : await onOperate({ action: "updateWorkItem", id: candidate.id, module: "admin", recordType: candidate.record_type, title: candidate.title, customerName: candidate.customer_name, owner: candidate.owner, team: candidate.team, priority: candidate.priority, amountCents: candidate.amount_cents, description: JSON.stringify({ ...payload, comments: comment.trim() ? [...(payload.comments ?? []), comment.trim()] : payload.comments ?? [] }), version: candidate.version }, "Candidato atualizado com sucesso.");
    if (result) { setComment(""); if (stage) onClose(); }
  };
  return <div className="drawer-backdrop"><aside className="drawer"><div className="drawer-head"><div><span className="eyebrow">PROCESSO SELETIVO</span><h2>{candidate.title}</h2><p>{payload.vacancy || candidate.team || "Candidatura"}</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="detail-section"><h3>Contato</h3><p>{candidate.customer_name}</p><div className="drawer-actions"><button className="secondary-button" onClick={() => window.open(`https://wa.me/${String(candidate.owner).replace(/\D/g, "")}`, "_blank")}>Abrir WhatsApp</button>{payload.curriculumData && <a className="secondary-button" href={payload.curriculumData} download={payload.curriculumName || "curriculo"}>Baixar currículo</a>}</div></div><div className="detail-section"><label>Etapa atual<select defaultValue={candidate.status} disabled={busy} onChange={(event) => void save(event.target.value)}>{stages.map((stage) => <option key={stage.id}>{stage.name}</option>)}</select></label><label>Feedback interno<textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={4} placeholder="Registre observações sobre este candidato." /></label><button className="primary-button compact-save" disabled={busy || !comment.trim()} onClick={() => void save()}>Salvar comentário</button></div><div className="detail-section"><h3>Histórico</h3>{(payload.comments ?? []).map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}</div></aside></div>;
}

function AdminView({ data, section, onSection, busy, onOperate, backgroundImage, onBackgroundChange }: { data: AppData; section: AdminSection; onSection: (section: AdminSection) => void; busy: boolean; onOperate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string; temporaryPassword?: string } | false>; backgroundImage: string; onBackgroundChange: (image: string) => void }) {
  if (!data.access) return <EmptyState text="Seu perfil não possui acesso à administração." />;
  const configurationScreen: Partial<Record<AdminSection, string>> = { agenda: "work", suggestions: "suggestions", commercialCatalogs: "commercial", csCatalogs: "cs", liaCatalogs: "lia", serviceCatalogs: "support", waitingQueueCatalogs: "waitingQueue", enterpriseCatalogs: "cs", cancellationCatalogs: "cancellations", hrCatalogs: "hr", referralCatalogs: "referrals", recruitmentCatalogs: "admin" };
  const requiredConfiguration = configurationScreen[section];
  if (requiredConfiguration && !userCan(data.user, requiredConfiguration, "manage")) return <EmptyState text="Seu grupo permite consultar esta funcionalidade, mas não acessar ou alterar suas configurações." />;
  if (section === "collaborators") return <EmployeesAdmin access={data.access} roles={data.customerModule?.catalogs.filter(entry => entry.active && entry.catalog === "employeeRole").map(entry => entry.name) ?? []} busy={busy} onOperate={onOperate} onSection={onSection} />;
  if (section === "departments") return <EmployeeCatalog title="Setores" description="Cadastre os setores que serão exibidos no cadastro de colaboradores." items={data.access.departments} action="saveEmployeeDepartment" buttonLabel="Novo setor" busy={busy} onOperate={onOperate} section={section} onSection={onSection} />;
  if (section === "levels") return <EmployeeCatalog title="Níveis" description="Cadastre os níveis que serão exibidos no cadastro de colaboradores." items={data.access.levels} action="saveEmployeeLevel" buttonLabel="Novo nível" busy={busy} onOperate={onOperate} section={section} onSection={onSection} />;
  if (section === "agenda") return data.agendaModule ? <AgendaCatalogsModule module={data.agendaModule} busy={busy} operate={onOperate} /> : <EmptyState text="Não foi possível carregar os cadastros da agenda." />;
  if (section === "commercialCatalogs") return data.customerModule ? <CommercialCatalogsView catalogs={data.customerModule.catalogs} busy={busy} onOperate={onOperate} /> : <EmptyState text="Não foi possível carregar os cadastros comerciais." />;
  if (section === "csCatalogs") return data.customerModule ? <CommercialCatalogsView catalogs={data.customerModule.catalogs} busy={busy} onOperate={onOperate} scope="cs" /> : <EmptyState text="Não foi possível carregar os cadastros de CS." />;
  if (section === "liaCatalogs") return data.customerModule ? <CommercialCatalogsView catalogs={data.customerModule.catalogs} busy={busy} onOperate={onOperate} scope="lia" /> : <EmptyState text="Não foi possível carregar os cadastros da LIA." />;
  if (section === "serviceCatalogs") return data.customerModule ? <CommercialCatalogsView catalogs={data.customerModule.catalogs} busy={busy} onOperate={onOperate} scope="service" /> : <EmptyState text="Não foi possível carregar os cadastros de atendimentos." />;
  if (section === "waitingQueueCatalogs") return data.customerModule ? <CommercialCatalogsView catalogs={data.customerModule.catalogs} busy={busy} onOperate={onOperate} scope="waitingQueue" /> : <EmptyState text="Não foi possível carregar os cadastros da fila de espera." />;
  if (section === "enterpriseCatalogs") return data.customerModule ? <CommercialCatalogsView catalogs={data.customerModule.catalogs} busy={busy} onOperate={onOperate} scope="enterprise" /> : <EmptyState text="Não foi possível carregar as configurações de Redes e Franquias." />;
  if (section === "cancellationCatalogs") return data.customerModule ? <CommercialCatalogsView catalogs={data.customerModule.catalogs} busy={busy} onOperate={onOperate} scope="cancellation" /> : <EmptyState text="Não foi possível carregar as configurações de Cancelamentos." />;
  if (section === "hrCatalogs") return data.customerModule ? <CommercialCatalogsView catalogs={data.customerModule.catalogs} busy={busy} onOperate={onOperate} scope="hr" /> : <EmptyState text="Não foi possível carregar as configurações da Gestão RH." />;
  if (section === "referralCatalogs") return data.customerModule ? <ReferralSettingsPage catalogs={data.customerModule.catalogs} employees={data.access.employees} busy={busy} operate={onOperate} /> : <EmptyState text="Não foi possível carregar os cadastros de Indicações." />;
  if (section === "suggestions") return data.suggestionModule ? <SuggestionCatalogsModule module={data.suggestionModule} busy={busy} operate={onOperate} /> : <EmptyState text="Não foi possível carregar os cadastros de sugestões." />;
  if (section === "notices") return data.noticesModule ? <NoticesAdmin module={data.noticesModule} employees={data.access?.employees ?? []} busy={busy} operate={onOperate} /> : <EmptyState text="Não foi possível carregar os avisos." />;
  if (section === "links") return data.customerModule ? <PortalLinksAdmin catalogs={data.customerModule.catalogs} busy={busy} operate={onOperate} /> : <EmptyState text="Não foi possível carregar os links do portal." />;
  if (section === "recruitmentCatalogs") return data.customerModule ? <CommercialCatalogsView catalogs={data.customerModule.catalogs} busy={busy} onOperate={onOperate} scope="recruitment" /> : <EmptyState text="Cadastros do processo seletivo indisponíveis." />;
  if (section === "recruitment") return <RecruitmentWorkflowView data={data} busy={busy} onOperate={onOperate} />;
  if (section === "audit") return <AuditLogView events={data.audit} departments={data.access.departments} />;
  if (section === "background") return <BackgroundImageSettings image={backgroundImage} onChange={onBackgroundChange} />;
  return <AccessAdmin access={data.access} busy={busy} onOperate={onOperate} />;
}

function BackgroundImageSettings({ image, onChange }: { image: string; onChange: (image: string) => void }) {
  const [error, setError] = useState("");
  const chooseImage = (file?: File) => {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Selecione um arquivo de imagem.");
    if (file.size > 2 * 1024 * 1024) return setError("Envie uma imagem de até 2 MB.");
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result ?? ""));
    reader.onerror = () => setError("Não foi possível ler esta imagem.");
    reader.readAsDataURL(file);
  };
  const previewStyle = image ? { backgroundImage: "url(\"" + image + "\")" } : undefined;
  return <>
    <PageHeader eyebrow="ADMINISTRAÇÃO · CADASTROS" title="Imagem de fundo" description="Defina uma imagem de apoio para a área de trabalho do sistema." />
    <section className="background-settings panel">
      <div className={["background-preview", image ? "configured" : ""].join(" ")} style={previewStyle}>
        <div><ImageIcon size={29} /><strong>{image ? "Imagem de fundo configurada" : "Nenhuma imagem selecionada"}</strong><p>A imagem recebe uma camada de contraste automática nos temas claro e escuro.</p></div>
      </div>
      <div className="background-settings-actions">
        <label className="background-upload"><Upload size={19} /><span><strong>{image ? "Trocar imagem" : "Enviar imagem"}</strong><small>PNG, JPG ou WEBP · até 2 MB</small></span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; chooseImage(file); }} /></label>
        {image && <button className="secondary-button background-remove" onClick={() => onChange("")}><Trash2 size={16} /> Remover imagem</button>}
        {error && <p className="form-error">{error}</p>}
      </div>
    </section>
  </>;
}

function PeopleAdminTabs({ section, onSection }: { section: "collaborators" | "departments" | "levels"; onSection: (section: AdminSection) => void }) {
  return <nav className="people-admin-tabs" aria-label="Cadastros de colaboradores"><button className={section === "collaborators" ? "active" : ""} onClick={() => onSection("collaborators")}>Colaboradores</button><button className={section === "departments" ? "active" : ""} onClick={() => onSection("departments")}>Setores</button><button className={section === "levels" ? "active" : ""} onClick={() => onSection("levels")}>Níveis</button></nav>;
}

function EnterpriseNetworkList({items,featureOptions,canEdit,canDelete,onOpen,onEdit,onDelete}:{items:WorkItem[];featureOptions:string[];canEdit:boolean;canDelete:boolean;onOpen:(item:WorkItem)=>void;onEdit:(item:WorkItem)=>void;onDelete:(item:WorkItem)=>void}){
  return <section className="enterprise-list"><header><span>REDE</span><span>RESPONSÁVEL</span><span>UNIDADES</span><span>ATIVAS</span><span>HEALTH</span><span>STATUS</span><span>AÇÕES</span></header>{items.length===0?<EmptyState text="Nenhuma rede cadastrada."/>:items.map(item=>{const network=enterpriseNetworkFor(item);const active=network.units.filter(unit=>unit.active).length;const health=enterpriseHealthScore(network.units,featureOptions);return <article key={item.id} onClick={()=>onOpen(item)}><span><strong>{item.title}</strong><small>{network.contact||"Sem contato principal"}</small></span><span>{item.owner||"Não atribuído"}</span><span>{network.units.length}</span><span className="good">{active}</span><span className={health>=70?"good":health>=40?"warn":"bad"}>{health}%</span><span><b className={`status-pill ${enterpriseTone(health,active>0)}`}>{network.status}</b></span><span className="enterprise-list-actions">{canEdit&&<button onClick={event=>{event.stopPropagation();onEdit(item)}}><Pencil size={14}/></button>}{canDelete&&<button className="delete" onClick={event=>{event.stopPropagation();onDelete(item)}}><Trash2 size={14}/></button>}<ChevronRight size={15}/></span></article>})}</section>
}

function EmployeesAdmin({ access, roles, busy, onOperate, onSection }: { access: AccessManagement; roles: string[]; busy: boolean; onOperate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string; temporaryPassword?: string } | false>; onSection: (section: AdminSection) => void }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const toggleAccess = (employee: Employee) => onOperate({
    action: "updateEmployee", id: employee.id, displayName: employee.displayName, email: employee.email,
    birthDate: employee.birthDate, startedAt: employee.startedAt, departmentIds: employee.departmentIds,
    employeeLevelId: employee.levelId, photoDataUrl: employee.photoDataUrl, jobTitle: employee.jobTitle,
    isCoordinator: employee.isCoordinator, subordinateUserIds: employee.subordinateUserIds, groupIds: employee.groupIds, active: !employee.active,
  }, employee.active ? "Colaborador bloqueado com sucesso." : "Acesso do colaborador reativado com sucesso.");
  return <>
    <PageHeader eyebrow="ADMINISTRAÇÃO" title="Colaboradores" description="Cadastre a equipe e defina os dados usados no acesso local de teste." action={<button className="primary-button" onClick={() => setCreating(true)}><UserPlus size={17} /> Novo colaborador</button>} />
    <PeopleAdminTabs section="collaborators" onSection={onSection} />
    <section className="employee-list">
      {access.employees.length === 0 ? <EmptyState text="Nenhum colaborador cadastrado." /> : access.employees.map((employee) => <article className="employee-card" key={employee.id}>
        <span className="employee-photo-wrap"><ProfileAvatar name={employee.displayName} photo={employee.photoDataUrl} coordinator={employee.isCoordinator} large /></span>
        <div><strong>{employee.displayName}</strong><small>{employee.email}</small><p>{employee.jobTitle || `${employee.departmentName || "Sem setor"} · ${employee.levelName || "Sem nível"}`}</p>{employee.jobTitle && <small>{employee.departmentName || "Sem setor"} · {employee.levelName || "Sem nível"}</small>}{employee.blockedAt && <small>Bloqueado em {new Intl.DateTimeFormat("pt-BR").format(new Date(employee.blockedAt))}</small>}</div>
        <b className={`status-pill ${employee.active ? "positive" : "negative"}`}>{employee.active ? "Ativo" : "Inativo"}</b>
        <span className="employee-actions"><button className={`catalog-icon-button ${employee.active ? "lock" : "unlock"}`} onClick={() => { void toggleAccess(employee); }} aria-label={employee.active ? `Bloquear ${employee.displayName}` : `Reativar ${employee.displayName}`} title={employee.active ? "Bloquear acesso" : "Reativar acesso"}>{employee.active ? <LockKeyhole size={15} /> : <BadgeCheck size={15} />}</button><button className="catalog-icon-button" onClick={() => setEditing(employee)} aria-label={`Editar ${employee.displayName}`}><Pencil size={15} /></button><button className="catalog-icon-button delete" onClick={() => { void onOperate({ action: "deleteEmployee", id: employee.id }, "Colaborador excluído com sucesso."); }} aria-label={`Excluir ${employee.displayName}`}><Trash2 size={15} /></button></span>
      </article>)}
    </section>
    {creating && <EmployeeModal employees={access.employees} departments={access.departments} levels={access.levels} roles={roles} groups={access.groups} busy={busy} onClose={() => setCreating(false)} onSave={async (payload) => {
      const result = await onOperate({ action: "createEmployee", ...payload }, "Colaborador cadastrado.");
      if (result) { setCreating(false); setTemporaryPassword(result.temporaryPassword ?? ""); }
    }} />}
    {editing && <EmployeeModal employee={editing} employees={access.employees} departments={access.departments} levels={access.levels} roles={roles} groups={access.groups} busy={busy} onClose={() => setEditing(null)} onSave={async (payload) => { const result = await onOperate({ action: "updateEmployee", requireConfirmation: true, id: editing.id, ...payload }, "Colaborador atualizado com sucesso."); if (result) setEditing(null); }} />}
    {temporaryPassword && <TemporaryPasswordModal password={temporaryPassword} onClose={() => setTemporaryPassword("")} />}
  </>;
}

function EmployeeCatalog({ title, description, items, action, buttonLabel, busy, onOperate, section, onSection }: { title: string; description: string; items: Array<EmployeeDepartment | EmployeeLevel>; action: "saveEmployeeDepartment" | "saveEmployeeLevel"; buttonLabel: string; busy: boolean; onOperate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string; temporaryPassword?: string } | false>; section: "departments" | "levels"; onSection: (section: AdminSection) => void }) {
  const [editing, setEditing] = useState<EmployeeDepartment | EmployeeLevel | null | undefined>(undefined);
  const [showInactive, setShowInactive] = useState(false);
  const deleteAction = action === "saveEmployeeDepartment" ? "deleteEmployeeDepartment" : "deleteEmployeeLevel";
  const singular = title.slice(0, -1);
  const visibleItems = items.filter((item) => showInactive || item.active);
  const toggleItem = (item: EmployeeDepartment | EmployeeLevel) => onOperate({ action, id: item.id, name: item.name, description: item.description, active: !item.active }, item.active ? `${singular} inativado temporariamente.` : `${singular} reativado com sucesso.`);
  return <>
    <PageHeader eyebrow="ADMINISTRAÇÃO" title={title} description={description} action={<span className="catalog-head-actions"><label className="checkbox-label"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Exibir inativos</label><button className="primary-button" onClick={() => setEditing(null)}><Plus size={17} /> {buttonLabel}</button></span>} />
    <PeopleAdminTabs section={section} onSection={onSection} />
    <section className="catalog-list">
      {visibleItems.length === 0 ? <EmptyState text={`Nenhum ${singular.toLowerCase()} cadastrado.`} /> : visibleItems.map((item) => <article key={item.id}><span className="group-icon"><Database size={18} /></span><span className="catalog-record-data"><strong>{item.name}</strong><small>{cleanDepartmentDescription(item.description) || "Sem descrição cadastrada"}</small>{action === "saveEmployeeDepartment" && <em className="queue-mode-chip">Fila {departmentQueueMode(item.description) === "linked" ? "vinculada" : "convencional"}</em>}</span><b className={`status-pill ${item.active ? "positive" : "negative"}`}>{item.active ? "Ativo" : "Inativo"}</b><button className={`catalog-icon-button ${item.active ? "lock" : "unlock"}`} onClick={() => { void toggleItem(item); }} aria-label={item.active ? `Inativar ${item.name}` : `Reativar ${item.name}`} title={item.active ? "Inativar temporariamente" : "Reativar cadastro"}>{item.active ? <LockKeyhole size={15} /> : <BadgeCheck size={15} />}</button><button className="catalog-icon-button" onClick={() => setEditing(item)} aria-label={`Editar ${item.name}`}><Pencil size={15} /></button><button className="catalog-icon-button delete" onClick={() => { void onOperate({ action: deleteAction, id: item.id }, `${singular} excluído com sucesso.`); }} aria-label={`Excluir ${item.name}`}><Trash2 size={15} /></button></article>)}
    </section>
    {editing !== undefined && <CatalogModal title={editing ? `Editar ${singular.toLowerCase()}` : buttonLabel} item={editing} department={action === "saveEmployeeDepartment"} busy={busy} onClose={() => setEditing(undefined)} onSave={async (payload) => { const result = await onOperate({ action, id: editing?.id, ...payload }, editing ? `${singular} atualizado com sucesso.` : `${singular} cadastrado com sucesso.`); if (result) setEditing(undefined); }} />}
  </>;
}

function EmployeeModal({ employee, employees, departments, levels, roles, groups, busy, onClose, onSave }: { employee?: Employee; employees: Employee[]; departments: EmployeeDepartment[]; levels: EmployeeLevel[]; roles: string[]; groups: AccessGroup[]; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const [photoDataUrl, setPhotoDataUrl] = useState(employee?.photoDataUrl ?? "");
  const [photoError, setPhotoError] = useState("");
  const [isCoordinator, setIsCoordinator] = useState(employee?.isCoordinator ?? false);
  const [active, setActive] = useState(employee?.active ?? true);
  const [subordinateUserIds, setSubordinateUserIds] = useState<string[]>(employee?.subordinateUserIds ?? []);
  const [groupError, setGroupError] = useState("");
  const choosePhoto = (file?: File) => {
    setPhotoError("");
    if (!file) return setPhotoDataUrl("");
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) return setPhotoError("Envie uma imagem de até 2 MB.");
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const groupIds=form.getAll("groupIds"); if(groupIds.length===0){setGroupError("Selecione ao menos um grupo de permissões.");return} setGroupError("");
    onSave({ displayName: form.get("displayName"), email: form.get("email"), birthDate: form.get("birthDate") || null, startedAt: form.get("startedAt") || null, departmentIds: form.getAll("departmentIds"), employeeLevelId: form.get("employeeLevelId"), photoDataUrl, jobTitle: form.get("jobTitle"), isCoordinator, subordinateUserIds: isCoordinator ? subordinateUserIds : [], groupIds, active });
  };
  return <ModalShell title={employee ? "Editar colaborador" : "Novo colaborador"} subtitle={employee ? "Atualize os dados cadastrais e o vínculo do colaborador." : "A senha temporária será gerada para o teste do login local."} onClose={onClose}><form className="form-grid" onSubmit={submit}>
    <label className="wide">Foto do usuário<input type="file" accept="image/*" onChange={(event) => choosePhoto(event.target.files?.[0])} /></label>
    {photoError && <p className="form-error wide">{photoError}</p>}
    <label>Nome completo<input name="displayName" required defaultValue={employee?.displayName} /></label><label>E-mail<input name="email" type="email" required defaultValue={employee?.email} /></label>
    <label className="wide">Função na empresa<select name="jobTitle" required defaultValue={employee?.jobTitle ?? ""}><option value="">Selecione a função cadastrada</option>{[...new Set([...(employee?.jobTitle ? [employee.jobTitle] : []), ...roles])].map(role => <option key={role}>{role}</option>)}</select><small>A função permanece vinculada diretamente ao cadastro do colaborador.</small></label>
    <label>Data de nascimento<input name="birthDate" type="date" required defaultValue={employee?.birthDate ?? ""} /></label><label>Início na empresa<input name="startedAt" type="date" required defaultValue={employee?.startedAt ?? ""} /></label>
    <label>Nível<select name="employeeLevelId" required defaultValue={levels.some((level) => level.active && level.id === employee?.levelId) ? (employee?.levelId ?? "") : ""}><option value="">Selecione</option>{levels.filter((level) => level.active).map((level) => <option value={level.id} key={level.id}>{level.name}</option>)}</select></label>
    <fieldset className="wide group-selector employee-departments"><legend>Setores de acesso</legend><p>Selecione todos os setores aos quais o colaborador poderá acessar. O primeiro marcado será o setor principal.</p>{departments.filter((department) => department.active).map((department) => <label key={department.id}><input name="departmentIds" type="checkbox" value={department.id} defaultChecked={(employee?.departmentIds ?? (employee?.departmentId ? [employee.departmentId] : [])).includes(department.id)} /><span><strong>{department.name}</strong><small>{department.description || "Setor operacional"}</small></span></label>)}</fieldset>
    <fieldset className="wide group-selector employee-access-groups"><legend>Grupo de permissões *</legend><p>O colaborador verá e poderá editar somente as funcionalidades habilitadas nos grupos selecionados.</p>{groups.filter(group=>group.active||(employee?.groupIds??[]).includes(group.id)).map(group=><label key={group.id}><input name="groupIds" type="checkbox" value={group.id} defaultChecked={(employee?.groupIds??[]).includes(group.id)}/><span><strong>{group.name}</strong><small>{group.permissions.filter(permission=>permission.canView).length} funcionalidade(s) liberada(s)</small></span></label>)}</fieldset>
    {groupError&&<p className="form-error wide">{groupError}</p>}
    <label className="check-row wide"><input type="checkbox" checked={isCoordinator} onChange={(event) => { setIsCoordinator(event.target.checked); if (!event.target.checked) setSubordinateUserIds([]); }} /><span><strong>Este colaborador é coordenador</strong><small>Exibe o selo de coordenação e permite vincular subordinados.</small></span></label>
    {isCoordinator && <fieldset className="wide group-selector employee-subordinates"><legend>Colaboradores coordenados</legend>{employees.filter((entry) => entry.id !== employee?.id && entry.active).map((entry) => <label key={entry.id}><input type="checkbox" checked={subordinateUserIds.includes(entry.id)} onChange={(event) => setSubordinateUserIds((current) => event.target.checked ? [...new Set([...current, entry.id])] : current.filter((id) => id !== entry.id))} /><ProfileAvatar name={entry.displayName} photo={entry.photoDataUrl} coordinator={entry.isCoordinator} /><span><strong>{entry.displayName}</strong><small>{entry.jobTitle || entry.departmentName}</small></span></label>)}</fieldset>}
    {employee && <label className={`check-row wide access-state ${active ? "active" : "blocked"}`}><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>{active ? "Acesso ativo" : "Acesso bloqueado"}</strong><small>{active ? "O colaborador pode entrar normalmente no sistema." : "Ao salvar, a data atual será registrada e todas as sessões serão encerradas."}</small></span></label>}
    <div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || Boolean(photoError)} type="submit"><Save size={16} /> {busy ? "Salvando..." : employee ? "Salvar alterações" : "Cadastrar colaborador"}</button></div>
  </form></ModalShell>;
}

function CatalogModal({ title, item, department = false, busy, onClose, onSave }: { title: string; item?: EmployeeDepartment | EmployeeLevel | null; department?: boolean; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const [queueMode, setQueueMode] = useState<DepartmentQueueMode>(departmentQueueMode(item?.description));
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const description = String(form.get("description") ?? ""); onSave({ name: String(form.get("name") ?? ""), description: department ? serializeDepartmentDescription(description, queueMode) : description, active: form.get("active") === "on" }); };
  return <ModalShell title={title} subtitle="Este cadastro ficará disponível nos formulários do sistema." onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="wide">Nome<input name="name" required autoFocus defaultValue={item?.name} /></label><label className="wide">Descrição<textarea name="description" maxLength={540} rows={3} required defaultValue={cleanDepartmentDescription(item?.description)} placeholder="Explique brevemente quando este cadastro deve ser utilizado." /></label>{department && <label className="wide">Tipo de fila<select value={queueMode} onChange={(event) => setQueueMode(event.target.value as DepartmentQueueMode)}><option value="conventional">Convencional · apenas registrar contato</option><option value="linked">Vinculada · direcionar para uma funcionalidade</option></select><small>Na fila vinculada, o responsável deverá escolher o próximo fluxo ao concluir o contato.</small></label>}<label className="checkbox-label wide"><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /> Cadastro ativo</label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} type="submit"><Save size={16} /> {busy ? "Salvando..." : "Salvar"}</button></div></form></ModalShell>;
}

function TemporaryPasswordModal({ password, onClose }: { password: string; onClose: () => void }) {
  return <ModalShell title="Acesso de teste criado" subtitle="Ainda não há um serviço SMTP configurado; entregue esta senha temporária ao colaborador somente neste ambiente de teste." onClose={onClose}><div className="temporary-password"><span>Senha temporária</span><code>{password}</code><p>O colaborador poderá entrar com o e-mail cadastrado e depois alterar a própria senha pelo menu lateral.</p><div className="form-actions"><button className="primary-button" onClick={onClose}>Concluído</button></div></div></ModalShell>;
}

function LegacyAdminView({ data, busy, onSeed, onOperate }: { data: AppData; busy: boolean; onSeed: () => void; onOperate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string } | false> }) {
  return <>
    <PageHeader eyebrow="CONTROLES DO SISTEMA" title="Administração e governança" description="Usuários, grupos, permissões por tela e trilha completa de auditoria." />
    {data.access && <AccessAdmin access={data.access} busy={busy} onOperate={onOperate} />}
    <section className="admin-grid"><div className="panel access-card"><div className="panel-header"><div><span className="eyebrow">IDENTIDADE E ACESSO</span><h2>Sessão atual</h2></div><ShieldCheck size={20} /></div><div className="user-summary"><ProfileAvatar name={data.user.displayName} photo={data.user.photoDataUrl} coordinator={data.user.isCoordinator} large /><div><strong>{data.user.displayName}</strong><p>{data.user.email}</p><span>{data.user.jobTitle || `${data.user.role} · ${data.user.department}`}</span></div></div><div className="security-note"><ShieldCheck size={17} /><p>A identidade vem do login autenticado. Os grupos cadastrados aqui determinam o que pode ser visto ou alterado.</p></div></div><div className="panel demo-card"><div className="panel-header"><div><span className="eyebrow">AMBIENTE</span><h2>Dados demonstrativos</h2></div><Sparkles size={20} /></div><p>Carregue uma base operacional de exemplo somente quando o ambiente estiver vazio. A ação é explícita e auditada.</p><button className="primary-button" onClick={onSeed} disabled={busy || data.customers.length > 0}>{data.customers.length > 0 ? "Ambiente já possui dados" : "Carregar demonstração"}</button></div></section>
    <section className="admin-section"><div className="section-title"><div><span className="eyebrow">DECISION LOG</span><h2>Validações obrigatórias</h2></div><p>Regras críticas permanecem bloqueadas até decisão formal.</p></div><div className="decision-grid">{data.decisions.map((decision) => <article key={decision.code}><div><b>{decision.code}</b><span className={`risk ${decision.risk.toLowerCase()}`}>{decision.risk}</span></div><h3>{decision.title}</h3><p>{decision.default_behavior}</p><footer><span className={`status-pill ${statusTone(decision.status)}`}>{decision.status}</span><small>{decision.owner}</small></footer></article>)}</div></section>
    <section className="admin-section"><div className="section-title"><div><span className="eyebrow">AUDITORIA IMUTÁVEL</span><h2>Eventos recentes</h2></div></div><div className="audit-list">{data.audit.length === 0 ? <div className="panel"><EmptyState text="A trilha será preenchida a partir da primeira ação." /></div> : data.audit.map((entry) => <div key={entry.id}><span className="audit-icon"><Activity size={15} /></span><span><strong>{entry.action} · {entry.resource}</strong><small>{entry.actor_email} · {entry.module}</small></span><time>{dateTime(entry.created_at)}</time><b className={`status-pill ${statusTone(entry.result)}`}>{entry.result}</b></div>)}</div></section>
  </>;
}

function AccessAdmin({ access, busy, onOperate }: { access: AccessManagement; busy: boolean; onOperate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string; temporaryPassword?: string } | false> }) {
  const [editingGroup, setEditingGroup] = useState<AccessGroup | "new" | null>(null);
  return <section className="admin-section access-management">
    <div className="section-title"><div><span className="eyebrow">CONTROLE DE ACESSO</span><h2>Permissões e grupos</h2></div><div className="access-actions"><button className="primary-button" onClick={() => setEditingGroup("new")}><Users size={16} /> Novo grupo</button></div></div>
    <div className="access-summary"><div><ShieldCheck size={20} /><span><strong>{access.groups.length}</strong><small>grupos de acesso</small></span></div><div><BadgeCheck size={20} /><span><strong>{access.groups.filter((group) => group.active).length}</strong><small>grupos ativos</small></span></div></div>
    <div className="panel access-groups"><div className="panel-header"><div><span className="eyebrow">GRUPOS</span><h3>Permissões consolidadas</h3></div></div><div className="access-group-list">{access.groups.map((group) => <button key={group.id} onClick={() => setEditingGroup(group)}><span className="group-icon"><ShieldCheck size={18} /></span><span><strong>{group.name}{group.isSystem && <em>Sistema</em>}</strong><small>{group.description || "Sem descrição"}</small><i>{group.userCount} colaborador(es) · {group.permissions.filter((permission) => permission.canView).length} tela(s)</i></span><b className={`status-pill ${group.active ? "positive" : "negative"}`}>{group.active ? "Ativo" : "Inativo"}</b><ChevronRight size={16} /></button>)}</div></div>
    {editingGroup && <AccessGroupModal group={editingGroup === "new" ? null : editingGroup} access={access} busy={busy} onClose={() => setEditingGroup(null)} onSave={async (payload) => { const ok = await onOperate(payload, editingGroup === "new" ? "Grupo cadastrado." : "Permissões atualizadas."); if (ok) setEditingGroup(null); }} onDelete={async () => { if (editingGroup !== "new" && !editingGroup.isSystem) { const ok = await onOperate({ action: "deleteAccessGroup", id: editingGroup.id }, "Grupo excluído com sucesso."); if (ok) setEditingGroup(null); } }} />}
  </section>;
}

function LegacyAccessAdmin({ access, busy, onOperate }: { access: AccessManagement; busy: boolean; onOperate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string } | false> }) {
  const [editingUser, setEditingUser] = useState<AccessUser | "new" | null>(null);
  const [editingGroup, setEditingGroup] = useState<AccessGroup | "new" | null>(null);
  return <section className="admin-section access-management">
    <div className="section-title"><div><span className="eyebrow">CONTROLE DE ACESSO</span><h2>Usuários e grupos</h2></div><div className="access-actions"><button className="secondary-button" onClick={() => setEditingGroup("new")}><Users size={16} /> Novo grupo</button><button className="primary-button" onClick={() => setEditingUser("new")}><UserPlus size={16} /> Novo usuário</button></div></div>
    <div className="access-summary"><div><UsersRound size={20} /><span><strong>{access.users.length}</strong><small>usuários cadastrados</small></span></div><div><ShieldCheck size={20} /><span><strong>{access.groups.length}</strong><small>grupos de acesso</small></span></div><div><BadgeCheck size={20} /><span><strong>{access.users.filter((user) => user.active).length}</strong><small>usuários ativos</small></span></div></div>
    <div className="access-layout">
      <div className="panel access-users"><div className="panel-header"><div><span className="eyebrow">USUÁRIOS</span><h3>Contas autorizadas</h3></div></div><div className="access-user-list">{access.users.map((user) => <button key={user.id} onClick={() => setEditingUser(user)}><ProfileAvatar name={user.displayName} photo={user.photoDataUrl} coordinator={user.isCoordinator} /><span><strong>{user.displayName}</strong><small>{user.jobTitle || user.email}</small><em>{user.groupNames.join(" · ") || "Sem grupo"}</em></span><b className={`status-pill ${user.active ? "positive" : "negative"}`}>{user.active ? "Ativo" : "Inativo"}</b><Pencil size={15} /></button>)}</div></div>
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

function AccessGroupModal({ group, access, busy, onClose, onSave, onDelete }: { group: AccessGroup | null; access: AccessManagement; busy: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => void; onDelete?: () => void }) {
  const initial = access.screens.map((screen) => group?.permissions.find((permission) => permission.screen === screen.code)
    ?? { screen: screen.code, canView: false, canCreate: false, canEdit: false, canApprove: false, canManage: false, capabilities: [] });
  const [permissions, setPermissions] = useState<GroupPermission[]>(initial);
  const modalRef=useRef<HTMLDivElement>(null);
  const changePermission = (screen: string, action: "view" | "edit" | "manage", checked: boolean) => {const scrollTop=modalRef.current?.scrollTop??0;setPermissions((current) => current.map((permission) => {
    if (permission.screen !== screen) return permission;
    if (action === "view") return checked
      ? { ...permission, canView: true }
      : { ...permission, canView: false, canCreate: false, canEdit: false, canApprove: false, canManage: false, capabilities: [] };
    if (action === "manage") return { ...permission, canView: checked || permission.canView, canManage: checked };
    return { ...permission, canView: checked || permission.canView, canCreate: checked, canEdit: checked, canApprove: checked };
  }));requestAnimationFrame(()=>{if(modalRef.current)modalRef.current.scrollTop=scrollTop;});};
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({ action: group ? "updateAccessGroup" : "createAccessGroup", id: group?.id, name: form.get("name"), groupDescription: form.get("description"), active: form.get("active") === "on", permissions });
  };
  const actions = [{ key: "view" as const, label: "Ver" }, { key: "edit" as const, label: "Editar" }, { key: "manage" as const, label: "Configuração" }];
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
    <div ref={modalRef} className="modal access-modal" role="dialog" aria-modal="true" aria-label={group ? "Editar grupo" : "Novo grupo"}>
      <div className="modal-head"><div><span className="eyebrow">GRUPO DE ACESSO</span><h2>{group ? "Permissões do grupo" : "Novo grupo"}</h2><p>As permissões são aplicadas no menu e validadas novamente pela API.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>
      <form className="access-group-form" onSubmit={submit}>
        <div className="form-grid"><label>Nome do grupo<input name="name" required defaultValue={group?.name} /></label><label className="checkbox-label"><input name="active" type="checkbox" disabled={group?.isSystem} defaultChecked={group?.active ?? true} /> Grupo ativo</label><label className="wide">Descrição<input name="description" defaultValue={group?.description} /></label></div>
        <div className="permission-matrix">
          <div className="permission-row permission-head"><strong>Tela</strong>{actions.map((action) => <span key={action.key}>{action.label}</span>)}</div>
          {access.screens.map((screen) => {
            const permission = permissions.find((entry) => entry.screen === screen.code)!;
            return <div className="permission-row" key={screen.code}><span><strong>{screen.label}</strong><small>{screen.area}</small></span>{actions.map((action) => {
              const key = `can${action.key[0].toUpperCase()}${action.key.slice(1)}` as keyof GroupPermission;
              return <label key={action.key} title={`${action.label}: ${screen.label}`}><input type="checkbox" checked={permission[key] === true} onChange={(event) => changePermission(screen.code, action.key, event.target.checked)} /><i /></label>;
            })}</div>;
          })}
        </div>
        <div className="form-actions"><button type="button" onClick={onClose}>Cancelar</button>{group && !group.isSystem && onDelete && <button className="secondary-button danger-action" disabled={busy} type="button" onClick={onDelete}><Trash2 size={15} /> Excluir</button>}<button className="primary-button" disabled={busy} type="submit"><Save size={16} /> {busy ? "Salvando..." : group ? "Salvar permissões" : "Criar grupo"}</button></div>
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

function CustomerModal({ catalogs, busy, onClose, onSubmit }: { catalogs: CustomerCatalogOption[]; busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  const options = (catalog: string) => catalogs.filter((item) => item.catalog === catalog && item.active);
  const select = (name: string, label: string, catalog: string) => <label>{label}<select name={name}><option value="">Selecionar...</option>{options(catalog).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>;
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ legalName: form.get("legalName"), tradeName: form.get("tradeName"), documentMasked: form.get("documentMasked"), segment: form.get("segment"), owner: form.get("owner"), csOwner: form.get("csOwner"), clinicsCount: Number(form.get("clinicsCount") || 1), monthlyRevenueCents: Math.round(Number(form.get("monthlyRevenue") || 0) * 100), strategic: form.get("strategic") === "on", status: form.get("status"), project: form.get("project"), productVersion: form.get("productVersion"), dueDay: form.get("dueDay"), server: form.get("server"), paymentMethod: form.get("paymentMethod"), invoiceCompany: form.get("invoiceCompany"), graceDays: form.get("graceDays"), dueDays: form.get("dueDays"), subscription: form.get("subscription"), email: form.get("email"), phone: form.get("phone"), website: form.get("website"), notes: form.get("notes"), address: form.get("address"), city: form.get("city"), state: form.get("state") }); };
  return <ModalShell title="Cadastrar cliente" subtitle="Informações e assinatura vinculadas exclusivamente aos cadastros ativos." onClose={onClose}><form className="form-grid customer-form" onSubmit={submit}>
    <div className="form-section wide"><span>01</span><div><strong>Informações do cliente</strong><small>Dados cadastrais e contato principal.</small></div></div>
    <label className="wide">Razão social *<input name="legalName" required /></label><label>Nome fantasia<input name="tradeName" /></label><label>CNPJ/CPF<input name="documentMasked" placeholder="00.000.000/0000-00" /></label><label>Segmento<input name="segment" placeholder="Ex.: Clínica odontológica" /></label><label>Telefone<input name="phone" placeholder="(00) 00000-0000" /></label><label>E-mail<input name="email" type="email" /></label><label>Site<input name="website" placeholder="https://" /></label><label>Responsável comercial<input name="owner" /></label><label>Responsável de CS<input name="csOwner" /></label>
    <div className="form-section wide"><span>02</span><div><strong>Assinatura e cobrança</strong><small>As opções são preenchidas nos Cadastros › Clientes.</small></div></div>
    {select("status", "Status da assinatura", "status")}{select("project", "Projeto", "project")}{select("productVersion", "Versão", "version")}{select("subscription", "Assinatura (produto)", "subscription")}{select("server", "Servidor", "server")}{select("paymentMethod", "Forma de pagamento", "paymentMethod")}{select("dueDay", "Dia do vencimento", "dueDay")}{select("graceDays", "Dias de tolerância", "graceDays")}{select("dueDays", "Dias de vencimento", "dueDays")}{select("invoiceCompany", "Empresa nota fiscal", "invoiceCompany")}
    <label>Clínicas<input name="clinicsCount" type="number" min="1" defaultValue="1" /></label><label>Receita mensal (R$)<input name="monthlyRevenue" type="number" min="0" step="0.01" /></label><label className="checkbox-label"><input name="strategic" type="checkbox" /> Conta estratégica</label>
    <div className="form-section wide"><span>03</span><div><strong>Endereço e observações</strong><small>Registre referências úteis para a equipe.</small></div></div>
    <label className="wide">Endereço<input name="address" /></label><label>Cidade<input name="city" /></label><label>Estado<input name="state" /></label><label className="wide">Observações<textarea name="notes" rows={3} placeholder="Informações relevantes sobre o cliente..." /></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} type="submit">{busy ? "Salvando..." : "Cadastrar cliente"}</button></div>
  </form></ModalShell>;
}

function AppointmentModal({ customers, busy, onClose, onSubmit }: { customers: Customer[]; busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const customer = customers.find((entry) => entry.id === form.get("customerId")); onSubmit({ title: form.get("title"), kind: form.get("kind"), customerId: customer?.id ?? "", customerName: customer?.trade_name ?? "", owner: form.get("owner"), team: form.get("team"), startsAt: new Date(String(form.get("startsAt"))).toISOString(), endsAt: new Date(String(form.get("endsAt"))).toISOString(), meetingUrl: form.get("meetingUrl") }); };
  return <ModalShell title="Reservar horário" subtitle="Conflitos de agenda são validados no servidor." onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="wide">Título<input name="title" required /></label><label>Tipo<select name="kind"><option>Treinamento</option><option>Reunião</option><option>Kick-off LIA</option><option>Follow-up</option><option>Compromisso</option></select></label><label>Cliente<select name="customerId"><option value="">Interno</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.trade_name}</option>)}</select></label><label>Responsável<input name="owner" required /></label><label>Equipe<select name="team"><option>CS</option><option>Comercial</option><option>LIA</option><option>Suporte</option><option>TI</option><option>Financeiro</option></select></label><label>Início<input name="startsAt" type="datetime-local" required /></label><label>Término<input name="endsAt" type="datetime-local" required /></label><label className="wide">Link da reunião<input name="meetingUrl" type="url" placeholder="https://..." /></label><div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} type="submit">{busy ? "Reservando..." : "Reservar sem conflito"}</button></div></form></ModalShell>;
}

function ModalShell({ title, subtitle, className = "", onClose, children }: { title: string; subtitle: string; className?: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop standard-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><div className={`modal standard-modal ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><span className="eyebrow">NOVO REGISTRO</span><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>{children}</div></div>;
}

function BackgroundImageModal({ image, agendaVisual, onAgendaVisual, onClose, onUpload, onRemove }: { image: string; agendaVisual: SystemVisual; onAgendaVisual: (visual: SystemVisual) => void; onClose: () => void; onUpload: (file: File) => void; onRemove: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return <div className="modal-backdrop background-image-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="modal background-image-modal" role="dialog" aria-modal="true" aria-labelledby="background-image-title">
    <div className="modal-head"><div><span className="eyebrow">PERSONALIZAÇÃO</span><h2 id="background-image-title">Imagem de fundo</h2><p>Escolha a imagem usada na área de trabalho. O contraste é ajustado automaticamente nos temas claro e escuro.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>
    <div className={`background-modal-preview ${image ? "has-image" : ""}`} style={image ? { backgroundImage: `linear-gradient(rgba(8,18,31,.35), rgba(8,18,31,.62)), url("${image}")` } : undefined}>{!image && <><ImageIcon size={34} /><strong>Nenhuma imagem configurada</strong><span>PNG, JPG, WEBP ou GIF de até 2 MB.</span></>}</div>
    <section className="agenda-visual-picker"><header><strong>Cor do sistema</strong><small>A paleta escolhida será aplicada à agenda, botões, seleções, gráficos e modais.</small></header><div>{([['azure','Azul Dontus'],['emerald','Verde produtividade'],['violet','Roxo executivo'],['amber','Âmbar'],['rose','Rosa'],['teal','Turquesa'],['graphite','Grafite']] as const).map(([value,label])=><button type="button" className={`${value} ${agendaVisual===value?'active':''}`} onClick={()=>onAgendaVisual(value)} key={value}><i/><span>{label}</span>{agendaVisual===value&&<Check size={14}/>}</button>)}</div></section>
    <input ref={input} className="quick-background-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) onUpload(file); }} />
    <div className="background-modal-actions">{image && <button type="button" className="background-remove-button" onClick={onRemove}><Trash2 size={16} /> Remover imagem</button>}<span /><button type="button" onClick={onClose}>Cancelar</button><button type="button" className="primary-button" onClick={() => input.current?.click()}><Upload size={16} /> {image ? "Trocar imagem" : "Selecionar imagem"}</button></div>
  </section></div>;
}

function ConfirmationModal({ action, successMessage, busy, onCancel, onConfirm }: { action?: string; successMessage: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const actionLabels: Record<string, string> = {
    createCustomer: "criar este cliente", createWorkItem: "criar este registro", createAppointment: "reservar este compromisso",
    updateWorkItem: "salvar as alterações deste registro", deleteWorkItem: "excluir este registro",
    createAgendaCommitment: "agendar este compromisso", updateAgendaCommitment: "salvar as alterações deste compromisso",
    saveNote: "salvar esta anotação", deleteNote: "excluir esta anotação", duplicateNote: "duplicar esta anotação",
    reorderNotes: "salvar a nova organização das anotações",
    changeAgendaCommitmentStatus: "alterar o status deste compromisso", saveAgendaCalendar: "salvar esta agenda",
    saveAgendaType: "salvar este tipo de agendamento", saveAgendaStatus: "salvar este status",
    deleteAgendaCalendar: "excluir esta agenda", deleteAgendaType: "excluir este tipo de agendamento", deleteAgendaStatus: "excluir este status",
    createEmployee: "cadastrar este colaborador", updateEmployee: "salvar as alterações deste colaborador", deleteEmployee: "excluir este colaborador",
    saveEmployeeDepartment: "salvar este setor", saveEmployeeLevel: "salvar este nível", deleteEmployeeDepartment: "excluir este setor", deleteEmployeeLevel: "excluir este nível",
    createAccessGroup: "criar este grupo", updateAccessGroup: "salvar as permissões deste grupo", deleteAccessGroup: "excluir este grupo",
    deleteTaskCatalog: "excluir este cadastro",
    updateTask: "salvar as alterações desta tarefa", deleteTask: "excluir esta tarefa",
    assignTask: "transferir o responsável desta tarefa", changeTaskStatus: "alterar o status desta tarefa",
    saveNotice: "publicar ou atualizar este aviso", deleteNotice: "excluir este aviso",
    markNoticeRead: "confirmar a leitura deste aviso",
  };
  const isDelete = (action ?? "").toLowerCase().startsWith("delete");
  const heading = isDelete ? "Confirmar exclusão?" : "Confirmar ação?";
  const helper = isDelete
    ? "O registro deixará de aparecer nos cadastros e nas opções disponíveis do sistema."
    : "A alteração será aplicada imediatamente nas informações relacionadas.";
  const description = actionLabels[action ?? ""] ?? "concluir esta ação";
  return <div className="modal-backdrop confirmation-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onCancel()}><section className={`modal confirm-modal ${isDelete ? "delete-confirmation" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title"><div className="confirm-icon">{isDelete ? <Trash2 size={22} /> : <CheckCircle2 size={22} />}</div><span className="eyebrow">{isDelete ? "EXCLUSÃO DE REGISTRO" : "CONFIRMAÇÃO NECESSÁRIA"}</span><h2 id="confirmation-title">{heading}</h2><p>Deseja {description}?</p><small>{helper}</small><div className="form-actions confirm-actions"><button type="button" onClick={onCancel} disabled={busy}>Não, voltar</button><button className="primary-button" type="button" onClick={onConfirm} disabled={busy}>{busy ? "Confirmando..." : isDelete ? "Sim, excluir" : "Sim, confirmar"}</button></div></section></div>;
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={`empty-state ${compact ? "compact" : ""}`}><MessageSquareText size={compact ? 18 : 24} /><p>{text}</p></div>;
}
