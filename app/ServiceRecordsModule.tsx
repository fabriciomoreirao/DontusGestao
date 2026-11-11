"use client";

import SearchablePeopleSelect from "@/app/SearchablePeopleSelect";

import { activeCatalogEntries } from "@/lib/catalog-options";
import { assignmentPerson } from "@/lib/assignment-people";

import { useReminderFilter } from "@/app/ReminderFilters";


import {
  CalendarDays, ChevronDown, Clock3, Headphones, Layers3, Pencil,
  Plus, Save, Search, Settings, Trash2, UserRound, X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type OperationResult = { id?: string } | false;
type WorkItem = {
  id: string; module: string; record_type: string; title: string; customer_id: string | null;
  customer_name: string; owner: string; team: string; status: string; priority: string;
  amount_cents: number; description: string; version: number; created_at: string; updated_at: string;
};
type Customer = { id: string; trade_name: string; legal_name: string; document_masked: string; phone: string; product_version: string };
type Catalog = { id: string; catalog: string; name: string; active: boolean };
type Employee = { id: string; email: string; displayName: string; departmentId: string | null; departmentName: string; departmentNames: string[]; photoDataUrl?: string; active: boolean };
type Department = { id: string; name: string; active: boolean };
type CurrentUser = { email: string; displayName: string; department: string };

type ServiceRecord = {
  kind: "serviceRecord";
  clientCode: string;
  customerName: string;
  date: string;
  responsibleId: string;
  responsible: string;
  sector: string;
  origin: string;
  version: string;
  startTime: string;
  endTime: string;
  problem: string;
  status: string;
  contactTypes: string[];
  tool: string;
  notes: string;
  solution: string;
};

type EntryRow = ServiceRecord & { key: string; customerId: string };

const SERVICE_RECORD_TYPE = "Atendimento";
const today = () => new Date().toLocaleDateString("en-CA");
const currentTime = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
const publicCustomerCode = (customer?: Customer) => {
  const digits = customer?.document_masked?.replace(/\D/g, "") ?? "";
  return digits.length >= 6 ? digits.slice(-6) : "";
};
const makeRow = (user: CurrentUser, employee?: Employee): EntryRow => ({
  key: crypto.randomUUID(), kind: "serviceRecord", customerId: "", clientCode: "", customerName: "",
  date: today(), responsibleId: employee?.id ?? "", responsible: employee?.displayName ?? user.displayName,
  sector: employee?.departmentName || user.department || "Não informado", origin: "", version: "",
  startTime: currentTime(), endTime: "", problem: "", status: "", contactTypes: [], tool: "", notes: "", solution: "",
});

function parseRecord(value: string): ServiceRecord | null {
  try {
    const parsed = JSON.parse(value) as Partial<ServiceRecord>;
    if (parsed.kind !== "serviceRecord") return null;
    return {
      kind: "serviceRecord", clientCode: parsed.clientCode ?? "", customerName: parsed.customerName ?? "",
      date: parsed.date ?? "", responsibleId: parsed.responsibleId ?? "", responsible: parsed.responsible ?? "",
      sector: parsed.sector ?? "", origin: parsed.origin ?? "", version: parsed.version ?? "",
      startTime: parsed.startTime ?? "", endTime: parsed.endTime ?? "", problem: parsed.problem ?? "",
      status: parsed.status ?? "", contactTypes: Array.isArray(parsed.contactTypes) ? parsed.contactTypes : [],
      tool: parsed.tool ?? "", notes: parsed.notes ?? "", solution: parsed.solution ?? "",
    };
  } catch { return null; }
}

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const serviceTone = (value: string) => /conclu|resolvid|finaliz/i.test(value) ? "positive" : /cancel|bloque|erro/i.test(value) ? "negative" : /andamento|aguard|pend/i.test(value) ? "warning" : "neutral";
const displayDate = (value: string) => value ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`)) : "—";

export default function ServiceRecordsModule({ items, customers, catalogs, employees, departments, currentUser, busy, canCreate, canEdit, canDelete, operate, onOpenSettings }: {
  items: WorkItem[]; customers: Customer[]; catalogs: Catalog[]; employees: Employee[]; departments: Department[];
  currentUser: CurrentUser; busy: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean;
  operate: (payload: Record<string, unknown>, success: string) => Promise<OperationResult>; onOpenSettings?: () => void;
}) {
  const [queryId, setQueryId] = useState("");
  const [queryName, setQueryName] = useState("");
  const [date, setDate] = useState("");
  const [responsible, setResponsible] = useState("all");
  const [version, setVersion] = useState("all");
  const [problem, setProblem] = useState("all");
  const [status, setStatus] = useState("all");
  const [sector, setSector] = useState("all");
  const [modal, setModal] = useState<"single" | "bulk" | null>(null);
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const records = useMemo(() => items
    .filter((item) => item.module === "support" && item.record_type === SERVICE_RECORD_TYPE)
    .map((item) => ({ item, detail: parseRecord(item.description) }))
    .filter((entry): entry is { item: WorkItem; detail: ServiceRecord } => Boolean(entry.detail)), [items]);
  const configured = (catalog: string) => activeCatalogEntries(catalogs, catalog).map(entry => entry.name);
  const versions = configured("serviceVersion");
  const problems = configured("serviceProblem");
  const statuses = configured("serviceStatus");
  const responsibleOptions = unique(employees.filter((entry) => entry.active).map((entry) => entry.displayName));
  const sectorOptions = unique(departments.filter((entry) => entry.active).map((entry) => entry.name));
  const reminderFilter = useReminderFilter("support");
  const visible = records.filter(({ item, detail }) => {
    const idNeedle = queryId.trim().toLocaleLowerCase("pt-BR");
    const nameNeedle = queryName.trim().toLocaleLowerCase("pt-BR");
    return reminderFilter.matches({entityId:item.id,clientId:detail.clientCode,title:detail.customerName}) && (!idNeedle || detail.clientCode.toLocaleLowerCase("pt-BR").includes(idNeedle))
      && (!nameNeedle || detail.customerName.toLocaleLowerCase("pt-BR").includes(nameNeedle))
      && (!date || detail.date === date)
      && (responsible === "all" || detail.responsible === responsible)
      && (version === "all" || detail.version === version)
      && (problem === "all" || detail.problem === problem)
      && (status === "all" || detail.status === status)
      && (sector === "all" || detail.sector === sector);
  });
  const changeStatus = async (item: WorkItem, detail: ServiceRecord, nextStatus: string) => {
    await operate({ action: "updateWorkItem", id: item.id, title: item.title, customerName: item.customer_name, owner: item.owner, amountCents: item.amount_cents, version: item.version, description: JSON.stringify({ ...detail, status: nextStatus }) }, "Status do atendimento atualizado.");
  };
  return <section className="service-records-module">
    <header className="service-records-header module-page-header"><div className="module-page-title"><span className="service-title-icon module-page-title-icon"><Headphones size={20} /></span><span className="module-page-copy"><h1>Atendimentos</h1><p>Registros de atendimento ao cliente, organizados por setor.</p></span></div><div className="module-page-actions">{onOpenSettings && <button className="icon-button" onClick={onOpenSettings} aria-label="Configurar atendimentos" title="Configurar atendimentos"><Settings size={18} /></button>}{canCreate && <><button className="secondary-button" onClick={() => setModal("bulk")}><Layers3 size={16} /> Inserção em massa</button><button className="primary-button" onClick={() => setModal("single")}><Plus size={16} /> Inserir atendimento</button></>}</div></header>

    <div className="module-sector-filter"><label><span>Setor</span><select aria-label="Filtrar atendimentos por setor" value={sector} onChange={(event) => setSector(event.target.value)}><option value="all">Todos os setores ({records.length})</option>{sectorOptions.map((name) => <option value={name} key={name}>{name} ({records.filter((entry) => entry.detail.sector === name).length})</option>)}</select></label></div>

    <section className="service-filter-panel"><header><Search size={14} /> FILTROS DE PESQUISA</header><div className="service-filter-grid reminder-filter-toolbar"><label><span>ID do cliente</span><input value={queryId} onChange={(event) => setQueryId(event.target.value)} placeholder="ID do cliente" /></label>{reminderFilter.control}<label><span>Nome do cliente</span><input value={queryName} onChange={(event) => setQueryName(event.target.value)} placeholder="Nome do cliente" /></label><label><span>Data</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label><span>Responsável</span><SearchablePeopleSelect searchLabel="Responsável" value={responsible} onChange={(event) => setResponsible(event.target.value)}><option value="all">Todos os responsáveis</option>{responsibleOptions.map((entry) => <option key={entry}>{entry}</option>)}</SearchablePeopleSelect></label><label><span>Versão</span><select value={version} onChange={(event) => setVersion(event.target.value)}><option value="all">Todas versões</option>{versions.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label><span>Problema</span><select value={problem} onChange={(event) => setProblem(event.target.value)}><option value="all">Todos problemas</option>{problems.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos status</option>{statuses.map((entry) => <option key={entry}>{entry}</option>)}</select></label></div></section>

    <section className="service-list" aria-label="Lista de atendimentos"><header><span>ID</span><span>CLIENTE</span><span>DATA</span><span>RESPONSÁVEL</span><span>VERSÃO</span><span>PROBLEMA</span><span>STATUS</span><span>AÇÕES</span></header>{visible.length === 0 ? <div className="service-empty"><Headphones size={24} /><strong>Nenhum atendimento encontrado</strong><p>Insira um atendimento ou ajuste os filtros de pesquisa.</p></div> : visible.map(({ item, detail }) => <article data-reminder-entity-id={item.id} data-reminder-client-id={detail.clientCode} data-reminder-customer-name={detail.customerName || item.customer_name} key={item.id}><span className="service-client-id">{detail.clientCode || item.id.slice(0, 8)}</span><span><strong>{detail.customerName || item.customer_name}</strong><small>{detail.origin || "Origem não informada"}</small></span><span>{displayDate(detail.date)}<small>{detail.startTime}{detail.endTime ? ` – ${detail.endTime}` : ""}</small></span><span className="service-owner" data-collaborator-name={detail.responsible||item.owner}><i style={employees.find(employee=>employee.displayName===(detail.responsible||item.owner))?.photoDataUrl?{backgroundImage:`url("${employees.find(employee=>employee.displayName===(detail.responsible||item.owner))?.photoDataUrl}")`}:undefined}/><span><strong>{detail.responsible || item.owner}</strong><small>{detail.sector || item.team}</small></span></span><span>{detail.version || "—"}</span><span>{detail.problem || "—"}<small>{detail.tool || ""}</small></span><span><label className={`service-status-select ${serviceTone(detail.status)}`}><i /><select disabled={!canEdit || busy} value={detail.status} onChange={(event) => void changeStatus(item, detail, event.target.value)}>{statuses.map((entry) => <option key={entry}>{entry}</option>)}</select><ChevronDown size={13} /></label></span><span className="service-row-actions">{canEdit && <button onClick={() => setEditing(item)} aria-label="Editar atendimento"><Pencil size={15} /></button>}{canDelete && <button className="delete" onClick={() => void operate({ action: "deleteWorkItem", id: item.id }, "Atendimento excluído com sucesso.")} aria-label="Excluir atendimento"><Trash2 size={15} /></button>}</span></article>)}</section>

    {(modal || editing) && <ServiceEntryModal mode={modal ?? "single"} editing={editing} currentUser={currentUser} customers={customers} catalogs={catalogs} employees={employees.filter((entry) => entry.active)} departments={departments.filter((entry) => entry.active)} busy={busy} onClose={() => { setModal(null); setEditing(null); }} onSave={async (rows) => {
      for (const row of rows) {
        const detail: ServiceRecord = { ...row }; delete (detail as Partial<EntryRow>).key; delete (detail as Partial<EntryRow>).customerId;
        const payload = editing ? { action: "updateWorkItem", requireConfirmation: true, id: editing.id, title: `Atendimento · ${row.customerName}`, customerName: row.customerName, owner: row.responsible, amountCents: 0, version: editing.version, description: JSON.stringify(detail) } : { action: "createWorkItem", module: "support", recordType: SERVICE_RECORD_TYPE, title: `Atendimento · ${row.customerName}`, customerId: row.customerId || null, customerName: row.customerName, owner: row.responsible, team: row.sector, status: "Novo", priority: "P3", amountCents: 0, description: JSON.stringify(detail) };
        const result = await operate(payload, editing ? "Atendimento atualizado com sucesso." : "Atendimento registrado com sucesso.");
        if (!result) return;
      }
      setModal(null); setEditing(null);
    }} />}
  </section>;
}

function ServiceEntryModal({ mode, editing, currentUser, customers, catalogs, employees, departments, busy, onClose, onSave }: { mode: "single" | "bulk"; editing: WorkItem | null; currentUser: CurrentUser; customers: Customer[]; catalogs: Catalog[]; employees: Employee[]; departments: Department[]; busy: boolean; onClose: () => void; onSave: (rows: EntryRow[]) => Promise<void> }) {
  const currentEmployee = assignmentPerson(employees, { email: currentUser.email });
  const parsed = editing ? parseRecord(editing.description) : null;
  const savedEmployee = parsed ? assignmentPerson(employees, { id: parsed.responsibleId, displayName: parsed.responsible }) : undefined;
  const initial = parsed ? [{ ...parsed, responsibleId: savedEmployee?.id ?? parsed.responsibleId, key: crypto.randomUUID(), customerId: editing?.customer_id ?? "" }] : [makeRow(currentUser, currentEmployee)];
  const [rows, setRows] = useState<EntryRow[]>(initial);
  const [validationError, setValidationError] = useState("");
  const [versionLookups,setVersionLookups]=useState<string[]>([]);
  const waitingForVersion=rows.some(row=>versionLookups.includes(row.key));
  const options = (catalog: string) => activeCatalogEntries(catalogs, catalog).map(entry => entry.name);
  const versions = options("serviceVersion");
  const origins = options("serviceOrigin");
  const problems = options("serviceProblem");
  const statuses = options("serviceStatus");
  const contactTypes = options("serviceContactType").filter((entry) => !/mal uso|cancelamento/i.test(entry));
  const tools = options("serviceTool");
  const update = (key: string, patch: Partial<EntryRow>) => setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  const ready = rows.filter((row) => /^\d{6}$/.test(row.clientCode.trim()) && row.customerName.trim() && row.date && row.responsibleId && row.responsible && row.problem && row.status);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if(waitingForVersion)return; if (ready.length !== rows.length) { setValidationError("Preencha o ID público de 6 números, cliente, data, responsável, problema e status em todos os atendimentos."); return; } setValidationError(""); void onSave(rows); };
  return <div className="modal-backdrop service-modal-backdrop" onKeyDown={event=>{if(event.key==="Escape")event.stopPropagation()}}><section className={`modal service-entry-modal ${mode === "bulk" ? "bulk" : ""}`} role="dialog" aria-modal="true"><header className="modal-head"><div><span className="eyebrow"><Layers3 size={14} /> {editing ? "EDIÇÃO" : mode === "bulk" ? "INSERÇÃO EM MASSA" : "NOVO REGISTRO"}</span><h2>{editing ? "Editar atendimento" : mode === "bulk" ? "Inserção em Massa de Atendimentos" : "Inserir atendimento"}</h2><p>{mode === "bulk" && !editing ? "Preencha cada atendimento individualmente e crie todos de uma vez." : "Registre os dados do atendimento realizado."}</p></div><button className="icon-button" type="button" aria-label="Fechar atendimento" onClick={onClose}><X size={18} /></button></header><form onSubmit={submit}><div className="service-entry-scroll">{rows.map((row, index) => <ServiceEntryCard key={row.key} row={row} index={index} customers={customers} employees={employees} departments={departments} origins={origins} versions={versions} problems={problems} statuses={statuses} contactTypes={contactTypes} tools={tools} onLookupChange={(pending) => setVersionLookups(current=>pending?[...new Set([...current,row.key])]:current.filter(key=>key!==row.key))} removable={rows.length > 1} onRemove={() => setRows((current) => current.filter((entry) => entry.key !== row.key))} onChange={(patch) => update(row.key, patch)} />)}{mode === "bulk" && !editing && <button className="service-add-entry" type="button" onClick={() => setRows((current) => [...current, makeRow(currentUser, currentEmployee)])}><Plus size={16} /> Adicionar atendimento</button>}</div>{validationError&&<p className="service-validation-error">{validationError}</p>}<footer className="service-modal-footer"><span><strong>{ready.length}</strong> de {rows.length} pronto(s) para envio</span><div><button className="primary-button" disabled={busy||waitingForVersion}><Save size={15} /> {editing ? "Salvar alterações" : `Criar ${rows.length} atendimento(s)`}</button></div></footer></form></section></div>;
}

function ServiceEntryCard({ row, index, customers, employees, departments, origins, versions, problems, statuses, contactTypes, tools, removable, onRemove, onChange, onLookupChange }: { row: EntryRow; index: number; customers: Customer[]; employees: Employee[]; departments: Department[]; origins: string[]; versions: string[]; problems: string[]; statuses: string[]; contactTypes: string[]; tools: string[]; onLookupChange: (pending:boolean) => void; removable: boolean; onRemove: () => void; onChange: (patch: Partial<EntryRow>) => void }) {
  const requestRef = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const [versionHint, setVersionHint] = useState("");
  useEffect(() => () => { requestSequence.current++; requestRef.current?.abort(); }, []);
  const cancelLookup = () => { requestSequence.current++; requestRef.current?.abort(); requestRef.current=null; onLookupChange(false); };
  const fillClient = (clientCode: string, customer?: Customer) => {
    cancelLookup();
    const fallbackVersion = customer?.product_version?.trim() || "";
    onChange({ clientCode, customerId: customer?.id || "", customerName: customer ? customer.trade_name || customer.legal_name : row.customerName, version: fallbackVersion });
    if (!/^\d{6}$/.test(clientCode)) { setVersionHint(""); return; }
    const sequence = requestSequence.current;
    const controller = new AbortController(); requestRef.current=controller; onLookupChange(true);
    setVersionHint("Consultando versão no histórico...");
    void (async () => {
      try {
        const response = await fetch("/api/service-records/version?clientId="+encodeURIComponent(clientCode), { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("lookup");
        const data = await response.json() as { version?: string | null };
        if (requestSequence.current !== sequence || controller.signal.aborted) return;
        onLookupChange(false);
        const version = data.version?.trim();
        if (version) { onChange({ version }); setVersionHint("Versão preenchida pelo histórico de atendimentos."); }
        else setVersionHint(fallbackVersion ? "Versão preenchida pelo cadastro do cliente." : "Sem versão no histórico. Selecione a versão.");
      } catch {
        if (requestSequence.current === sequence && !controller.signal.aborted) { onLookupChange(false); setVersionHint("Não foi possível consultar o histórico. Selecione a versão ou informe o ID novamente."); }
      }
    })();
  };
  const chooseCustomer = (customerId: string) => {
    const customer = customers.find((entry) => entry.id === customerId);
    if (!customer) { cancelLookup(); setVersionHint(""); onChange({ customerId: "" }); return; }
    fillClient(publicCustomerCode(customer), customer);
  };
  const changeClientCode = (rawValue: string) => {
    const clientCode = rawValue.replace(/\D/g, "").slice(0, 6);
    fillClient(clientCode, clientCode.length === 6 ? customers.find((entry) => publicCustomerCode(entry) === clientCode) : undefined);
  };
  const chooseResponsible = (id: string) => { const employee = employees.find((entry) => entry.id === id); onChange(employee ? { responsibleId: id, responsible: employee.displayName, sector: employee.departmentName || employee.departmentNames[0] || row.sector } : { responsibleId: "", responsible: "" }); };
  const toggleContact = (value: string) => onChange({ contactTypes: row.contactTypes.includes(value) ? row.contactTypes.filter((entry) => entry !== value) : [...row.contactTypes, value] });
  return <article className="service-entry-card"><header><b>Atendimento #{index + 1}</b>{removable && <button type="button" onClick={onRemove} aria-label="Remover atendimento"><Trash2 size={15} /></button>}</header><div className="service-entry-grid"><label className="wide">Cliente cadastrado<select value={row.customerId} onChange={(event) => chooseCustomer(event.target.value)}><option value="">Preencher manualmente</option>{customers.map((customer) => { const publicId = publicCustomerCode(customer); return <option key={customer.id} value={customer.id} disabled={!publicId}>{customer.trade_name || customer.legal_name} · {publicId || "sem ID Dontus"}</option>; })}</select></label><label>ID do cliente *<input required inputMode="numeric" maxLength={6} pattern="\d{6}" value={row.clientCode} onChange={(event) => changeClientCode(event.target.value)} placeholder="000000" /><small>{row.customerId ? "ID Dontus vinculado automaticamente." : "Informe a sequência pública de 6 números."}</small></label><label>Nome do cliente *<input required value={row.customerName} onChange={(event) => onChange({ customerName: event.target.value })} placeholder="Nome completo" /></label><label><CalendarDays size={13} /> Data *<input required type="date" value={row.date} onChange={(event) => onChange({ date: event.target.value })} /></label><label><UserRound size={13} /> Responsável *<SearchablePeopleSelect searchLabel="Responsável *" required value={row.responsibleId} onChange={(event) => chooseResponsible(event.target.value)}><option value="">Selecionar...</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.displayName}</option>)}</SearchablePeopleSelect></label><label>Setor *<select required value={row.sector} onChange={(event) => onChange({ sector: event.target.value })}><option value="">Selecionar...</option>{departments.map((entry) => <option key={entry.id}>{entry.name}</option>)}{row.sector && !departments.some((entry) => entry.name === row.sector) && <option>{row.sector}</option>}</select></label><label>Origem{origins.length > 0 ? " *" : ""}<select required={origins.length > 0} value={row.origin} onChange={(event) => onChange({ origin: event.target.value })}><option value="">Selecionar...</option>{origins.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Versão<select value={row.version} onChange={(event) => { cancelLookup(); setVersionHint(""); onChange({ version: event.target.value }); }}><option value="">Selecionar...</option>{row.version && !versions.includes(row.version) && <option value={row.version}>{row.version}</option>}{versions.map((entry) => <option key={entry}>{entry}</option>)}</select>{versionHint && <small role="status">{versionHint}</small>}</label><label><Clock3 size={13} /> Hora início<input type="time" value={row.startTime} onChange={(event) => onChange({ startTime: event.target.value })} /></label><label><Clock3 size={13} /> Hora fim<input type="time" value={row.endTime} onChange={(event) => onChange({ endTime: event.target.value })} /></label><label>Problema / situação *<select required value={row.problem} onChange={(event) => onChange({ problem: event.target.value })}><option value="">Selecionar...</option>{problems.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Status *<select required value={row.status} onChange={(event) => onChange({ status: event.target.value })}><option value="">Selecionar...</option>{statuses.map((entry) => <option key={entry}>{entry}</option>)}</select></label><fieldset className="wide service-contact-types"><legend>Tipo de contato{contactTypes.length ? " *" : ""}</legend>{contactTypes.length===0&&<p className="empty-copy">Cadastre os tipos de contato em Configurar atendimentos para registrar ligações, WhatsApp e outros canais.</p>}{contactTypes.map((entry) => <label key={entry}><input type="checkbox" required={contactTypes.length>0&&row.contactTypes.length===0} checked={row.contactTypes.includes(entry)} onChange={() => toggleContact(entry)} /> {entry}</label>)}</fieldset><label className="wide">Ferramenta / módulo<select value={row.tool} onChange={(event) => onChange({ tool: event.target.value })}><option value="">Selecionar...</option>{tools.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Observação<textarea rows={3} value={row.notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="Detalhes do atendimento..." /></label><label>Resumo da solução<textarea rows={3} value={row.solution} onChange={(event) => onChange({ solution: event.target.value })} placeholder="Como foi solucionado..." /></label></div></article>;
}
