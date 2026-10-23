"use client";

import { COPY_LINK_SELECTOR, DETAIL_HEADER_SELECTOR, normalizeDetailHeader } from "@/app/detail-header";
import { useEffect } from "react";

type RecordLink = { id: string; title: string; protocol?: string; module?: string };
const selectors = ["[data-reminder-entity-id]", ".task-card", ".task-table-row:not(.head)", ".suggestion-kanban-cards>article", ".suggestion-table tbody tr", ".commercial-lead-card", ".retention-lead-card", ".cs-client-card", ".enterprise-card", ".cancellation-card", ".marketing-card", ".service-list>article", ".development-card-shell", ".development-list-row", ".journey-card", ".goal-card", ".referral-card-shell", ".service-request-column>div>article", ".waiting-queue-row", ".direct-sales-row:not(.direct-sales-head)"];

export function cardShareUrl(module: string, id: string) {
  const url = new URL(window.location.origin);
  const current = new URL(window.location.href);
  url.searchParams.set("mod", module);
  for (const key of ["commercialFlow", "csFlow"]) {
    const value = current.searchParams.get(key);
    if (value && ((key === "csFlow" && module === "cs") || (key === "commercialFlow" && module === "commercial"))) url.searchParams.set(key, value);
  }
  url.searchParams.set("card", id);
  if (module === "tasks") url.searchParams.set("task", id);
  if (module === "ti") url.searchParams.set("subtask", id);
  return url.toString();
}

export default function CardLinkEnhancer({ module, records }: { module: string; records: RecordLink[] }) {
  const signature = JSON.stringify(records.map(({id,title,protocol,module}) => [id,title,protocol,module]));
  useEffect(() => {

    const currentRecords: RecordLink[] = (JSON.parse(signature) as Array<[string,string,string?,string?]>).map(([id,title,protocol,module]) => ({id,title,protocol,module}));
    const recordsById = new Map(currentRecords.map(record => [record.id, record]));
    const moduleRecords = currentRecords.filter(record => record.module === module || !record.module);
    let frame = 0;
    let openedId = new URLSearchParams(window.location.search).get("card");
    const remember = (event: Event) => {
      const card = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-shared-card-id]");
      if (card?.dataset.sharedCardId) openedId = card.dataset.sharedCardId;
    };
    document.addEventListener("click", remember, true);
    const enhance = () => {
      const cards = document.querySelectorAll<HTMLElement>(selectors.join(","));
      cards.forEach(card => {
        const directId = card.dataset.reminderEntityId;
        let record = directId ? recordsById.get(directId) : undefined;
        if (!record) {
          const text = card.textContent ?? "";
          const titles = new Set(Array.from(card.querySelectorAll("h2,h3,strong,b,.task-card-title"), element => element.textContent?.trim()));
          const matches = moduleRecords.filter(record => (record.protocol && text.includes(record.protocol)) || (record.title && titles.has(record.title)));
          if (matches.length === 1) record = matches[0];
        }
        if (!record) return;
        card.dataset.sharedCardId = record.id;
        card.dataset.reminderEntityId = record.id;

      });
      const opened = currentRecords.find(record => record.id === openedId && (!record.module || record.module === module));
      if (opened && module !== "tasks") document.querySelectorAll<HTMLElement>(".drawer-head,.suggestion-detail-actions,.journey-drawer>header,.goal-detail-modal .modal-head,.commission-decision-modal .modal-head,.enterprise-detail-page>header,.retention-detail-page>header").forEach(header => {
        const actionHost = header.querySelector<HTMLElement>(".customer-drawer-actions,.lead-header-actions,.development-drawer-head-actions,.task-overlay-header-actions,.suggestion-detail-actions,.marketing-drawer-head-actions") ?? header;
        if (header.querySelector(COPY_LINK_SELECTOR)) return;
        const button = document.createElement("button");
        button.type = "button"; button.className = "card-copy-link card-detail-copy";
        button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><b>Copiar link</b>';
        button.addEventListener("click", async event => {
          event.preventDefault(); event.stopPropagation();
          const label = button.querySelector("b");
          try { await navigator.clipboard.writeText(cardShareUrl(opened.module || module, opened.id)); if (label) label.textContent = "Link copiado"; }
          catch { if (label) label.textContent = "Não foi possível copiar"; }
        });
        const closeButton = actionHost.querySelector<HTMLElement>('button[aria-label="Fechar"],.icon-button');
        if (closeButton?.parentElement === actionHost) actionHost.insertBefore(button, closeButton); else actionHost.appendChild(button);
      });
      document.querySelectorAll<HTMLElement>(DETAIL_HEADER_SELECTOR).forEach(normalizeDetailHeader);
      const requested = new URLSearchParams(window.location.search).get("card");
      if (requested) {
        const card = Array.from(cards).find(card => card.dataset.sharedCardId === requested);
        if (card && !card.classList.contains("shared-card-highlight")) {
          card.classList.add("shared-card-highlight"); card.scrollIntoView({block:"center"});
        }
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; enhance(); }); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {childList:true, subtree:true});
    enhance();
    return () => { observer.disconnect(); document.removeEventListener("click", remember, true); cancelAnimationFrame(frame); document.querySelectorAll("[data-shared-card-id] .card-copy-link,.card-detail-copy").forEach(button => button.remove()); };
  }, [module, signature]);
  return null;
}
