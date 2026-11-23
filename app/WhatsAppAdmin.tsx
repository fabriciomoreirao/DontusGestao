"use client";
import { useCallback, useEffect, useState } from "react";
import { waApi, type WaState } from "@/lib/whatsapp-admin";
import WhatsAppTemplates from "./WhatsAppTemplates";
import WhatsAppConnections from "./WhatsAppConnections";
import WhatsAppCampaigns from "./WhatsAppCampaigns";
export default function WhatsAppAdmin({ section, operate, busy }: { section: string; operate: (payload: Record<string, unknown>, success: string) => Promise<{ id?: string } | false>; busy: boolean }) {
  const [state, setState] = useState<WaState | null>(null); const [error, setError] = useState("");
  const reload = useCallback(async () => { const next = await waApi<WaState>("state"); setState(next); setError(""); }, []);
  useEffect(() => { const controller = new AbortController(); void waApi<WaState>("state", undefined, controller.signal).then(setState).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, []);
  useEffect(() => { const update = () => { if (document.visibilityState === "visible") void reload().catch(e => setError(e.message)); }; window.addEventListener("dontus:whatsapp-refresh", update); const timer = window.setInterval(update, 30000); return () => { window.removeEventListener("dontus:whatsapp-refresh", update); clearInterval(timer); }; }, [reload]);
  if (!state) return <section className="wa-admin wa-card wa-empty" role="status">{error || "Carregando configurações do WhatsApp..."}{error && <button onClick={() => void reload().catch(e => setError(e.message))}>Tentar novamente</button>}</section>;
  return <>{error && <p className="wa-error" role="alert">{error}</p>}{section === "whatsappTemplates" ? <WhatsAppTemplates state={state} reload={reload}/> : section === "whatsappConnection" ? <WhatsAppConnections state={state} reload={reload} operate={operate} busy={busy}/> : <WhatsAppCampaigns state={state} reload={reload}/>}</>;
}
