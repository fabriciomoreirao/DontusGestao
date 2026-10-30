"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Database, Home, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { dontusUsersPage } from "@/lib/dontus-users";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type Link = { identification: string; externalClientId: number; version: number };
type CustomerData = { identification: string; externalClientId: number; fetchedAt: string; data: Record<string, JsonValue> };
type EnvironmentUser = { id: number; name: string; username: string; email: string; isSupervisor: boolean; active: boolean; canAccess: boolean };
type UsersResult = { identification: string; customerName: string; fetchedAt: string; users: EnvironmentUser[] };

async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/dontus-integration/${path}`, {
    method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(40000)]) : AbortSignal.timeout(40000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || "Não foi possível consultar o Ambiente Dontus.");
  return result as T;
}

const message = (error: unknown) => error instanceof Error && error.name === "TimeoutError"
  ? "A consulta demorou para responder. Tente novamente." : error instanceof Error ? error.message : "Não foi possível concluir a consulta.";
const timestamp = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const labels: Record<string, string> = {
  ID: "ID no Ambiente Dontus", Ident: "Identificação no sisteminha", RazaoSocial: "Razão social", NomeFantasia: "Nome fantasia",
  CPFCNPJ: "CPF / CNPJ", CEP: "CEP", UF: "Estado", Cidade: "Cidade", Bairro: "Bairro", Logradouro: "Logradouro",
  Numero: "Número", Complemento: "Complemento",
};
const label = (key: string) => labels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");

function FieldValue({ value }: { value: JsonValue }) {
  if (value === null || value === "") return <span className="dontus-empty-value">Não informado</span>;
  if (typeof value === "boolean") return <>{value ? "Sim" : "Não"}</>;
  if (Array.isArray(value)) return value.length ? <ol className="dontus-nested-list">{value.map((entry, index) => <li key={index}><FieldValue value={entry} /></li>)}</ol> : <span className="dontus-empty-value">Nenhum registro</span>;
  if (typeof value === "object") return <dl className="dontus-nested-data">{Object.entries(value).map(([key, entry]) => <div key={key}><dt>{label(key)}</dt><dd><FieldValue value={entry} /></dd></div>)}</dl>;
  return <>{String(value)}</>;
}

export function DontusCustomerEnvironment({ customerId, canEdit }: { customerId: string; canEdit: boolean }) {
  const [link, setLink] = useState<Link | null>(null);
  const [externalClientId, setExternalClientId] = useState("");
  const [result, setResult] = useState<CustomerData | null>(null);
  const [busy, setBusy] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const saved = await api<{ link: Link | null }>(`customers/${customerId}`, undefined, controller.signal);
        setLink(saved.link); setExternalClientId(saved.link ? String(saved.link.externalClientId) : ""); setReady(true);
        if (saved.link) setResult(await api<CustomerData>(`customers/${customerId}/data`, undefined, controller.signal));
      } catch (err) { if (!controller.signal.aborted) setError(message(err)); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    })();
    return () => controller.abort();
  }, [customerId]);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); setResult(null);
    try {
      const saved = await api<{ link: Link; result: CustomerData }>(`customers/${customerId}`, { externalClientId, version: link?.version ?? null });
      setLink(saved.link); setExternalClientId(String(saved.link.externalClientId)); setResult(saved.result); setNotice("ID do Ambiente relacionado à identificação do sisteminha e vinculado ao cliente.");
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function refresh() {
    setBusy(true); setError(""); setNotice(""); setResult(null);
    try {
      const saved = await api<{ link: Link | null }>(`customers/${customerId}`);
      setLink(saved.link); setExternalClientId(saved.link ? String(saved.link.externalClientId) : ""); setReady(true);
      if (saved.link) setResult(await api<CustomerData>(`customers/${customerId}/data`));
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  const groups = result ? [
    { title: "Cadastro e identificação", fields: Object.entries(result.data).filter(([key]) => ["ID", "Ident", "RazaoSocial", "NomeFantasia", "CPFCNPJ"].includes(key)) },
    { title: "Endereço", fields: Object.entries(result.data).filter(([key]) => ["CEP", "UF", "Cidade", "Bairro", "Logradouro", "Numero", "Complemento"].includes(key)) },
    { title: "Demais informações do ambiente", fields: Object.entries(result.data).filter(([key]) => !Object.hasOwn(labels, key)) },
  ].filter(group => group.fields.length) : [];
  return <section className="dontus-environment" aria-busy={busy}>
    <header className="dontus-integration-heading"><Database size={24} /><div><h2>Dados ambiente Dontus</h2><p>Informe o ID do cliente no Ambiente Dontus. O sistema relaciona esse ID à identificação do sisteminha e retorna os dados correspondentes.</p></div></header>
    <form className="dontus-link-form" onSubmit={save}>
      <label>ID do cliente no Ambiente Dontus<input aria-label="ID do cliente no Ambiente Dontus" inputMode="numeric" pattern="[0-9]+" required maxLength={19} value={externalClientId} disabled={busy || !canEdit || !ready} onChange={event => { setExternalClientId(event.target.value); setNotice(""); }} placeholder="Informe o ID do Ambiente Dontus" /></label>
      {canEdit && <button className="primary-button" type="submit" disabled={busy || !ready || !externalClientId.trim()}><Database size={16} />{busy ? "Consultando…" : link ? "Atualizar vínculo e consultar" : "Vincular e consultar"}</button>}
      <button className="secondary-button" type="button" onClick={() => void refresh()} disabled={busy}><RefreshCw size={16} /> Atualizar consulta</button>
    </form>
    {link && <p className="dontus-link-meta">ID do Ambiente vinculado: <strong>{link.externalClientId}</strong> · Identificação no sisteminha: <strong>{link.identification}</strong></p>}
    {error && <div className="dontus-integration-error" role="alert">{error}</div>}
    {notice && <p role="status">{notice}</p>}
    {busy && <p role="status">Consultando o Ambiente Dontus…</p>}
    {!busy && !link && !error && <div className="dontus-integration-empty">{canEdit ? "Informe o ID do Ambiente e clique em Vincular e consultar para carregar os dados." : "Este cliente ainda não possui uma identificação Dontus vinculada."}</div>}
    {result && <><p className="dontus-link-meta">Dados do ID do Ambiente <strong>{result.externalClientId}</strong> · Identificação <strong>{result.identification}</strong> · Consulta em {timestamp(result.fetchedAt)} (Brasília)</p><div className="dontus-data-groups">{groups.map(group => <section className="dontus-data-group" key={group.title}><h3>{group.title}</h3><dl>{group.fields.map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd><FieldValue value={value} /></dd></div>)}</dl></section>)}</div></>}
  </section>;
}

export function DontusSupportAccess() {
  const [identification, setIdentification] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<UsersResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<number | null>(null);
  const [error, setError] = useState("");
  async function search(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null); setPage(1);
    try { setResult(await api<UsersResult>("users", { identification })); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function open(user: EnvironmentUser) {
    if (!result) return;
    const popup = window.open("about:blank", "_blank");
    if (!popup) { setError("Permita abrir novas abas neste navegador e tente acessar novamente."); return; }
    popup.opener = null;
    popup.document.title = "Abrindo Dontus";
    popup.document.body.textContent = "Preparando acesso ao sistema Dontus…";
    setOpening(user.id); setError("");
    try {
      const login = await api<{ url: string }>("users/login", { identification: result.identification, userId: user.id });
      if (!popup.closed) popup.location.replace(login.url);
    } catch (err) { popup.close(); setError(message(err)); }
    finally { setOpening(null); }
  }
  const pagination = dontusUsersPage(result?.users ?? [], name, type, page);
  const entries = pagination.items;
  return <section className="support-access-page" aria-busy={busy}>
    <header className="dontus-integration-heading"><ShieldCheck size={26} /><div><span className="eyebrow">CENTRAL DE SUPORTE</span><h1>Acesso de Suporte</h1><p>Informe a identificação do cliente para consultar os usuários e acessar o sistema Dontus.</p></div></header>
    <div className="support-access-panel"><div className="support-access-title">Usuários do ambiente Dontus</div>
      <form className="support-access-search" onSubmit={search}>
        <label>Identificação<input value={identification} inputMode="numeric" pattern="[0-9]+" maxLength={19} required disabled={busy || opening !== null} onChange={event => { setIdentification(event.target.value); setResult(null); setError(""); }} placeholder="ID do cliente no sisteminha" autoFocus /></label>
        <label>Nome, usuário ou e-mail<input value={name} onChange={event => { setName(event.target.value); setPage(1); }} placeholder="Buscar em todos os usuários" /></label>
        <label>Tipo<select value={type} onChange={event => { setType(event.target.value); setPage(1); }}><option value="">Todos os tipos</option><option value="supervisor">Supervisor</option><option value="common">Comum</option></select></label>
        <button className="primary-button" type="submit" disabled={busy || opening !== null || !identification.trim()}><Search size={16} />{busy ? "Pesquisando…" : "Pesquisar"}</button>
      </form>
      {error && <div className="dontus-integration-error" role="alert">{error}</div>}
      {result && <p className="dontus-access-meta"><strong>{result.customerName || "Cliente Dontus"}</strong> · Identificação {result.identification} · Exibindo {pagination.start}–{pagination.end} de {pagination.total} usuário(s){pagination.total !== result.users.length ? ` · ${result.users.length} no ambiente` : ""} · {timestamp(result.fetchedAt)} (Brasília)</p>}
      <div className="support-access-table" role="table" aria-label="Usuários do sistema Dontus">
        <div className="support-access-row head" role="row"><span role="columnheader">Nome</span><span role="columnheader">Usuário</span><span role="columnheader">E-mail</span><span role="columnheader">Tipo</span><span role="columnheader">Status</span><span role="columnheader">Acessar</span></div>
        {busy ? <p className="support-access-empty" role="status">Buscando usuários no sistema Dontus…</p> : !result ? <p className="support-access-empty">Informe a identificação do cliente e clique em Pesquisar.</p> : entries.length === 0 ? <p className="support-access-empty">{result.users.length ? "Nenhum usuário corresponde aos filtros." : "Nenhum usuário encontrado para esta identificação."}</p> : entries.map(user => <div className="support-access-row" role="row" key={user.id}>
          <span role="cell"><b>{user.name || "Não informado"}</b></span><span role="cell">{user.username || "Não informado"}</span><span role="cell">{user.email || "Não informado"}</span><span role="cell">{user.isSupervisor ? "Supervisor" : "Comum"}</span><span role="cell"><b className={`status-pill ${user.active ? "positive" : "negative"}`}>{user.active ? "Ativo" : "Inativo"}</b></span>
          <span role="cell"><button className="dontus-home-access" type="button" disabled={!user.canAccess || opening !== null} title={user.canAccess ? `Acessar Dontus como ${user.name || user.username}` : "Acesso inativo ou endereço indisponível"} aria-label={`Acessar Dontus como ${user.name || user.username}`} onClick={() => void open(user)}><Home size={19} />{opening === user.id ? "Abrindo…" : "Acessar"}</button></span>
        </div>)}
      </div>
      {result && pagination.total > 0 && <nav className="dontus-users-pagination" aria-label="Páginas de usuários Dontus"><span>Página {pagination.page} de {pagination.totalPages} · 10 por página</span><div><button type="button" className="secondary-button" disabled={pagination.page === 1 || opening !== null} onClick={() => setPage(pagination.page - 1)}>Anterior</button><button type="button" className="secondary-button" disabled={pagination.page === pagination.totalPages || opening !== null} onClick={() => setPage(pagination.page + 1)}>Próxima</button></div></nav>}
    </div>
  </section>;
}
