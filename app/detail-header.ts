export const COPY_LINK_SELECTOR = ".copy-task-link,.card-copy-link,.commercial-copy-link";
export const DETAIL_HEADER_SELECTOR = ".modal>.modal-head,.standard-modal>.modal-head,.modal-shell>header,.task-modal>header,.marketing-drawer>header,.development-drawer>header,.drawer-head,.suggestion-side-panel>.modal-header,.journey-drawer>header,.goal-detail-modal .modal-head,.commission-decision-modal .modal-head,.enterprise-detail-shell>.drawer-head,.retention-detail-page>header,.referral-drawer>header,.cancellation-drawer>header,.cs-drawer>header";
const ACTION_HOST_SELECTOR = ".customer-drawer-actions,.lead-header-actions,.development-drawer-head-actions,.task-overlay-header-actions,.suggestion-detail-actions,.marketing-drawer-head-actions,.button-row,.detail-header-actions";
const INJECTED_ACTIONS = ".card-copy-link,.reminder-detail-action,.agenda-detail-action,.client-alert-detail-action,.client-checklist-detail-action,.client-record-detail-action,.reminder-history-detail-action";

export function normalizeDetailHeader(header: HTMLElement) {
  // Preserve React-owned controls; only collect the actions added by enhancers.
  const copies = Array.from(header.querySelectorAll<HTMLElement>(COPY_LINK_SELECTOR));
  const nativeCopy = copies.find(button => !button.matches(".card-copy-link"));
  const keep = nativeCopy ?? copies[0];
  copies.forEach(button => { if (button !== keep && button.matches(".card-copy-link")) button.remove(); });
  header.classList.add("detail-header-normalized");
  let host = header.querySelector<HTMLElement>(ACTION_HOST_SELECTOR);
  const directActions = Array.from(header.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.matches(INJECTED_ACTIONS));
  if (!host && directActions.length) {
    host = document.createElement("div");
    host.className = "detail-header-actions";
    header.appendChild(host);
  }
  if (host) {
    host.classList.add("detail-header-actions");
    directActions.forEach(button => host!.appendChild(button));
  }
}
