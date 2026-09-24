"use client";

import {
  CalendarDays, ChevronDown, Clock3, Headphones, Layers3, Pencil,
  Plus, Save, Search, Settings, Trash2, UserRound, X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type OperationResult = { id?: string } | false;
type WorkItem = {
  id: string; module: string; record_type: string; title: string; customer_id: string | null;
  customer_name: string; owner: string; team: string; status: string; priority: string;
  amount_cents: number; description: string; version: number; created_at: string; updated_at: string;
};
type Customer = { id: string; trade_name: string; legal_name: string; phone: string; product_version: string };
type Catalog = { id: string; catalog: string; name: string; active: boolean };
type Employee = { id: string; displayName: string; departmentId: string | null; departmentName: string; departmentNames: string[]; photoDataUrl?: string; active: boolean };
type Department = { id: string; name: string; active: boolean };
type CurrentUser = { displayName: string; department: string };

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
  const configured = (catalog: string, fallback: string[] = []) => unique([
    ...catalogs.filter((entry) => entry.active && entry.catalog === catalog).map((entry) => entry.name), ...fallback,
  ]);
  const versions = unique([...configured("serviceVersion"), ...customers.map((entry) => entry.product_version), ...records.map((entry) => entry.detail.version)]);
  const problems = unique([...configured("serviceProblem", ["Alinhamento", "Acompanhamento", "Agendamento", "Dúvida", "Erro"]), ...records.map((entry) => entry.detail.problem)]);
  const statuses = unique([...configured("serviceStatus", ["Concluído", "Em andamento", "Pendente"]), ...records.map((entry) => entry.detail.status)]);
  const responsibleOptions = unique([...employees.filter((entry) => entry.active).map((entry) => entry.displayName), ...records.map((entry) => entry.detail.responsible)]);
  const sectorOptions = unique([...departments.filter((entry) => entry.active).map((entry) => entry.name), ...records.map((entry) => entry.detail.sector)]);
  const visible = records.filter(({ detail }) => {
    const idNeedle = queryId.trim().toLocaleLowerCase("pt-BR");
    const nameNeedle = queryName.trim().toLocaleLowerCase("pt-BR");
    return (!idNeedle || detail.clientCode.toLocaleLowerCase("pt-BR").includes(idNeedle))
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

    <nav className="service-sector-tabs" aria-label="Atendimentos por setor"><button className={sector === "all" ? "active" : ""} onClick={() => setSector("all")}>Todos <b>{records.length}</b></button>{sectorOptions.map((name) => <button className={sector === name ? "active" : ""} onClick={() => setSector(name)} key={name}>{name} <b>{records.filter((entry) => entry.detail.sector === name).length}</b></button>)}</nav>

    <section className="service-filter-panel"><header><Search size={14} /> FILTROS DE PESQUISA</header><div className="service-filter-grid"><label><span>ID do cliente</span><input value={queryId} onChange={(event) => setQueryId(event.target.value)} placeholder="ID do cliente" /></label><label><span>Nome do cliente</span><input value={queryName} onChange={(event) => setQueryName(event.target.value)} placeholder="Nome do cliente" /></label><label><span>Data</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label><span>Responsável</span><select value={responsible} onChange={(event) => setResponsible(event.target.value)}><option value="all">Todos os responsáveis</option>{responsibleOptions.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label><span>Versão</span><select value={version} onChange={(event) => setVersion(event.target.value)}><option value="all">Todas versões</option>{versions.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label><span>Problema</span><select value={problem} onChange={(event) => setProblem(event.target.value)}><option value="all">Todos problemas</option>{problems.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos status</option>{statuses.map((entry) => <option key={entry}>{entry}</option>)}</select></label></div></section>

    <section className="service-list" aria-label="Lista de atendimentos"><header><span>ID</span><span>CLIENTE</span><span>DATA</span><span>RESPONSÁVEL</span><span>VERSÃO</span><span>PROBLEMA</span><span>STATUS</span><span>AÇÕES</span></header>{visible.length === 0 ? <div className="service-empty"><Headphones size={24} /><strong>Nenhum atendimento encontrado</strong><p>Insira um atendimento ou ajuste os filtros de pesquisa.</p></div> : visible.map(({ item, detail }) => <article key={item.id}><span className="service-client-id">{detail.clientCode || item.id.slice(0, 8)}</span><span><strong>{detail.customerName || item.customer_name}</strong><small>{detail.origin || "Origem não informada"}</small></span><span>{displayDate(detail.date)}<small>{detail.startTime}{detail.endTime ? ` – ${detail.endTime}` : ""}</small></span><span className="service-owner" data-collaborator-name={detail.responsible||item.owner}><i style={employees.find(employee=>employee.displayName===(detail.responsible||item.owner))?.photoDataUrl?{backgroundImage:`url("${employees.find(employee=>employee.displayName===(detail.responsible||item.owner))?.photoDataUrl}")`}:undefined}/><span><strong>{detail.responsible || item.owner}</strong><small>{detail.sector || item.team}</small></span></span><span>{detail.version || "—"}</span><span>{detail.problem || "—"}<small>{detail.tool || ""}</small></span><span><label className={`service-status-select ${serviceTone(detail.status)}`}><i /><select disabled={!canEdit || busy} value={detail.status} onChange={(event) => void changeStatus(item, detail, event.target.value)}>{statuses.map((entry) => <option key={entry}>{entry}</option>)}</select><ChevronDown size={13} /></label></span><span className="service-row-actions">{canEdit && <button onClick={() => setEditing(item)} aria-label="Editar atendimento"><Pencil size={15} /></button>}{canDelete && <button className="delete" onClick={() => void operate({ action: "deleteWorkItem", id: item.id }, "Atendimento excluído com sucesso.")} aria-label="Excluir atendimento"><Trash2 size={15} /></button>}</span></article>)}</section>

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
  const currentEmployee = employees.find((entry) => entry.displayName === currentUser.displayName);
  const parsed = editing ? parseRecord(editing.description) : null;
  const initial = parsed ? [{ ...parsed, key: crypto.randomUUID(), customerId: editing?.customer_id ?? "" }] : [makeRow(currentUser, currentEmployee)];
  const [rows, setRows] = useState<EntryRow[]>(initial);
  const [validationError, setValidationError] = useState("");
  const options = (catalog: string, fallback: string[] = []) => unique([...catalogs.filter((entry) => entry.active && entry.catalog === catalog).map((entry) => entry.name), ...fallback]);
  const versions = unique([...options("serviceVersion"), ...customers.map((entry) => entry.product_version)]);
  const origins = options("serviceOrigin", ["WhatsApp", "Ligação", "Interno"]);
  const problems = options("serviceProblem", ["Alinhamento", "Acompanhamento", "Agendamento", "Dúvida", "Erro"]);
  const statuses = options("serviceStatus", ["Concluído", "Em andamento", "Pendente"]);
  const contactTypes = options("serviceContactType", ["1º Contato", "2º Contato", "Ligação"]).filter((entry) => !/mal uso|cancelamento/i.test(entry));
  const tools = options("serviceTool", ["Agenda", "Atendimento", "Financeiro", "CRM", "LIA"]);
  const update = (key: string, patch: Partial<EntryRow>) => setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  const ready = rows.filter((row) => row.clientCode.trim() && row.customerName.trim() && row.date && row.responsible && row.problem && row.status);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (ready.length !== rows.length) { setValidationError("Preencha ID, cliente, data, responsável, problema e status em todos os atendimentos."); return; } setValidationError(""); void onSave(rows); };
  return <div className="modal-backdrop service-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className={`modal service-entry-modal ${mode === "bulk" ? "bulk" : ""}`} role="dialog" aria-modal="true"><header className="modal-head"><div><span className="eyebrow"><Layers3 size={14} /> {editing ? "EDIÇÃO" : mode === "bulk" ? "INSERÇÃO EM MASSA" : "NOVO REGISTRO"}</span><h2>{editing ? "Editar atendimento" : mode === "bulk" ? "Inserção em Massa de Atendimentos" : "Inserir atendimento"}</h2><p>{mode === "bulk" && !editing ? "Preencha cada atendimento individualmente e crie todos de uma vez." : "Registre os dados do atendimento realizado."}</p></div><button className="icon-button" type="button" onClick={onClose}><X size={18} /></button></header><form onSubmit={submit}><div className="service-entry-scroll">{rows.map((row, index) => <ServiceEntryCard key={row.key} row={row} index={index} customers={customers} employees={employees} departments={departments} origins={origins} versions={versions} problems={problems} statuses={statuses} contactTypes={contactTypes} tools={tools} removable={rows.length > 1} onRemove={() => setRows((current) => current.filter((entry) => entry.key !== row.key))} onChange={(patch) => update(row.key, patch)} />)}{mode === "bulk" && !editing && <button className="service-add-entry" type="button" onClick={() => setRows((current) => [...current, makeRow(currentUser, currentEmployee)])}><Plus size={16} /> Adicionar atendimento</button>}</div>{validationError&&<p className="service-validation-error">{validationError}</p>}<footer className="service-modal-footer"><span><strong>{ready.length}</strong> de {rows.length} pronto(s) para envio</span><div><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}><Save size={15} /> {editing ? "Salvar alterações" : `Criar ${rows.length} atendimento(s)`}</button></div></footer></form></section></div>;
}

function ServiceEntryCard({ row, index, customers, employees, departments, origins, versions, problems, statuses, contactTypes, tools, removable, onRemove, onChange }: { row: EntryRow; index: number; customers: Customer[]; employees: Employee[]; departments: Department[]; origins: string[]; versions: string[]; problems: string[]; statuses: string[]; contactTypes: string[]; tools: string[]; removable: boolean; onRemove: () => void; onChange: (patch: Partial<EntryRow>) => void }) {
  const chooseCustomer = (customerId: string) => { const customer = customers.find((entry) => entry.id === customerId); onChange(customer ? { customerId, clientCode: customer.id.slice(0, 8), customerName: customer.trade_name || customer.legal_name, version: customer.product_version || row.version } : { customerId: "" }); };
  const chooseResponsible = (id: string) => { const employee = employees.find((entry) => entry.id === id); onChange(employee ? { responsibleId: id, responsible: employee.displayName, sector: employee.departmentName || employee.departmentNames[0] || row.sector } : { responsibleId: "", responsible: "" }); };
  const toggleContact = (value: string) => onChange({ contactTypes: row.contactTypes.includes(value) ? row.contactTypes.filter((entry) => entry !== value) : [...row.contactTypes, value] });
  return <article className="service-entry-card"><header><b>Atendimento #{index + 1}</b>{removable && <button type="button" onClick={onRemove} aria-label="Remover atendimento"><Trash2 size={15} /></button>}</header><div className="service-entry-grid"><label className="wide">Cliente cadastrado<select value={row.customerId} onChange={(event) => chooseCustomer(event.target.value)}><option value="">Preencher manualmente</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.trade_name} · {customer.id.slice(0, 8)}</option>)}</select></label><label>ID do cliente *<input required value={row.clientCode} onChange={(event) => onChange({ clientCode: event.target.value })} placeholder="000000" /></label><label>Nome do cliente *<input required value={row.customerName} onChange={(event) => onChange({ customerName: event.target.value })} placeholder="Nome completo" /></label><label><CalendarDays size={13} /> Data *<input required type="date" value={row.date} onChange={(event) => onChange({ date: event.target.value })} /></label><label><UserRound size={13} /> Responsável *<select required value={row.responsibleId} onChange={(event) => chooseResponsible(event.target.value)}><option value="">Selecionar...</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.displayName}</option>)}</select></label><label>Setor *<select required value={row.sector} onChange={(event) => onChange({ sector: event.target.value })}><option value="">Selecionar...</option>{departments.map((entry) => <option key={entry.id}>{entry.name}</option>)}{row.sector&&!departments.some(entry=>entry.name===row.sector)&&<option>{row.sector}</option>}{row.sector && !departments.some((entry) => entry.name === row.sector) && <option>{row.sector}</option>}</select></label><label>Origem<select value={row.origin} onChange={(event) => onChange({ origin: event.target.value })}><option value="">Selecionar...</option>{origins.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Versão<select value={row.version} onChange={(event) => onChange({ version: event.target.value })}><option value="">Selecionar...</option>{versions.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label><Clock3 size={13} /> Hora início<input type="time" value={row.startTime} onChange={(event) => onChange({ startTime: event.target.value })} /></label><label><Clock3 size={13} /> Hora fim<input type="time" value={row.endTime} onChange={(event) => onChange({ endTime: event.target.value })} /></label><label>Problema / situação *<select required value={row.problem} onChange={(event) => onChange({ problem: event.target.value })}><option value="">Selecionar...</option>{problems.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Status *<select required value={row.status} onChange={(event) => onChange({ status: event.target.value })}><option value="">Selecionar...</option>{statuses.map((entry) => <option key={entry}>{entry}</option>)}</select></label><fieldset className="wide service-contact-types"><legend>Tipo de contato</legend>{contactTypes.map((entry) => <label key={entry}><input type="checkbox" checked={row.contactTypes.includes(entry)} onChange={() => toggleContact(entry)} /> {entry}</label>)}</fieldset><label className="wide">Ferramenta / módulo<select value={row.tool} onChange={(event) => onChange({ tool: event.target.value })}><option value="">Selecionar...</option>{tools.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Observação<textarea rows={3} value={row.notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="Detalhes do atendimento..." /></label><label>Resumo da solução<textarea rows={3} value={row.solution} onChange={(event) => onChange({ solution: event.target.value })} placeholder="Como foi solucionado..." /></label></div></article>;
}
