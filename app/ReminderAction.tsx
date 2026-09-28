"use client";

import { BellRing } from "lucide-react";
import { useEffect, useRef } from "react";

export type ReminderContext = {
  module: string;
  entityId?: string;
  clientId?: string;
  customerName?: string;
  title?: string;
  summary?: string;
  recipientName?: string;
  recipientEmail?: string;
};

export const REMINDER_COMPOSER_EVENT = "dontus:create-reminder";

export function openReminderComposer(context: ReminderContext) {
  window.dispatchEvent(new CustomEvent<ReminderContext>(REMINDER_COMPOSER_EVENT, { detail: context }));
}

export default function ReminderAction({ context, compact = true, className = "" }: { context: ReminderContext; compact?: boolean; className?: string }) {
  return <button
    type="button"
    className={`reminder-action-button ${compact ? "compact" : ""} ${className}`.trim()}
    title="Adicionar lembrete"
    aria-label={`Adicionar lembrete para ${context.title || "este registro"}`}
    onClick={(event) => { event.preventDefault(); event.stopPropagation(); openReminderComposer(context); }}
  ><BellRing size={14}/>{!compact && <span>Adicionar lembrete</span>}</button>;
}

const CARD_SELECTORS = [
  ".task-card", ".task-table-row:not(.head)", ".suggestion-kanban-cards > article", ".commercial-lead-card", ".retention-lead-card",
  ".cs-client-card", ".enterprise-card", ".cancellation-card", ".marketing-card",
  ".development-card-shell", ".journey-card", ".hr-employee-card", ".recruitment-candidate",
  "article.commission-row", ".goal-card", ".referral-card-shell",
];
const ENABLED_MODULES = new Set(["internalChat","tasks","suggestions","commercial","cs","cancellations","marketing","ti","lia","hr","admin","commissions","goals","referrals"]);
const DETAIL_SURFACES = ".task-modal,.suggestion-detail-modal,.drawer-backdrop>aside,.goal-detail-modal,.retention-detail-page,.enterprise-detail-page";

function cardContext(candidate: HTMLElement, module: string): ReminderContext {
  const title = candidate.querySelector<HTMLElement>("h2,h3,.task-card-title,:scope>span:first-child>b,.retention-card-company,strong")?.innerText?.trim() || "Registro do sistema";
  const summary = candidate.querySelector<HTMLElement>("p,.task-card-description")?.innerText?.trim() || "";
  const visibleText = candidate.innerText.replace(/\s+/g, " ").trim();
  const clientId = candidate.dataset.reminderClientId
    || visibleText.match(/\bID(?:\s+DONTUS)?\s*[#:]?\s*([A-Z0-9.-]{3,})/i)?.[1]
    || visibleText.match(/(?:^|\s)#(\d{4,})(?:\s|$)/)?.[1];
  const customerName = candidate.dataset.reminderCustomerName
    || candidate.querySelector<HTMLElement>(".task-card-customer b,.retention-card-company,.cancellation-card h3,.journey-card h3,.cs-client-card h3")?.innerText?.trim()
    || title;
  return { module, entityId: candidate.dataset.reminderEntityId, clientId, customerName, title, summary };
}

function isManagementAction(target: HTMLElement) {
  const control = target.closest<HTMLElement>("button,a");
  if (!control) return false;
  const label = `${control.getAttribute("aria-label") ?? ""} ${control.getAttribute("title") ?? ""} ${control.innerText ?? ""}`;
  return /editar|excluir|encaminhar|copiar|aprovar|reprovar|reativar/i.test(label) || Boolean(control.closest(".task-card-actions,.commercial-card-actions,.cancellation-card-controls,.marketing-card-actions,.goal-card-actions,.referral-card-actions,.commission-actions"));
}

/** Leva o contexto do card para o painel de detalhes, sem poluir visualmente o próprio card. */
type ReminderSourceRecord = { id:string; description:string; created_at:string; updated_at:string };
type LinkedReminder = { title?:string; urgency?:string; recipientName?:string; remindAt?:string; seenAt?:string; sourceModule?:string; sourceEntityId?:string; sourceClientId?:string; sourceTitle?:string };
const normalized=(value?:string)=>String(value??"").trim().toLocaleLowerCase("pt-BR");
function reminderDetail(record:ReminderSourceRecord):LinkedReminder|null { try { const detail=JSON.parse(record.description) as LinkedReminder & {kind?:string}; return detail.kind==="systemReminder"?detail:null; } catch { return null; } }
function updateLinkedHistory(surface:HTMLElement, records:ReminderSourceRecord[]){
  const entityId=surface.dataset.reminderSourceEntityId;
  const clientId=surface.dataset.reminderSourceClientId;
  const sourceTitle=surface.dataset.reminderSourceTitle;
  const module=surface.dataset.reminderSourceModule;
  const linked=records.map(record=>({record,detail:reminderDetail(record)})).filter((entry):entry is {record:ReminderSourceRecord;detail:LinkedReminder}=>Boolean(entry.detail)).filter(({detail})=>
    (entityId&&detail.sourceEntityId===entityId)
    || (clientId&&normalized(detail.sourceClientId)===normalized(clientId)&&detail.sourceModule===module)
    || (sourceTitle&&normalized(detail.sourceTitle)===normalized(sourceTitle)&&detail.sourceModule===module)
  ).sort((a,b)=>new Date(b.detail.remindAt??b.record.created_at).getTime()-new Date(a.detail.remindAt??a.record.created_at).getTime());
  surface.querySelector(".reminder-linked-history")?.remove();
  surface.querySelector(".reminder-linked-open")?.remove();
  if(!linked.length)return;
  const panel=document.createElement("section");panel.className="reminder-linked-history";
  const heading=document.createElement("header");const label=document.createElement("strong");label.textContent=`Lembretes vinculados (${linked.length})`;heading.appendChild(label);panel.appendChild(heading);
  linked.forEach(({detail})=>{const article=document.createElement("article");const copy=document.createElement("span");const title=document.createElement("b");const meta=document.createElement("small");const state=document.createElement("em");title.textContent=detail.title||"Lembrete";meta.textContent=`${detail.urgency||"Aviso"} · ${detail.recipientName||"Sem responsável"} · ${detail.remindAt?new Date(detail.remindAt).toLocaleString("pt-BR"):"Sem data"}`;state.textContent=detail.seenAt?"Visto":"Aberto";copy.append(title,meta);article.append(copy,state);panel.appendChild(article)});
  const host=surface.querySelector<HTMLElement>(".task-history,.retention-history-list,.lead-comments-history,.lead-follow-history,.enterprise-timeline,.cs-history,.journey-comments,.hr-timeline,.referral-comments>section,.marketing-comments,.development-history,.detail-section:last-of-type") || surface.querySelector<HTMLElement>(".task-modal-body,.drawer-body,main,aside") || surface;
  host.appendChild(panel);
  const openButton=document.createElement("button");openButton.type="button";openButton.className="reminder-linked-open";openButton.title="Ver lembretes vinculados";openButton.setAttribute("aria-label",`Ver ${linked.length} lembrete(s) vinculado(s)`);openButton.innerHTML=`<span aria-hidden="true">☷</span><b>${linked.length}</b>`;openButton.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();panel.scrollIntoView({behavior:"smooth",block:"center"});panel.classList.add("highlight");window.setTimeout(()=>panel.classList.remove("highlight"),1400)});
  const header=surface.querySelector<HTMLElement>(".drawer-head,.modal-head,.modal-header,header");
  const reminderButton=header?.querySelector<HTMLElement>(".reminder-detail-action,.reminder-action-button");
  if(reminderButton)reminderButton.insertAdjacentElement("afterend",openButton);else header?.appendChild(openButton);
}

export function ReminderCardEnhancer({ module, reminders = [] }: { module: string; reminders?: ReminderSourceRecord[] }) {
  const remindersRef=useRef(reminders);remindersRef.current=reminders;
  useEffect(() => {
    if (!ENABLED_MODULES.has(module)) return;
    const root = document.querySelector(".content");
    if (!root) return;
    let pendingContext: ReminderContext | null = null;
    const rememberCard = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target || isManagementAction(target)) return;
      const candidate = target.closest<HTMLElement>(CARD_SELECTORS.join(","));
      if (candidate && root.contains(candidate)) pendingContext = cardContext(candidate, module);
    };
    const enhance = () => {
      if (module === "internalChat") root.querySelectorAll<HTMLElement>(".internal-chat-conversation-head").forEach((header) => {
        if (header.dataset.reminderEnhanced === "true") return;
        header.dataset.reminderEnhanced = "true";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "reminder-detail-action conversation";
        button.title = "Lembrar de enviar uma mensagem";
        button.setAttribute("aria-label", button.title);
        button.innerHTML = `<span aria-hidden="true">◷</span><b>Lembrar</b>`;
        button.addEventListener("click", (event) => {
          event.preventDefault(); event.stopPropagation();
          const title = header.querySelector<HTMLElement>("h2,h3,strong")?.innerText?.trim() || "Conversa interna";
          openReminderComposer({ module, title: `Enviar mensagem: ${title}` });
        });
        header.appendChild(button);
      });
      if (!pendingContext) return;
      const surfaces = Array.from(document.querySelectorAll<HTMLElement>(DETAIL_SURFACES)).filter(surface => !surface.dataset.reminderEnhanced && !surface.closest(".reminder-modal-backdrop"));
      const surface = surfaces.at(-1);
      if (!surface) return;
      const header = surface.querySelector<HTMLElement>(".drawer-head,.modal-head,.modal-header,header");
      if (!header) return;
      const context = pendingContext;
      pendingContext = null;
      surface.dataset.reminderEnhanced = "true";
      surface.dataset.reminderSourceModule=context.module;
      if(context.entityId)surface.dataset.reminderSourceEntityId=context.entityId;
      if(context.clientId)surface.dataset.reminderSourceClientId=context.clientId;
      if(context.customerName)surface.dataset.reminderSourceCustomerName=context.customerName;
      if(context.title)surface.dataset.reminderSourceTitle=context.title;
      const existingButton = header.querySelector<HTMLElement>(".reminder-action-button,.reminder-detail-action");
      if (existingButton) {
        updateLinkedHistory(surface,remindersRef.current);
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reminder-detail-action";
      button.title = "Adicionar lembrete";
      button.setAttribute("aria-label", `Adicionar lembrete para ${context.title || "este registro"}`);
      button.innerHTML = `<span aria-hidden="true">◷</span><b>Adicionar lembrete</b>`;
      button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); openReminderComposer(context); });
      if (surface.matches(".cancellation-drawer")) button.classList.add("centered");
      const actionHost = header.querySelector<HTMLElement>(".lead-header-actions,.development-drawer-head-actions,.task-overlay-header-actions,.suggestion-detail-actions")
        || (surface.matches(".retention-detail-page") ? header.lastElementChild as HTMLElement : header);
      const copyLink = actionHost?.querySelector<HTMLElement>(".copy-task-link");
      const closeButton = actionHost.querySelector<HTMLElement>('button[aria-label="Fechar"]');
      if (copyLink) copyLink.insertAdjacentElement("afterend", button);
      else if (closeButton?.parentElement === actionHost) actionHost.insertBefore(button, closeButton);
      else actionHost.appendChild(button);
      updateLinkedHistory(surface,remindersRef.current);
    };
    root.addEventListener("click", rememberCard, true);
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); root.removeEventListener("click", rememberCard, true); document.querySelectorAll(".reminder-detail-action,.reminder-linked-open").forEach(entry => entry.remove()); document.querySelectorAll<HTMLElement>("[data-reminder-enhanced]").forEach(entry => delete entry.dataset.reminderEnhanced); };
  }, [module]);
  useEffect(()=>{document.querySelectorAll<HTMLElement>(DETAIL_SURFACES).forEach(surface=>{if(surface.dataset.reminderSourceModule)updateLinkedHistory(surface,reminders)})},[reminders]);
  return null;
}
