"use client";

import { ArrowRight, Building2, CalendarDays, CheckCircle2, CircleDollarSign, Clock3, Copy, Download, ExternalLink, FileText, Filter, Link as LinkIcon, LockKeyhole, RefreshCw, ShieldCheck, UsersRound, X, XCircle } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import CommissionSignaturePad, { CommissionSignatureImage, type SignatureStroke } from "@/app/CommissionSignaturePad";
import "@/app/commission-confirmations.css";

type Confirmation = { id: string; employeeName: string; competence: string; token: string; status: string; createdAt: string; agreedAt: string | null; totalCents: number; pdfAvailable:boolean; signedByName:string; signedByEmail:string };
type ReportRow = { id: string; customerName: string; product: string; customerStatus: string; sourceStatus: string; score: number | null; usageStatus: string; saleValueCents: number; commissionCents: number; ruleLabel: string; decision: string; reason: string; decidedBy: string; decidedAt: string; kickOffAt: string; trainingAt: string; singleAlignmentAt: string; sector: string; customerCode?:string;manual?:boolean };
type PublicReport = { report: { module: string; scope: string; competence: string; employeeName: string; filters: Record<string, string>; rows: ReportRow[]; totalCents: number }; createdAt: string; agreedAt: string | null; status: string; canSign:boolean;pdfAvailable:boolean;viewerName:string;signature?:{signedByName:string;signedByEmail:string;strokes:SignatureStroke[];browser:Record<string,string|number>;evidenceHash:string}|null };
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export const confirmationDate = (value?: string | null) => {
  if (!value) return "Não informado";
  const parsed = new Date(value.length === 10 ? value + "T12:00:00-03:00" : value);
  return Number.isNaN(parsed.getTime()) ? "Não informado" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", ...(value.length === 10 ? {} : { timeStyle: "short" as const }), timeZone: "America/Sao_Paulo" }).format(parsed);
};
const month = (value: string) => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(value + "-02T12:00:00-03:00"));
const scopeName = (value: string) => ({ commercial: "Comercial", cs: "Sucesso do Cliente", lia: "LIA", referrals: "Indicações" }[value] || value);
class ConfirmationApiError extends Error { constructor(message:string,public status:number){super(message);} }
async function jsonResponse(response: Response) {
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new ConfirmationApiError(data.detail || (response.status===401?"Entre com seu usuário para acessar o documento.":"Não foi possível concluir a operação."),response.status);
  return data;
}

export function CommissionConfirmationControl({ module, scope, competence, entries, complete, canGenerate, filters, employee = "all", revision = "" }: {
  module: "commissions" | "referrals"; scope: string; competence: string; entries: { id: string; version: number }[];
  complete: boolean; canGenerate: boolean; filters: Record<string, string>; employee?: string; revision?: string;
}) {
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [loadedContext, setLoadedContext] = useState("");
  const contextKey = module + ":" + scope + ":" + competence;
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const key = entries.map(x => x.id + ":" + x.version).join(",") + revision;
  async function refresh() {
    const result = await jsonResponse(await fetch("/api/commission-confirmations?" + new URLSearchParams({ module, scope, competence }), { cache: "no-store" }));
    setConfirmations(result); setLoadedContext(contextKey); setError("");
  }
  useEffect(() => {
    let active = true;
    const update = () => { void fetch("/api/commission-confirmations?" + new URLSearchParams({ module, scope, competence }), { cache: "no-store" })
      .then(jsonResponse).then(data => { if (active) { setConfirmations(data); setLoadedContext(contextKey); setError(""); } }).catch(err => { if (active) setError(err.message); }); };
    update(); const timer = window.setInterval(update, 30000); window.addEventListener("focus", update);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", update); };
  }, [module, scope, competence, key, contextKey]);
  async function generate() {
    setBusy(true); setError("");
    try {
      await jsonResponse(await fetch("/api/commission-confirmations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ module, scope, competence, entries, filters }) }));
      await refresh(); setOpen(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao gerar o link."); }
    finally { setBusy(false); }
  }
  const visible = loadedContext === contextKey ? confirmations.filter(x => employee === "all" || x.employeeName === employee) : [];
  const agreed = visible.filter(x => x.status === "agreed").length;
  const url = (token: string) => window.location.origin + "/commission-confirmation/" + encodeURIComponent(token);
  return <div className="confirmation-control">
    {canGenerate && complete && entries.length > 0 && <button type="button" className="primary-button" disabled={busy} onClick={() => void generate()}><LinkIcon size={15}/>{busy ? "Gerando…" : "Enviar confirmação"}</button>}
    {canGenerate && !complete && <small>Aprove ou reprove todos os resultados para enviar a confirmação.</small>}
    {visible.length > 0 && <button type="button" className="secondary-button" onClick={() => setOpen(true)}>Confirmações · {agreed} concordado(s)</button>}
    {error && <p role="alert" className="confirmation-error">{error}</p>}
    {open && <div className="modal-backdrop" onMouseDown={event => event.currentTarget === event.target && setOpen(false)}><section className="modal confirmation-links" role="dialog" aria-modal="true" aria-labelledby="confirmation-links-title">
      <header className="modal-head"><div><h2 id="confirmation-links-title">Confirmações de {month(competence)}</h2><p>Um documento por responsável e competência. Acesso restrito ao responsável e à supervisão.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Fechar"><X/></button></header>
      <button className="secondary-button" onClick={() => void refresh().catch(err => setError(err.message))}><RefreshCw size={14}/>Atualizar status</button>
      {visible.map(entry => <article key={entry.id}><strong>{entry.employeeName}</strong><span>{money(entry.totalCents)} · {entry.status === "agreed" ? "Concordado" : entry.status === "invalidated" ? "Substituído por alteração" : "Aguardando concordância"}</span><small>Gerado em {confirmationDate(entry.createdAt)}{entry.agreedAt && " · Confirmado em " + confirmationDate(entry.agreedAt) + " (Brasília)"}</small>{entry.signedByName&&<small>Assinado por {entry.signedByName} · {entry.signedByEmail}</small>}
        {entry.status !== "invalidated" && <><input readOnly aria-label={"Link de " + entry.employeeName} value={typeof window === "undefined" ? "" : url(entry.token)} onFocus={event => event.target.select()}/><div className="form-actions"><a className="secondary-button" href={url(entry.token)} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Ver relatório</a>{entry.pdfAvailable&&<a className="secondary-button" href={"/api/public-commission-confirmations/"+encodeURIComponent(entry.token)+"/pdf"} download><Download size={14}/>Baixar PDF assinado</a>}<button className="primary-button" onClick={() => void navigator.clipboard.writeText(url(entry.token)).then(() => setNotice("Link copiado.")).catch(() => setNotice("Selecione e copie o link acima."))}><Copy size={14}/>Copiar link</button></div></>}
      </article>)}{notice && <p role="status">{notice}</p>}
    </section></div>}
  </div>;
}

export function PublicCommissionConfirmation({ token }: { token: string }) {
  const [data, setData] = useState<PublicReport | null>(null); const [error, setError] = useState(""); const [checked, setChecked] = useState(false); const [busy, setBusy] = useState(false);
  const [needsLogin,setNeedsLogin]=useState(false);const [signature,setSignature]=useState<SignatureStroke[]>([]);
  useEffect(() => { let active = true;
    const update=()=>{void fetch("/api/public-commission-confirmations/" + encodeURIComponent(token), { cache: "no-store" }).then(jsonResponse).then(result => { if (active) {setData(result);setNeedsLogin(false);setError("");} }).catch(err => { if (active) {setData(null);if(err instanceof ConfirmationApiError&&err.status===401)setNeedsLogin(true);else{setNeedsLogin(false);setError(err.message);} } });};
    update();window.addEventListener("focus",update);
    return () => { active = false;window.removeEventListener("focus",update); };
  }, [token]);
  async function agree() {
    setBusy(true); setError("");
    try {
      const result = await jsonResponse(await fetch("/api/public-commission-confirmations/" + encodeURIComponent(token), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agree: checked, signature, browser:{language:navigator.language,platform:navigator.platform,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,screenWidth:window.screen.width,screenHeight:window.screen.height} }) }));
      setData(current => current ? { ...current, agreedAt: result.agreedAt, status: "agreed",pdfAvailable:true } : current);
      const refreshed=await jsonResponse(await fetch("/api/public-commission-confirmations/"+encodeURIComponent(token),{cache:"no-store"}));setData(refreshed);
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao confirmar."); }
    finally { setBusy(false); }
  }
  if(needsLogin)return <PublicReportShell><CommissionDocumentLogin onAuthenticated={async()=>{setError("");try{const result=await jsonResponse(await fetch("/api/public-commission-confirmations/"+encodeURIComponent(token),{cache:"no-store"}));setData(result);setNeedsLogin(false);}catch(err){setNeedsLogin(false);setError(err instanceof Error?err.message:"Não foi possível acessar o documento.");}}}/></PublicReportShell>;
  if (!data) return <PublicReportShell><section className="external-experience-card confirmation-report-state"><span className="external-experience-icon"><FileText/></span><h1>{error ? "Relatório indisponível" : "Preparando seu relatório"}</h1><p role={error ? "alert" : "status"}>{error || "Estamos reunindo os clientes, valores e decisões desta competência."}</p>{error&&<button className="public-gradient-button" onClick={()=>setNeedsLogin(true)}>Entrar com outra conta</button>}</section></PublicReportShell>;
  const { report } = data;
  const approved = report.rows.filter(row => row.decision === "approved").length;
  return <PublicReportShell>
    <header className="external-experience-card confirmation-report-hero">
      <div className="confirmation-report-heading"><span className="external-experience-icon"><CircleDollarSign/></span><div><span className="confirmation-report-eyebrow">REMUNERAÇÃO VARIÁVEL · {scopeName(report.scope).toUpperCase()}</span><h1>Relatório de comissões</h1><p>Conferência dos clientes e valores da sua competência.</p></div><span className={`confirmation-report-badge ${data.agreedAt ? "agreed" : "pending"}`}>{data.agreedAt ? <CheckCircle2/> : <Clock3/>}{data.agreedAt ? "Concordado" : "Aguardando concordância"}</span></div>
      <div className="confirmation-report-recipient"><div><UsersRound/><span><small>Responsável</small><strong>{report.employeeName}</strong></span></div><div><CalendarDays/><span><small>Competência / período</small><strong>{month(report.competence)}</strong></span></div><span className="confirmation-report-issued">Gerado em {confirmationDate(data.createdAt)}<small>Horário de Brasília</small></span></div>
    </header>
    <section className="confirmation-report-metrics" aria-label="Resumo da competência">
      <article><span>Valor dos clientes</span><strong>{money(report.rows.reduce((total, row) => total + row.saleValueCents, 0))}</strong><small>{report.rows.length} lançamento(s) no relatório</small></article>
      <article><span>Lançamentos aprovados</span><strong>{approved.toString().padStart(2,"0")}</strong><small>Com motivo registrado</small></article>
      <article><span>Lançamentos reprovados</span><strong>{(report.rows.length-approved).toString().padStart(2,"0")}</strong><small>Sem valor a pagar</small></article>
      <article className="confirmation-report-payable"><span><CircleDollarSign/>Total a pagar</span><strong>{money(report.totalCents)}</strong><small>Conforme regras de comissionamento</small></article>
    </section>
    <section className="confirmation-report-filters"><h2><Filter/>Filtros aplicados</h2><div>{Object.entries(report.filters).map(([key, value]) => <span key={key}><small>{key}</small><strong>{value}</strong></span>)}</div></section>
    <div className="confirmation-report-section-title"><span><FileText/><h2>Detalhamento dos clientes</h2></span><small>{report.rows.length} lançamento(s)</small></div>
    {report.rows.map(row => <article className="external-experience-card confirmation-report-customer" key={row.id}>
      <header><span className="confirmation-report-client-icon"><Building2/></span><div><small>{row.product}{row.manual?" · Lançamento manual":""}{row.customerCode?" · ID "+row.customerCode:""}</small><h2>{row.customerName}</h2></div><b className={`confirmation-report-badge ${row.decision}`}>{row.decision === "approved" ? <CheckCircle2/> : <XCircle/>}{row.decision === "approved" ? "Aprovado" : "Reprovado"}</b></header>
      <dl className="confirmation-report-client-data"><div><dt>Status do cliente</dt><dd>{row.customerStatus || "Não informado"}</dd><dd className="confirmation-report-secondary">{row.sourceStatus || "Não informado"}</dd></div><div><dt>Score de utilização</dt><dd>{row.score === null ? "Não informado" : row.score + "%"}</dd><dd className="confirmation-report-secondary">{row.usageStatus || "Não informado"}</dd></div><div><dt>Valor deste cliente no relatório</dt><dd>{money(report.rows.filter(entry=>entry.customerName===row.customerName).reduce((total,entry)=>total+entry.saleValueCents,0))}</dd><dd className="confirmation-report-secondary">Base do lançamento: {money(row.saleValueCents)}</dd></div><div><dt>Kick off</dt><dd>{confirmationDate(row.kickOffAt)}</dd></div><div><dt>Treinamento</dt><dd>{confirmationDate(row.trainingAt)}</dd></div><div><dt>Alinhamento único</dt><dd>{confirmationDate(row.singleAlignmentAt)}</dd></div></dl>
      <section className="confirmation-report-calculation"><div><span><CircleDollarSign/>Regra aplicada e cálculo</span><p>{row.ruleLabel || "Sem regra configurada"}</p></div><div><small>Valor a pagar</small><strong>{money(row.commissionCents)}</strong>{row.decision === "rejected" && <small>Lançamento reprovado, sem pagamento.</small>}</div></section>
      <footer className="confirmation-report-reason"><strong>Motivo da {row.decision === "approved" ? "aprovação" : "reprovação"}</strong><p>{row.reason}</p><small>{row.decidedBy} · {confirmationDate(row.decidedAt)}</small></footer>
    </article>)}
    <section className={`external-experience-card confirmation-report-agreement ${data.agreedAt ? "is-agreed" : ""}`}>
      {data.agreedAt ? <div className="confirmation-report-success" role="status"><span><CheckCircle2/></span><div><small>CONFIRMAÇÃO REGISTRADA</small><h2>Concordado · {month(report.competence)}</h2><p>Valor confirmado: <strong>{money(report.totalCents)}</strong></p><p>Confirmado em {confirmationDate(data.agreedAt)} (horário de Brasília).</p>{data.signature?.signedByName&&<p>Assinado por {data.signature.signedByName} · {data.signature.signedByEmail}</p>}</div></div> : !data.canSign ? <div className="confirmation-supervisor-notice"><ShieldCheck/><h2>Consulta da supervisão</h2><p>Você está consultando o documento como supervisor. A assinatura deve ser realizada pelo usuário responsável: <strong>{report.employeeName}</strong>.</p></div> : <><header><span className="external-experience-icon"><ShieldCheck/></span><div><h2>Concordância do responsável</h2><p>Confira as decisões, os motivos e os cálculos antes de confirmar.</p></div></header><div className="confirmation-report-agreement-value"><span>{month(report.competence)}</span><strong>{money(report.totalCents)}</strong></div><label><input type="checkbox" checked={checked} disabled={busy} onChange={event => setChecked(event.target.checked)}/><span>Li o relatório e concordo com os valores desta competência.</span></label><p className="commission-signing-identity">Assinando como <strong>{data.viewerName}</strong></p><CommissionSignaturePad onChange={setSignature} disabled={busy}/><button className="public-gradient-button" disabled={!checked || !signature.length || busy} onClick={() => void agree()}>{busy ? "Registrando…" : "Concordar e confirmar valor"}<ArrowRight/></button><small className="confirmation-report-security"><LockKeyhole/>Sua confirmação registra sua identidade, rubrica, valor, data e hora e dados do navegador.</small></>}
      {data.agreedAt&&data.signature?.strokes&&data.signature.strokes.length>0&&<div className="commission-signed-details"><CommissionSignatureImage strokes={data.signature.strokes}/><details><summary>Dados da confirmação e do navegador</summary><dl>{Object.entries(data.signature.browser).map(([key,value])=><div key={key}><dt>{({userAgent:"Navegador",Language:"Idioma",Platform:"Plataforma",TimeZone:"Fuso horário",ScreenWidth:"Largura da tela",ScreenHeight:"Altura da tela"} as Record<string,string>)[key]||key}</dt><dd>{String(value)}</dd></div>)}<div><dt>Integridade do registro (SHA-256)</dt><dd>{data.signature.evidenceHash}</dd></div></dl></details></div>}{data.pdfAvailable&&<a className="public-gradient-button commission-download-pdf" href={"/api/public-commission-confirmations/"+encodeURIComponent(token)+"/pdf"} download><Download size={18}/>Baixar PDF assinado · {month(report.competence)}</a>}
      {error && <p role="alert" className="confirmation-error">{error}</p>}
    </section>
  </PublicReportShell>;
}

function PublicReportShell({children}:{children:ReactNode}) {
  return <main className="external-experience-page commission-public-page"><div className="external-experience-brand"><span>D</span><strong>Dontus</strong><small>Gestão Odontológica</small></div><div className="public-commission-report">{children}</div><footer className="confirmation-report-page-footer"><LockKeyhole/>Dontus · Central de Operações</footer></main>;
}

function CommissionDocumentLogin({onAuthenticated}:{onAuthenticated:()=>Promise<void>}) {
  const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");try{await jsonResponse(await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})}));setPassword("");await onAuthenticated();}catch(err){setError(err instanceof Error?err.message:"Não foi possível entrar.");}finally{setBusy(false);}}
  return <section className="external-experience-card confirmation-report-state commission-document-login"><span className="external-experience-icon"><LockKeyhole/></span><h1>Documento restrito</h1><p>Entre com seu usuário Dontus. O documento pode ser consultado pelo responsável e pela supervisão autorizada.</p><form onSubmit={event=>void submit(event)}><label>E-mail<input type="email" value={email} onChange={event=>setEmail(event.target.value)} required autoComplete="username"/></label><label>Senha<input type="password" value={password} onChange={event=>setPassword(event.target.value)} required autoComplete="current-password"/></label>{error&&<p role="alert" className="confirmation-error">{error}</p>}<button className="public-gradient-button" disabled={busy}>{busy?"Entrando…":"Entrar e acessar documento"}<ArrowRight/></button></form></section>;
}
