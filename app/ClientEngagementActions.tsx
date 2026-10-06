"use client";

import { AlertTriangle, Check, ClipboardCheck, Plus, Save, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ReminderContext } from "@/app/ReminderAction";

type OperationResult = { id?: string } | false;
type Customer = { id: string; trade_name: string; legal_name: string; document_masked: string };
type Catalog = { id: string; catalog: string; name: string; description: string; active: boolean };
type WorkItem = { id: string; module: string; record_type: string; title: string; customer_id: string | null; customer_name: string; owner: string; description: string; version: number; created_at: string; updated_at: string };
type User = { displayName: string };
type Operate = (payload: Record<string, unknown>, success: string) => Promise<OperationResult>;

export type CustomerAlertDetail = {
  kind: "customerAlert";
  sourceModule: string;
  sourceEntityId?: string;
  sourceTitle: string;
  severity: "Informativo" | "Atenção" | "Crítico";
  subject: string;
  text: string;
  createdAt: string;
  author: string;
};

export type LinkedChecklistDetail = {
  kind: "linkedChecklist";
  sourceModule: string;
  sourceEntityId?: string;
  sourceTitle: string;
  templateId: string;
  templateName: string;
  createdAt: string;
  createdBy: string;
  items: Array<{ id: string; text: string; checked: boolean; checkedAt?: string; checkedBy?: string }>;
  history: Array<{ at: string; author: string; text: string }>;
};

export function parseCustomerAlert(value: string): CustomerAlertDetail | null {
  try { const detail = JSON.parse(value) as Partial<CustomerAlertDetail>; return detail.kind === "customerAlert" ? detail as CustomerAlertDetail : null; } catch { return null; }
}

export function parseLinkedChecklist(value: string): LinkedChecklistDetail | null {
  try { const detail = JSON.parse(value) as Partial<LinkedChecklistDetail>; return detail.kind === "linkedChecklist" && Array.isArray(detail.items) ? { ...detail, history: Array.isArray(detail.history) ? detail.history : [] } as LinkedChecklistDetail : null; } catch { return null; }
}

function publicId(customer: Customer) { const digits = customer.document_masked.replace(/\D/g, ""); return digits.length === 6 ? digits : ""; }
function resolveCustomer(context: ReminderContext, customers: Customer[]) {
  const clientId = String(context.clientId || "").trim().toLocaleLowerCase("pt-BR");
  const customerName = String(context.customerName || context.title || "").trim().toLocaleLowerCase("pt-BR");
  return customers.find((entry) => entry.id.toLocaleLowerCase("pt-BR") === clientId || publicId(entry) === clientId)
    ?? customers.find((entry) => [entry.trade_name, entry.legal_name].some((name) => name && (name.toLocaleLowerCase("pt-BR") === customerName || customerName.includes(name.toLocaleLowerCase("pt-BR")))));
}

function sourceItem(context: ReminderContext, items: WorkItem[]) {
  return context.entityId ? items.find((item) => item.id === context.entityId) : undefined;
}

function resolveContextCustomer(context: ReminderContext, customers: Customer[], items: WorkItem[]) {
  const source = sourceItem(context, items);
  if (source?.customer_id) {
    const linked = customers.find((customer) => customer.id === source.customer_id);
    if (linked) return linked;
  }
  return resolveCustomer({ ...context, customerName: source?.customer_name || context.customerName }, customers);
}

export function checklistCatalogFor(context: ReminderContext, items: WorkItem[]) {
  if (context.module === "support") return "serviceChecklist";
  if (context.module === "cancellations") return "cancellationChecklist";
  if (context.module === "lia") return "liaChecklistTemplate";
  const source = sourceItem(context, items);
  if (context.module === "commercial") return /retenção/i.test(source?.record_type || "") ? "retentionChecklist" : "commercialChecklist";
  if (context.module === "cs") {
    try {
      const detail = JSON.parse(source?.description || "{}") as { kind?: string; track?: string };
      if (detail.kind === "enterpriseNetwork") return "enterpriseChecklist";
      return detail.track === "retention" ? "csRetentionChecklist" : "csActivationChecklist";
    } catch { return "csActivationChecklist"; }
  }
  return "";
}

function modalTitle(context: ReminderContext) { return context.customerName || context.title || "Cliente"; }

export function ClientAlertModal({ context, customers, user, busy, operate, onClose }: { context: ReminderContext; customers: Customer[]; user: User; busy: boolean; operate: Operate; onClose: () => void }) {
  const initialCustomer = resolveCustomer(context, customers);
  const [customerId, setCustomerId] = useState(initialCustomer?.id || "");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const customer = customers.find((entry) => entry.id === customerId);
    if (!customer) { setError("Selecione o cliente que receberá este alerta."); return; }
    const form = new FormData(event.currentTarget);
    const subject = String(form.get("subject") || "").trim();
    const text = String(form.get("text") || "").trim();
    if (!subject || !text) return;
    const detail: CustomerAlertDetail = { kind: "customerAlert", sourceModule: context.module, sourceEntityId: context.entityId, sourceTitle: context.title || customer.trade_name, severity: String(form.get("severity") || "Atenção") as CustomerAlertDetail["severity"], subject, text, createdAt: new Date().toISOString(), author: user.displayName };
    const saved = await operate({ action: "createWorkItem", module: "customers", recordType: "Alerta do cliente", title: `Alerta · ${subject}`, customerId: customer.id, customerName: customer.trade_name || customer.legal_name, owner: user.displayName, team: "Customer 360", status: "Ativo", priority: detail.severity === "Crítico" ? "P1" : detail.severity === "Atenção" ? "P2" : "P3", amountCents: 0, originType: context.module, originId: context.entityId, description: JSON.stringify(detail) }, "Alerta registrado na ficha do cliente.");
    if (saved) onClose();
  };
  return <div className="modal-backdrop client-engagement-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="modal client-alert-modal"><header className="modal-head"><div><span className="eyebrow">ALERTA DO CLIENTE</span><h2>Registrar alerta</h2><p>O registro ficará visível diretamente na aba Alerta da ficha do cliente.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X /></button></header><form className="form-grid" onSubmit={(event) => void submit(event)}><div className="client-action-source wide"><AlertTriangle /><span><small>ORIGEM · {context.module.toLocaleUpperCase("pt-BR")}</small><strong>{modalTitle(context)}</strong></span></div><label className="wide">Cliente *<select required value={customerId} onChange={(event) => { setCustomerId(event.target.value); setError(""); }}><option value="">Selecionar cliente</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.trade_name || customer.legal_name}{publicId(customer) ? ` · ID ${publicId(customer)}` : ""}</option>)}</select></label><label>Classificação<select name="severity" defaultValue="Atenção"><option>Informativo</option><option>Atenção</option><option>Crítico</option></select></label><label>Assunto *<input name="subject" required placeholder="Ex.: Atenção no próximo contato" /></label><label className="wide">Informação específica *<textarea name="text" rows={5} required placeholder="Descreva o alerta, contexto e orientação para a equipe..." /></label>{error && <p className="form-error wide">{error}</p>}<div className="form-actions wide"><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}><Save size={15} /> Registrar alerta</button></div></form></section></div>;
}

function templateChecks(catalog: Catalog) {
  try { const detail = JSON.parse(catalog.description) as { checks?: unknown[] }; return Array.isArray(detail.checks) ? detail.checks.map(String).map((entry) => entry.trim()).filter(Boolean) : []; } catch { return []; }
}

export function ClientChecklistModal({ context, customers, catalogs, items, user, busy, operate, onClose }: { context: ReminderContext; customers: Customer[]; catalogs: Catalog[]; items: WorkItem[]; user: User; busy: boolean; operate: Operate; onClose: () => void }) {
  const customer = resolveContextCustomer(context, customers, items);
  const catalog = checklistCatalogFor(context, items);
  const templates = catalogs.filter((entry) => entry.active && entry.catalog === catalog && templateChecks(entry).length);
  const [templateId, setTemplateId] = useState(templates[0]?.id || "");
  const [error, setError] = useState("");
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const surfaces = Array.from(document.querySelectorAll<HTMLElement>(`[data-reminder-source-module="${context.module}"]`));
    const source = surfaces.at(-1);
    if (!source) return;
    source.classList.add("checklist-inline-open");
    setHost(source);
    window.setTimeout(() => source.querySelector<HTMLElement>(".client-checklist-inline-panel")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    const observer = new MutationObserver(() => { if (!source.isConnected) onClose(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); source.classList.remove("checklist-inline-open"); };
  }, [context.module, onClose]);
  const linked = useMemo(() => items.map((item) => ({ item, detail: item.record_type === "Checklist vinculado" ? parseLinkedChecklist(item.description) : null })).filter((entry): entry is { item: WorkItem; detail: LinkedChecklistDetail } => Boolean(entry.detail)).filter(({ detail }) => detail.sourceModule === context.module && (context.entityId ? detail.sourceEntityId === context.entityId : detail.sourceTitle === context.title)), [items, context]);
  const add = async () => {
    const template = templates.find((entry) => entry.id === templateId);
    if (!customer) { setError("Não foi possível identificar automaticamente o cliente vinculado a este card."); return; }
    if (!template) { setError("Selecione um tipo de checklist configurado."); return; }
    if (linked.some(({ detail }) => detail.templateId === template.id)) { setError("Este tipo de checklist já está vinculado ao card."); return; }
    const createdAt = new Date().toISOString();
    const detail: LinkedChecklistDetail = { kind: "linkedChecklist", sourceModule: context.module, sourceEntityId: context.entityId, sourceTitle: context.title || customer.trade_name, templateId: template.id, templateName: template.name, createdAt, createdBy: user.displayName, items: templateChecks(template).map((text, index) => ({ id: `${template.id}-${index}-${Date.now()}`, text, checked: false })), history: [{ at: createdAt, author: user.displayName, text: `Checklist “${template.name}” vinculado ao card.` }] };
    await operate({ action: "createWorkItem", module: "customers", recordType: "Checklist vinculado", title: `Checklist · ${template.name} · ${customer.trade_name}`, customerId: customer.id, customerName: customer.trade_name || customer.legal_name, owner: user.displayName, team: "Customer 360", status: "Em andamento", priority: "P3", amountCents: 0, originType: context.module, originId: context.entityId, description: JSON.stringify(detail) }, "Checklist vinculado ao cliente.");
  };
  const update = async (item: WorkItem, detail: LinkedChecklistDetail, index: number) => {
    const changedAt = new Date().toISOString();
    const nextItems = detail.items.map((entry, currentIndex) => currentIndex === index ? { ...entry, checked: !entry.checked, checkedAt: !entry.checked ? changedAt : undefined, checkedBy: !entry.checked ? user.displayName : undefined } : entry);
    const changed = nextItems[index];
    await operate({ action: "updateWorkItem", id: item.id, title: item.title, owner: item.owner, amountCents: 0, version: item.version, description: JSON.stringify({ ...detail, items: nextItems, history: [...detail.history, { at: changedAt, author: user.displayName, text: `${changed.checked ? "Concluiu" : "Reabriu"}: ${changed.text}` }] }) }, "Checklist atualizado.");
  };
  const remove = async (item: WorkItem) => { await operate({ action: "deleteWorkItem", id: item.id }, "Checklist removido do card."); };
  if (!host) return null;
  return createPortal(<section className="client-checklist-inline-panel" aria-label="Checklists deste card">
    <header><div><span className="eyebrow">CHECKLISTS DO CARD</span><h3>Vincular e acompanhar checklists</h3><p>Inclua os modelos e marque os itens diretamente neste card.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar checklist"><X /></button></header>
    <div className="client-checklist-body"><div className="client-action-source"><ClipboardCheck /><span><small>CLIENTE VINCULADO</small><strong>{customer ? `${customer.trade_name || customer.legal_name}${publicId(customer) ? ` · ID ${publicId(customer)}` : ""}` : "Cliente não identificado"}</strong></span></div><section className="checklist-link-box"><label>Tipo de checklist<select value={templateId} onChange={(event) => { setTemplateId(event.target.value); setError(""); }}><option value="">Selecionar modelo</option>{templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select></label><button className="primary-button" type="button" disabled={busy || !templateId || !customer} onClick={() => void add()}><Plus size={15} /> Vincular checklist</button>{!templates.length && <small className="checklist-config-empty">Cadastre um tipo de checklist na engrenagem desta funcionalidade.</small>}{error && <p className="form-error">{error}</p>}</section><section className="linked-checklists">{linked.length === 0 ? <div className="checklist-empty"><ClipboardCheck /><strong>Nenhum checklist vinculado</strong><p>Selecione um modelo acima para começar.</p></div> : linked.map(({ item, detail }) => { const completed = detail.items.filter((entry) => entry.checked).length; return <article className="linked-checklist-card" key={item.id}><header><span><strong>{detail.templateName}</strong><small>{completed} de {detail.items.length} concluído(s) · {detail.createdBy}</small></span><button type="button" disabled={busy} onClick={() => void remove(item)} aria-label={`Remover checklist ${detail.templateName}`}><Trash2 size={14} /></button></header><div>{detail.items.map((entry, index) => <button type="button" className={entry.checked ? "checked" : ""} disabled={busy} onClick={() => void update(item, detail, index)} key={entry.id}><i>{entry.checked && <Check size={13} />}</i><span>{entry.text}</span></button>)}</div><footer><span style={{ width: `${detail.items.length ? completed / detail.items.length * 100 : 0}%` }} /></footer></article>; })}</section></div>
  </section>, host);
}
