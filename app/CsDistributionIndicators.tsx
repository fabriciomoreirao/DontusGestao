"use client";

import { BarChart3, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { currentDistributionRows, unknownClientVersion, type ClientDistribution, type PortfolioPhase } from "@/lib/client-distribution";

const phases = { all: "Onboarding, Acompanhamento e Conferência", onboarding: "Onboarding", tracking: "Acompanhamento", conference: "Conferência" };

export default function CsDistributionIndicators({ board, onClose }: { board: ClientDistribution; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<PortfolioPhase | "all">("all");
  const rows = currentDistributionRows(board, phase);
  const allRows = currentDistributionRows(board);
  const versions = [...new Set([...board.queues.map(queue => queue.version), ...allRows.flatMap(row => Object.keys(row.clientsByVersion))])]
    .filter(version => version !== unknownClientVersion || allRows.some(row => row.clientsByVersion[version] > 0));
  const total = rows.reduce((sum, row) => sum + row.totalClients, 0);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return <dialog ref={dialog} className="modal cs-distribution-indicators" aria-labelledby="cs-distribution-indicators-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="modal-head">
      <div><span className="eyebrow">RODÍZIO · {board.track === "activation" ? "ATIVAÇÃO" : "RETENÇÃO"}</span><h2 id="cs-distribution-indicators-title"><BarChart3 size={22} />Indicadores de rodízio</h2><p>Quantidade atual de clientes por colaborador e versão.</p></div>
      <button type="button" className="icon-button" aria-label="Fechar indicadores de rodízio" onClick={onClose}><X size={19} /></button>
    </header>
    <div className="cs-distribution-indicators-body">
      <div className="cs-distribution-indicators-toolbar"><label>Etapas consideradas<select aria-label="Etapa dos indicadores de rodízio" value={phase} onChange={event => setPhase(event.target.value as PortfolioPhase | "all")}>{Object.entries(phases).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><span>Atualizado às {new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(board.updatedAt))}</span></div>
      <div className="cs-distribution-table-scroll cs-distribution-current-table"><table>
        <caption>Clientes atuais · {phases[phase]}</caption>
        <thead><tr><th scope="col">Colaborador</th>{versions.map(version => <th scope="col" key={version}>{version}</th>)}<th scope="col">Total atual</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.userId}><th scope="row"><span className="cs-distribution-person">{row.photoDataUrl ? <img src={row.photoDataUrl} alt="" /> : <i>{row.displayName.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</i>}<span><strong>{row.displayName}</strong><small>{row.department}</small></span></span></th>{versions.map(version => <td key={version}>{row.clientsByVersion[version] ?? 0}</td>)}<td className="cs-distribution-current-total">{row.totalClients}</td></tr>)}</tbody>
        <tfoot><tr><th scope="row">Total de clientes</th>{versions.map(version => <td key={version}>{rows.reduce((sum, row) => sum + (row.clientsByVersion[version] ?? 0), 0)}</td>)}<td className="cs-distribution-current-total">{total}</td></tr></tfoot>
      </table></div>
      {!rows.length && <p className="cs-distribution-empty">Nenhum colaborador habilitado para esta funcionalidade.</p>}
      <p className="cs-distribution-indicators-note">Contagem pela versão e pelo responsável atuais, nas etapas selecionadas. Cada cliente é contado uma vez. Validação, finalizados e cancelados ficam fora desta consulta.</p>
    </div>
  </dialog>;
}
