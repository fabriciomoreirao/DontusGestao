"use client";
import { useId, useState } from 'react';
import { ChevronDown, History, MessageSquareText } from 'lucide-react';
import { CommentContent } from '@/app/CommentInput';
import { splitFollowupHistory, type FollowupHistoryEntry } from '@/lib/followup-insights';

const when = (value: string) => { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR') : 'Data não informada'; };
export default function FollowupHistory({ entries, composer }: { entries: FollowupHistoryEntry[]; composer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [movementLimit, setMovementLimit] = useState(5);
  const [commentLimit, setCommentLimit] = useState(10);
  const id = useId();
  const { comments, movements } = splitFollowupHistory(entries);
  return <div className="followup-history-sections">
    <section className="cs-drawer-panel followup-movements"><header><h3><History size={17}/> Histórico de movimentações <small>({movements.length})</small></h3><button type="button" className="secondary-button compact" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}>{open?'Recolher':'Abrir'}<ChevronDown size={15}/></button></header>
      <div id={id} hidden={!open}><div className="followup-movement-scroll" tabIndex={0} aria-label="Histórico de movimentações">{movements.slice(0,movementLimit).map((entry,index)=><article key={`${entry.createdAt}-${index}`}><i/><div><strong>{entry.kind || entry.type || 'Atualização'}</strong><small>{entry.actor || 'Sistema'} · {when(entry.createdAt)}</small><p><CommentContent text={entry.text}/></p></div></article>)}{!movements.length&&<p>Nenhuma movimentação registrada.</p>}</div>{movements.length>movementLimit&&<button type="button" className="secondary-button followup-see-more" onClick={()=>setMovementLimit(value=>value+5)}>Ver mais histórico ({movements.length-movementLimit})<ChevronDown size={15}/></button>}</div>
    </section>
    <section className="cs-drawer-panel followup-comments"><header><h3><MessageSquareText size={17}/> Comentários <small>({comments.length})</small></h3></header>{composer}<div className="followup-comment-scroll" tabIndex={0} aria-label="Comentários do acompanhamento"><div className="shared-comment-rows">{comments.slice(0,commentLimit).map((entry,index)=><article key={`${entry.createdAt}-${index}`}><header><strong>{entry.kind || entry.type || 'Comentário'}</strong><small>{entry.actor || 'Equipe'} · {when(entry.createdAt)}</small></header><p><CommentContent text={entry.text}/></p></article>)}</div>{!comments.length&&<p>Nenhum comentário registrado.</p>}</div>{comments.length>commentLimit&&<button type="button" className="secondary-button followup-see-more" onClick={()=>setCommentLimit(value=>value+10)}>Ver mais comentários ({comments.length-commentLimit})<ChevronDown size={15}/></button>}</section>
  </div>;
}
