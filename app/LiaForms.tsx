"use client";

import { ArrowRight, CheckCircle2, ClipboardList, Copy, ExternalLink, LockKeyhole, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";

type Question = { id: string; text: string; type: string; required: boolean; options: string[] };
type Definition = { id?: string; name: string; description: string; active: boolean; questions: Question[]; version?: number };
export type LiaFormRequest = { id: string; workItemId: string; formId: string; formName: string; formDescription: string; questions: Question[]; createdAt: string; submittedAt: string | null; answers: Record<string, string>; token: string; clientName: string };
const questionTypes = [["text", "Texto curto"], ["textarea", "Texto longo"], ["select", "Seleção de uma opção"], ["email", "E-mail"], ["date", "Data"], ["number", "Número"]];
const stamp = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date(value));
const newQuestion = (): Question => ({ id: crypto.randomUUID(), text: "", type: "text", required: true, options: [] });
export const liaFormUrl = (token: string) => `${window.location.origin}/lia-form/${encodeURIComponent(token)}`;
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Não foi possível concluir a operação.");
  return data as T;
}
function FormModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop nested-modal lia-form-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section role="dialog" aria-modal="true" aria-label={title} className="modal lia-form-modal"><header className="modal-head"><div><span className="eyebrow">ACOMPANHAMENTO LIA</span><h2>{title}</h2></div><button className="icon-button" type="button" aria-label="Fechar" onClick={onClose}><X size={19}/></button></header>{children}</section></div>;
}

export function LiaFormsSettings() {
  const [forms, setForms] = useState<Definition[]>([]);
  const [editing, setEditing] = useState<Definition | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => { try { setForms(await api<Definition[]>("/api/lia-forms")); setError(""); setLoaded(true); } catch (caught) { setError((caught as Error).message); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing || busy) return; setBusy(true); setError("");
    try { await api("/api/lia-forms", editing); setEditing(null); await load(); }
    catch (caught) { setError((caught as Error).message); } finally { setBusy(false); }
  }
  const patchQuestion = (index: number, patch: Partial<Question>) => setEditing(current => current && ({ ...current, questions: current.questions.map((q, i) => i === index ? { ...q, ...patch } : q) }));
  return <section className="agenda-catalog-card lia-form-settings"><div className="agenda-catalog-head"><div><span className="eyebrow">FORMULÁRIOS LIA</span><h2>Formulários para o cliente</h2><p>Crie modelos de perguntas e gere um link individual pelo card do cliente.</p></div><button className="primary-button" type="button" onClick={() => { setError(""); setEditing({ name: "", description: "", active: true, questions: [newQuestion()] }); }}><Plus size={16}/> Criar formulário</button></div>
    {error && !editing && <p role="alert" className="form-error">{error} <button type="button" onClick={() => void load()}>Tentar novamente</button></p>}
    <div className="lia-form-definitions">{forms.map(form => <article key={form.id}><ClipboardList/><div><strong>{form.name}</strong><small>{form.questions.length} pergunta(s) · {form.active ? "Ativo" : "Inativo"}</small><p>{form.description}</p></div><button className="secondary-button" type="button" onClick={() => { setError(""); setEditing(form); }}>Editar formulário</button></article>)}{loaded && !forms.length && <p className="empty-state">Nenhum formulário criado. Comece adicionando um modelo de perguntas.</p>}</div>
    {editing && <FormModal title={editing.id ? "Editar formulário" : "Criar formulário"} onClose={() => !busy && setEditing(null)}><form className="lia-form-builder" onSubmit={save}><div className="form-grid"><label className="wide">Nome do formulário *<input required maxLength={160} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })}/></label><label className="wide">Descrição para o cliente<textarea maxLength={2000} rows={2} value={editing.description} onChange={event => setEditing({ ...editing, description: event.target.value })}/></label><label className="checkbox-label wide"><input type="checkbox" checked={editing.active} onChange={event => setEditing({ ...editing, active: event.target.checked })}/> Disponível para gerar novos links</label></div>
      <div className="lia-form-questions">{editing.questions.map((question, index) => <fieldset key={question.id}><legend>Pergunta {index + 1}</legend><div className="lia-question-top"><label>Pergunta *<input required maxLength={500} value={question.text} onChange={event => patchQuestion(index, { text: event.target.value })}/></label><button className="catalog-icon-button delete" type="button" disabled={editing.questions.length === 1} aria-label={`Excluir pergunta ${index + 1}`} onClick={() => setEditing({ ...editing, questions: editing.questions.filter(q => q.id !== question.id) })}><Trash2 size={16}/></button></div><div className="field-grid"><label>Tipo de resposta<select value={question.type} onChange={event => patchQuestion(index, { type: event.target.value })}>{questionTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="checkbox-label"><input type="checkbox" checked={question.required} onChange={event => patchQuestion(index, { required: event.target.checked })}/> Resposta obrigatória</label></div>{question.type === "select" && <label>Opções (uma por linha)<textarea required rows={4} value={question.options.join("\n")} onChange={event => patchQuestion(index, { options: event.target.value.split("\n") })}/></label>}</fieldset>)}</div>
      <button className="secondary-button" type="button" disabled={editing.questions.length >= 50} onClick={() => setEditing({ ...editing, questions: [...editing.questions, newQuestion()] })}><Plus size={16}/> Adicionar pergunta</button>
      {editing.id && <p className="lia-form-note">As alterações valem para novos links. Os formulários já enviados preservam as perguntas originais.</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button><button className="primary-button" disabled={busy} type="submit"><Save size={16}/>{busy ? "Salvando..." : "Salvar formulário"}</button></div></form></FormModal>}
  </section>;
}

export function useLiaFormRequests() {
  const [requests, setRequests] = useState<LiaFormRequest[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => { try { setRequests(await api<LiaFormRequest[]>("/api/lia-forms/requests")); setError(""); } catch (caught) { setError((caught as Error).message); } }, []);
  useEffect(() => { void refresh(); const update = () => { if (document.visibilityState === "visible") void refresh(); }; const timer = setInterval(update, 30000); window.addEventListener("focus", update); return () => { clearInterval(timer); window.removeEventListener("focus", update); }; }, [refresh]);
  return { requests, refresh, error };
}

export function LiaFormStatus({ requests }: { requests: LiaFormRequest[] }) {
  if (!requests.length) return <span className="status-pill lia-form-status">Formulário não enviado</span>;
  const answered = requests.filter(entry => entry.submittedAt).length;
  return <span className={`status-pill lia-form-status ${answered === requests.length ? "positive" : "warning"}`}>{answered === requests.length ? "Formulário respondido" : "Formulário não respondido"}{requests.length > 1 ? ` · ${answered}/${requests.length}` : ""}</span>;
}

export function LiaClientForms({ workItemId, clientName, requests, canEdit, onRefresh }: { workItemId: string; clientName: string; requests: LiaFormRequest[]; canEdit: boolean; onRefresh: () => Promise<void> }) {
  const [selecting, setSelecting] = useState(false);
  const [forms, setForms] = useState<Definition[]>([]);
  const [formId, setFormId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [generated, setGenerated] = useState("");
  async function open() { setError(""); setGenerated(""); setMessage(""); setSelecting(true); setBusy(true); try { const options = (await api<Definition[]>("/api/lia-forms")).filter(form => form.active); setForms(options); setFormId(options[0]?.id || ""); } catch (caught) { setError((caught as Error).message); } finally { setBusy(false); } }
  async function generate(event: FormEvent) { event.preventDefault(); if (!formId || busy) return; setBusy(true); setError(""); try { const result = await api<{ token: string }>("/api/lia-forms/requests", { workItemId, formId }); setGenerated(liaFormUrl(result.token)); await onRefresh(); } catch (caught) { setError((caught as Error).message); } finally { setBusy(false); } }
  async function copy(url: string) { try { await navigator.clipboard.writeText(url); setMessage("Link copiado."); } catch { setError("Não foi possível copiar automaticamente. Abra o formulário e copie o endereço da página."); } }
  return <section className="journey-action-card lia-client-forms"><header><div><h3>Formulários do cliente</h3><p>Perguntas e respostas vinculadas a {clientName}.</p></div><div className="button-row"><button className="icon-button" title="Atualizar respostas" aria-label="Atualizar respostas" type="button" onClick={() => void onRefresh()}><RefreshCw size={15}/></button>{canEdit && <button className="secondary-button" type="button" onClick={() => void open()}><Plus size={15}/> Gerar link de formulário</button>}</div></header>
    {message && <p role="status" className="lia-form-note">{message}</p>}{error && !selecting && <p role="alert" className="form-error">{error}</p>}
    {!requests.length && <p>Nenhum formulário enviado para este cliente.</p>}
    {requests.map(entry => <article className="lia-form-request" key={entry.id}><div><a href={liaFormUrl(entry.token)} target="_blank" rel="noopener noreferrer"><strong>{entry.formName}</strong><ExternalLink size={13}/></a><span className={`status-pill ${entry.submittedAt ? "positive" : "warning"}`}>{entry.submittedAt ? "Formulário respondido" : "Formulário não respondido"}</span><small>Link gerado em {stamp(entry.createdAt)}</small>{entry.submittedAt && <small>Resposta enviada em {stamp(entry.submittedAt)} (Brasília)</small>}</div><div className="button-row"><button className="secondary-button" type="button" onClick={() => void copy(liaFormUrl(entry.token))}><Copy size={14}/> Copiar link</button><a className="secondary-button" href={liaFormUrl(entry.token)} target="_blank" rel="noopener noreferrer">Abrir formulário <ExternalLink size={14}/></a>{entry.submittedAt && <a className="primary-button" href={`/lia-form-responses/${workItemId}`} target="_blank" rel="noopener noreferrer">Ver respostas <ExternalLink size={14}/></a>}</div></article>)}
    {selecting && <FormModal title="Gerar link de formulário" onClose={() => !busy && setSelecting(false)}>{generated ? <div className="lia-link-result"><CheckCircle2/><h3>Link gerado para {clientName}</h3><p>Envie este link ao cliente para preencher o formulário.</p><input aria-label="Link do formulário" value={generated} readOnly onFocus={event => event.target.select()}/><div className="button-row"><button className="primary-button" type="button" onClick={() => void copy(generated)}><Copy size={16}/> Copiar link do formulário</button><a className="secondary-button" href={generated} target="_blank" rel="noopener noreferrer">Abrir formulário <ExternalLink size={14}/></a></div>{message && <p role="status">{message}</p>}{error && <p role="alert" className="form-error">{error}</p>}</div> : <form className="lia-form-builder" onSubmit={generate}><p>Selecione o modelo que {clientName} deverá responder.</p><label>Formulário<select required disabled={busy} value={formId} onChange={event => setFormId(event.target.value)}><option value="">Selecione</option>{forms.map(form => <option key={form.id} value={form.id}>{form.name}</option>)}</select></label>{!busy && !forms.length && <p>Crie um formulário ativo nas configurações do acompanhamento LIA.</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" disabled={busy} onClick={() => setSelecting(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={busy || !formId}>{busy ? "Aguarde..." : "Gerar link"}</button></div></form>}</FormModal>}
  </section>;
}

function Brand() { return <div className="external-experience-brand"><span>D</span><strong>Dontus</strong><small>Gestão Odontológica</small></div>; }
type PublicForm = { formName: string; formDescription: string; clientName: string; questions: Question[]; submittedAt: string | null };
export function PublicLiaForm({ token }: { token: string }) {
  const [form, setForm] = useState<PublicForm | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void api<PublicForm>(`/api/public-lia-forms/${encodeURIComponent(token)}`).then(setForm).catch(caught => { setError(caught.message); setLoadError(true); }); }, [token]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!form || busy) return;
    const values = new FormData(event.currentTarget);
    const answers = Object.fromEntries(form.questions.map(q => [q.id, String(values.get(q.id) || "")]));
    setBusy(true); setError("");
    try { const result = await api<{ submittedAt: string }>(`/api/public-lia-forms/${encodeURIComponent(token)}`, { answers }); setForm({ ...form, submittedAt: result.submittedAt }); }
    catch (caught) { setError((caught as Error).message); } finally { setBusy(false); }
  }
  return <main className="external-experience-page public-survey-page lia-public-page"><Brand/>{loadError ? <section className="external-experience-card public-survey-state"><h1>Formulário indisponível</h1><p role="alert">{error}</p></section> : !form ? <section className="external-experience-card"><p>Carregando formulário...</p></section> : form.submittedAt ? <section className="external-experience-card public-survey-state"><CheckCircle2/><h1>Formulário respondido</h1><p>{form.formName}</p><p>Resposta enviada em <strong>{stamp(form.submittedAt)}</strong> (horário de Brasília).</p><p>Obrigado! Suas informações foram recebidas pela equipe LIA.</p></section> : <form className="external-experience-card" onSubmit={submit}><header><span className="external-experience-icon survey"><ClipboardList/></span><span><small>ACOMPANHAMENTO LIA</small><h1>{form.formName}</h1><p>{form.clientName}</p></span></header>{form.formDescription && <p className="lia-form-description">{form.formDescription}</p>}{form.questions.map((q, index) => <label className="public-survey-question" key={q.id}><span>{index + 1}. {q.text}</span>{q.required && <small className="public-survey-required">Resposta obrigatória</small>}{q.type === "textarea" ? <textarea name={q.id} rows={4} required={q.required} maxLength={5000}/> : q.type === "select" ? <select name={q.id} defaultValue="" required={q.required}><option value="">Selecione</option>{q.options.map(option => <option key={option}>{option}</option>)}</select> : <input type={q.type} name={q.id} required={q.required} maxLength={5000} step={q.type === "number" ? "any" : undefined}/>}</label>)}{error && <p className="form-error" role="alert">{error}</p>}<button className="public-gradient-button" disabled={busy}>{busy ? "Enviando..." : "Enviar respostas"}<ArrowRight/></button><footer><LockKeyhole/> Respostas vinculadas ao seu acompanhamento com a Dontus.</footer></form>}</main>;
}

export function LiaFormResponses({ workItemId }: { workItemId: string }) {
  const [entries, setEntries] = useState<LiaFormRequest[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void api<LiaFormRequest[]>(`/api/lia-forms/requests?workItemId=${encodeURIComponent(workItemId)}`).then(setEntries).catch(caught => setError(caught.message)); }, [workItemId]);
  return <main className="external-experience-page public-survey-page lia-public-page lia-responses-page"><Brand/><section className="external-experience-card"><header className="external-experience-header"><span className="external-experience-icon survey"><ClipboardList/></span><div><small>ACOMPANHAMENTO LIA</small><h1>Respostas dos formulários</h1><p>{entries?.[0]?.clientName || "Cliente do acompanhamento"} · Todos os formulários vinculados. Horário de Brasília.</p></div></header>{error && <p role="alert" className="form-error">{error} A consulta exige acesso autenticado à LIA.</p>}{!entries && !error && <p>Carregando respostas...</p>}{entries?.length === 0 && <p>Nenhum formulário vinculado.</p>}{entries?.map(entry => <article className="lia-response-sheet" key={entry.id}><header><h2>{entry.formName}</h2><span className={`status-pill ${entry.submittedAt ? "positive" : "warning"}`}>{entry.submittedAt ? "Respondido" : "Não respondido"}</span><p>Link gerado em {stamp(entry.createdAt)}</p>{entry.submittedAt && <p>Resposta enviada em {stamp(entry.submittedAt)}</p>}</header>{entry.submittedAt && entry.questions.map((q, index) => <div className="lia-response-answer" key={q.id}><h3>{index + 1}. {q.text}</h3><p>{entry.answers[q.id] || "Não informado"}</p></div>)}</article>)}</section></main>;
}
