"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, Wifi } from "lucide-react";
import { loadFacebookSdk, type ChatModuleData } from "./ChatModule";
import WhatsAppDialog from "./WhatsAppDialog";
import { waApi, type WaState } from "@/lib/whatsapp-admin";
type Operate = (payload: Record<string, unknown>, success: string) => Promise<{ id?: string } | false>;
export default function WhatsAppConnections({ state, reload, operate, busy }: { state: WaState; reload: () => Promise<void>; operate: Operate; busy: boolean }) {
  const [open, setOpen] = useState(false); const [selected, setSelected] = useState("");
  return <div className="wa-admin"><div className="wa-page-head"><h1>Conexão WhatsApp</h1><button className="wa-primary" onClick={() => { setSelected(""); setOpen(true); }}><Plus size={17}/> Adicionar conexão</button></div>
    {!state.suiteConfigured && <p className="wa-info">A integração com o Suíte aguarda a configuração dos endereços e credenciais WABA no servidor.</p>}
    <div className="wa-connections">{state.module.whatsAppNumbers.map(n => { const suite = state.numbers.find(x => x.id === n.id); const connected = n.active && n.hasAccessToken && n.status === "Configurado" && suite?.suiteStatus === "Vinculado"; return <button className="wa-connection" key={n.id} onClick={() => { setSelected(n.id); setOpen(true); }}><span className="wa-connection-avatar"><Wifi size={26}/></span><strong>{n.internalName}</strong><span>{n.phoneNumber}</span><span className={`wa-badge ${connected ? "ok" : "bad"}`}>{connected ? "Conectado" : "Desconectado"}</span><small>{n.coexistenceError || (n.hasAccessToken ? `Suíte: ${suite?.suiteStatus || "Não vinculado"}` : "Aguardando conexão com a Meta")}</small></button>; })}</div>
    {!state.module.whatsAppNumbers.length && <section className="wa-card wa-empty">Nenhuma conexão cadastrada. Adicione uma conexão para começar.</section>}
    {open && <ConnectionModal state={state} initialId={selected} reload={reload} operate={operate} externalBusy={busy} onClose={() => setOpen(false)}/>}
  </div>;
}

function ConnectionModal({ state, initialId, reload, operate, externalBusy, onClose }: { state: WaState; initialId: string; reload: () => Promise<void>; operate: Operate; externalBusy: boolean; onClose: () => void }) {
  const [id, setId] = useState(initialId); const [prepared, setPrepared] = useState<ChatModuleData["whatsAppNumbers"][number] | null>(null);
  const item = prepared || state.module.whatsAppNumbers.find(n => n.id === id); const savedSuite = state.numbers.find(n => n.id === id);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false); const [sdkApp, setSdkApp] = useState("");
  const sdkReady = !!item?.metaAppId && sdkApp === `${item.metaAppId}:${item.apiVersion}`;
  const [clinicId, setClinicId] = useState(savedSuite?.suiteClinicId || ""); const [dontusId, setDontusId] = useState(savedSuite?.suiteDontusId || ""); const [base, setBase] = useState(savedSuite?.suiteBase || "https://sistema.dontus.com.br");
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { cancelRef.current?.(); }, []);
  useEffect(() => { let active = true; if (item?.metaAppId) void loadFacebookSdk(item.metaAppId, item.apiVersion).then(() => { if (active) setSdkApp(`${item.metaAppId}:${item.apiVersion}`); }).catch(e => { if (active) setError((e as Error).message); }); return () => { active = false; }; }, [item?.metaAppId, item?.apiVersion]);
  const channels = state.module.channels.filter(c => c.type === "WhatsApp" && c.active);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true); const f = new FormData(event.currentTarget);
    try {
      let channel = channels.find(c => c.id === f.get("channelId"));
      if (!channel) {
        const departmentId = String(f.get("departmentId")); const queue = state.module.queues.find(q => q.active && q.departmentId === departmentId);
        if (!queue) throw new Error("Cadastre uma fila ativa para o setor antes de conectar.");
        const result = await operate({ action: "saveChatChannel", name: f.get("internalName"), type: "WhatsApp", departmentId, defaultQueueId: queue.id, defaultAssigneeUserId: f.get("assigneeId") || null, active: true, aiEnabled: false, allowTransfer: true, autoCreateTask: false, greetingMessage: "", awayMessage: "", sendClosingMessage: false, closingMessage: "" }, "Canal WhatsApp criado.");
        if (!result || !result.id) throw new Error("Não foi possível criar o canal.");
        channel = { id: result.id, departmentId } as typeof channels[number];
      }
      const payload = { action: "saveChatWhatsAppNumber", id: item?.id, channelId: channel.id, departmentId: channel.departmentId, internalName: String(f.get("internalName")), displayName: String(f.get("internalName")), phoneNumber: String(f.get("phoneNumber")), phoneNumberId: item?.phoneNumberId || "", wabaId: item?.wabaId || "", businessManagerId: item?.businessManagerId || "", connectionMode: "Coexistence", metaAppId: String(f.get("metaAppId")), embeddedSignupConfigId: String(f.get("configId")), accessToken: "", verifyToken: String(f.get("verifyToken") || ""), appSecret: String(f.get("appSecret") || ""), apiVersion: item?.apiVersion || "v23.0", active: true };
      const result = await operate(payload, "Configuração da conexão salva.");
      if (!result || !result.id) throw new Error("Revise os campos da conexão.");
      setId(result.id); setPrepared({ ...item, ...payload, id: result.id, hasAppSecret: !!payload.appSecret || item?.hasAppSecret, hasVerifyToken: !!payload.verifyToken || item?.hasVerifyToken } as typeof prepared);
      await reload(); setNotice("Configuração salva. Clique em Iniciar processo para entrar no Facebook e vincular o Suíte.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function register(numberId: string) { await waApi("suite", { numberId, clinicId, dontusId, base }); await reload(); setNotice("Conexão oficial vinculada ao módulo WhatsApp e ao Suíte."); }
  function start() {
    if (!item) return;
    if (!clinicId || !dontusId || !base.startsWith("https://")) { setError("Informe ID da clínica, ID Dontus e base HTTPS para vincular o Suíte."); return; }
    if (!state.suiteConfigured) { setError("Configure as credenciais WABA do Suíte no servidor antes de iniciar."); return; }
    setBusy(true); setError(""); setNotice("");
    if (item.hasAccessToken && item.status === "Configurado") { void register(item.id).catch(e => setError((e as Error).message)).finally(() => setBusy(false)); return; }
    if (!window.FB || !sdkReady) { setBusy(false); setError("Aguarde o carregamento do Facebook e tente novamente."); return; }
    let code = ""; let wabaId = ""; let completed = false; let cancelled = false;
    const cleanup = () => { window.removeEventListener("message", listener); window.clearTimeout(timer); cancelRef.current = null; };
    const complete = async () => { if (!code || !wabaId || completed || cancelled) return; completed = true; cleanup(); try { const result = await operate({ action: "completeChatWhatsAppCoexistence", id: item.id, authorizationCode: code, wabaId }, "Número conectado à Meta."); if (!result) throw new Error("A Meta não concluiu a conexão. Revise o cadastro e tente novamente."); await register(item.id); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
    const listener = (event: MessageEvent) => { if (!new Set(["https://www.facebook.com", "https://web.facebook.com", "https://business.facebook.com"]).has(event.origin)) return; let data = event.data; if (typeof data === "string") { try { data = JSON.parse(data); } catch { return; } } if (data?.type !== "WA_EMBEDDED_SIGNUP") return; if (data.event?.startsWith("FINISH")) { wabaId = data.data?.waba_id || ""; void complete(); } else if (data.event === "CANCEL" || data.event === "ERROR") { cancelled = true; cleanup(); setBusy(false); setError(data.error_message || "Processo cancelado no Facebook. Você pode iniciar novamente."); } };
    const timer = window.setTimeout(() => { cancelled = true; cleanup(); setBusy(false); setError("O processo expirou. Inicie novamente para conectar."); }, 180000);
    cancelRef.current = () => { cancelled = true; cleanup(); };
    window.addEventListener("message", listener);
    window.FB.login(response => { if (cancelled) return; code = response.authResponse?.code || ""; if (!code) { cancelled = true; cleanup(); setBusy(false); setError("O Facebook não autorizou a conexão."); return; } void complete(); }, { config_id: item.embeddedSignupConfigId, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" } });
  }
  return <WhatsAppDialog title="Criar Nova Conexão WhatsApp" onClose={onClose}><div className="wa-connection-main"><label>Tipo de WhatsApp:<select disabled><option>WhatsApp Oficial</option></select></label><label>Módulo:<select disabled><option>WhatsApp</option></select></label></div>
    <label className="wa-full-label">Conexão<select value={id} disabled={busy} onChange={e => { setId(e.target.value); setPrepared(null); const s = state.numbers.find(n => n.id === e.target.value); setClinicId(s?.suiteClinicId || ""); setDontusId(s?.suiteDontusId || ""); setBase(s?.suiteBase || "https://sistema.dontus.com.br"); }}><option value="">Nova conexão</option>{state.module.whatsAppNumbers.map(n => <option key={n.id} value={n.id}>{n.internalName} · {n.phoneNumber}</option>)}</select></label>
    <details open={!item}><summary>Configuração da conexão oficial</summary><form key={id} className="wa-form-grid" onSubmit={save}><label>Nome da conexão *<input required name="internalName" defaultValue={item?.internalName}/></label><label>Número com DDI *<input required name="phoneNumber" defaultValue={item?.phoneNumber} placeholder="5511999999999"/></label><label>Canal<select name="channelId" defaultValue={item?.channelId || ""}><option value="">Criar canal WhatsApp</option>{channels.map(c => <option key={c.id} value={c.id}>{c.name} · {c.departmentName}</option>)}</select></label><label>Setor para novo canal<select name="departmentId" defaultValue={item?.departmentId || state.module.departments[0]?.id}>{state.module.departments.filter(d => d.active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>Responsável padrão do novo canal<select name="assigneeId"><option value="">Fila compartilhada</option>{state.module.users.filter(u => u.active).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>App ID da Meta *<input required name="metaAppId" defaultValue={item?.metaAppId}/></label><label>Configuration ID do Embedded Signup v4 *<input required name="configId" defaultValue={item?.embeddedSignupConfigId}/></label><label>Token de verificação do webhook<input name="verifyToken" type="password" autoComplete="new-password" required={!item?.hasVerifyToken} placeholder={item?.hasVerifyToken ? "Configurado; deixe em branco para manter" : "Token de verificação"}/></label><label>App Secret<input name="appSecret" type="password" autoComplete="new-password" required={!item?.hasAppSecret} placeholder={item?.hasAppSecret ? "Configurado; deixe em branco para manter" : "App Secret da Meta"}/></label><div className="wa-form-wide"><small>Webhook: /api/integrations/whatsapp/webhook. Utilize uma configuração v4 publicada e autorize o domínio desta aplicação no Facebook.</small></div><button className="wa-form-wide" disabled={busy || externalBusy} type="submit">Salvar configuração</button></form></details>
    <div className="wa-form-grid wa-suite-fields"><label>ID da clínica no Suíte *<input required value={clinicId} onChange={e => setClinicId(e.target.value)} inputMode="numeric"/></label><label>ID Dontus *<input required value={dontusId} onChange={e => setDontusId(e.target.value)}/></label><label className="wa-form-wide">Base do Suíte *<input type="url" required value={base} onChange={e => setBase(e.target.value)}/></label></div>
    {error && <p className="wa-error" role="alert">{error}</p>}{notice && <p className="wa-info" role="status">{notice}</p>}<div className="wa-actions"><button onClick={onClose}>Fechar</button><button className="wa-green" disabled={busy || externalBusy || !item || (!sdkReady && !(item.hasAccessToken && item.status === "Configurado"))} onClick={start}>{busy ? "Conectando..." : "Iniciar processo"}</button></div>
  </WhatsAppDialog>;
}
