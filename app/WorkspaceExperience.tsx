"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronRight, Clock3, Command, Home, Maximize2, Minimize2, Search, Star, X } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { matchWorkspaceDestinations, readNavigationPreferences } from "@/lib/workspace-navigation";

export type WorkspaceDestination = { key: string; label: string; group: string; description: string; icon: ComponentType<{ size?: number }> };

export default function WorkspaceExperience({ children, destinations, currentKey, currentTitle, userEmail, onNavigate, onSearchRecords, lastUpdatedAt, syncing, syncError }: {
  children: ReactNode;
  destinations: WorkspaceDestination[]; currentKey: string; currentTitle: string; userEmail: string;
  onNavigate: (key: string) => void; onSearchRecords: (query: string) => void;
  lastUpdatedAt: number | null; syncing: boolean; syncError: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [focusMode, setFocusMode] = useState(false);
  const [history, setHistory] = useState({ back: false, forward: false });
  const [shortcut, setShortcut] = useState("Ctrl K");
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const hydratedUser = useRef("");
  const storageKey = `dontus:navigation:${userEmail}`;
  const current = destinations.find(item => item.key === currentKey);
  const matched = matchWorkspaceDestinations(destinations, query);
  const ordered = query.trim() ? matched : [...matched].sort((a, b) => {
    const rank = (key: string) => favorites.includes(key) ? -100 + favorites.indexOf(key) : recent.includes(key) ? -50 + recent.indexOf(key) : 0;
    return rank(a.key) - rank(b.key);
  });
  const visible = ordered.slice(0, 40);
  const selectedIndex = Math.min(selected, Math.max(0, visible.length - 1));

  useEffect(() => {
    let preference = { favorites: [] as string[], recent: [] as string[] };
    try { preference = readNavigationPreferences(localStorage.getItem(storageKey)); } catch { /* optional browser storage */ }
    setFavorites(preference.favorites); setRecent(preference.recent); hydratedUser.current = userEmail;
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K");
  }, [storageKey, userEmail]);

  useEffect(() => {
    if (hydratedUser.current !== userEmail) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ favorites, recent })); } catch { /* navigation remains usable */ }
  }, [favorites, recent, storageKey, userEmail]);

  useEffect(() => {
    if (!currentKey) return;
    setRecent(previous => [currentKey, ...previous.filter(key => key !== currentKey)].slice(0, 6));
  }, [currentKey]);

  useEffect(() => {
    const previous = document.title;
    document.title = `${currentTitle} · Dontus`;
    return () => { document.title = previous; };
  }, [currentTitle]);

  useEffect(() => {
    const sync = () => {
      const index = Number(window.history.state?.dontusIndex ?? 0);
      let highest = index;
      try { highest = Number(sessionStorage.getItem("dontus:navigation-highest") ?? index); } catch { /* optional history metadata */ }
      setHistory({ back: index > 0, forward: index < highest });
    };
    sync(); window.addEventListener("popstate", sync); window.addEventListener("dontus:navigate", sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener("dontus:navigate", sync); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    input.current?.focus();
    return () => { if (element?.open) element.close(); };
  }, [open]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        // Preserve an unfinished form when another modal owns focus.
        if (document.querySelector('dialog[open]:not(.workspace-command),[aria-modal="true"]:not(.workspace-command),.modal-backdrop:not([data-modal-exit-clone]),.drawer-backdrop:not([data-modal-exit-clone])')) return;
        event.preventDefault(); returnFocus.current = document.activeElement as HTMLElement; setOpen(value => !value);
      }
      if (event.key === "Escape" && !document.querySelector('dialog[open],[aria-modal="true"]')) {
        setFocusMode(false);
      }
    };
    window.addEventListener("keydown", key);return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    const shell = dialog.current?.closest(".app-shell");
    shell?.classList.toggle("workspace-focus", focusMode);
    return () => { shell?.classList.remove("workspace-focus"); };
  }, [focusMode]);

  const close = (restoreFocus = true) => {
    dialog.current?.close();
    setOpen(false); setQuery(""); setSelected(0);
    if (restoreFocus) window.requestAnimationFrame(() => returnFocus.current?.isConnected && returnFocus.current.focus());
  };
  const go = (key: string) => { close(false); onNavigate(key); };
  const searchRecords = () => { const value = query; close(false); onSearchRecords(value); };
  const favorite = current && favorites.includes(current.key);
  const stamp = lastUpdatedAt ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(lastUpdatedAt) : "";

  return <>
    <header className="topbar workspace-topbar">
      {children}
    <div className="workspace-context-bar">
      <div className="workspace-location">
        <div className="workspace-history"><button type="button" disabled={!history.back} onClick={() => window.history.back()} aria-label="Voltar à tela anterior" title="Voltar"><ArrowLeft size={16}/></button><button type="button" disabled={!history.forward} onClick={() => window.history.forward()} aria-label="Avançar para a próxima tela" title="Avançar"><ArrowRight size={16}/></button></div>
        <nav aria-label="Você está em" className="workspace-breadcrumb"><button type="button" aria-label="Ir ao início" onClick={() => { const home = destinations.find(item => item.key === "dashboard"); if (home) onNavigate(home.key); }}><Home size={15}/></button><ChevronRight size={13}/><span>{current?.group || "Dontus"}</span><ChevronRight size={13}/><strong aria-current="page">{currentTitle}</strong></nav>
      </div>
      <div className="workspace-context-actions">
        <span className={`workspace-sync ${syncError ? "stale" : ""}`} title={syncError ? "Não foi possível atualizar os dados. Exibindo a última atualização disponível." : `Última atualização às ${stamp}, horário de Brasília.`}><i className={syncing ? "syncing" : ""}/><span>{syncError ? "Atualização pendente" : syncing ? "Atualizando" : stamp ? `Atualizado às ${stamp}` : "Conectando"}</span></span>
        {current && <button type="button" className={`workspace-favorite ${favorite ? "selected" : ""}`} aria-label={`${favorite ? "Remover" : "Adicionar"} ${current.label} ${favorite ? "dos" : "aos"} favoritos`} aria-pressed={favorite} title={favorite ? "Remover dos favoritos" : "Favoritar esta ferramenta"} onClick={() => setFavorites(previous => favorite ? previous.filter(key => key !== current.key) : [...previous, current.key].slice(-20))}><Star size={16}/></button>}
        <button type="button" className="workspace-focus-toggle" onClick={() => setFocusMode(value => !value)} aria-pressed={focusMode} aria-label={focusMode ? "Sair do modo foco" : "Ativar modo foco"} title={focusMode ? "Sair do modo foco (Esc)" : "Ampliar a área de trabalho"}>{focusMode ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}<span>{focusMode ? "Sair do foco" : "Foco"}</span></button>
        <button type="button" className="workspace-command-trigger" aria-label="Abrir navegação rápida" title={`Buscar ferramentas (${shortcut})`} onClick={() => { returnFocus.current = document.activeElement as HTMLElement; setOpen(true); }}><Command size={16}/><span>Ir para...</span><kbd>{shortcut}</kbd></button>
      </div>
    </div>
    </header>
    {favorites.some(key => destinations.some(item => item.key === key)) && <nav className="workspace-favorites" aria-label="Ferramentas favoritas"><span><Star size={13}/>Favoritos</span>{favorites.flatMap(key => { const item = destinations.find(entry => entry.key === key); if (!item) return []; const Icon = item.icon; return <button type="button" key={key} aria-current={key === currentKey ? "page" : undefined} onClick={() => onNavigate(key)}><Icon size={14}/>{item.label}</button>; })}</nav>}
    <dialog ref={dialog} className="workspace-command" aria-label="Navegação rápida" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="workspace-command-inner"><header><span className="workspace-command-symbol"><Command size={20}/></span><div><strong>Encontre sua próxima ação</strong><small>Ferramentas, favoritos e acessos recentes</small></div><button type="button" onClick={() => close()} aria-label="Fechar navegação rápida"><X size={19}/></button></header>
      <div className="workspace-command-search"><Search size={20}/><input ref={input} role="combobox" aria-label="Buscar ferramenta" aria-expanded={open} aria-controls="workspace-command-results" aria-activedescendant={visible[selectedIndex] ? `workspace-command-${selectedIndex}` : undefined} autoComplete="off" value={query} placeholder="Busque por ferramenta, área ou atividade..." onChange={event => { setQuery(event.target.value); setSelected(0); }} onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const next = Math.max(0, Math.min(visible.length - 1, selectedIndex + (event.key === "ArrowDown" ? 1 : -1)));setSelected(next);dialog.current?.querySelector(`#workspace-command-${next}`)?.scrollIntoView({ block: "nearest" }); } if (event.key === "Enter") { event.preventDefault(); if (visible[selectedIndex]) go(visible[selectedIndex].key); else if (query.trim()) searchRecords(); } }}/><kbd>Esc</kbd></div>
      <div className="workspace-command-results" id="workspace-command-results" role="listbox" aria-label="Ferramentas disponíveis">{visible.map((item, index) => { const Icon = item.icon; return <button type="button" role="option" aria-selected={index === selectedIndex} id={`workspace-command-${index}`} className={index === selectedIndex ? "selected" : ""} key={item.key} onMouseMove={() => setSelected(index)} onClick={() => go(item.key)}><span className="workspace-command-icon"><Icon size={19}/></span><span className="workspace-command-copy"><strong>{item.label}</strong><small>{item.group} · {item.description}</small></span>{favorites.includes(item.key) ? <Star size={15} className="is-favorite"/> : recent.includes(item.key) ? <Clock3 size={15}/> : null}{currentKey === item.key && <Check size={16}/>}<ChevronRight size={15}/></button>; })}{!visible.length && <div className="workspace-command-empty"><Search size={25}/><strong>Nenhuma ferramenta com esse nome</strong><span>Tente uma área, como Comercial, Agenda ou Clientes.</span></div>}</div>
      {query.trim() && <button type="button" className="workspace-search-records" onClick={searchRecords}><Search size={16}/><span>Buscar “{query.trim()}” em clientes e registros</span><ArrowRight size={16}/></button>}
      <footer><span><ArrowUp size={12}/><ArrowDown size={12}/> navegar</span><span><kbd>Enter</kbd> acessar</span><span><Star size={12}/> favorite na tela da ferramenta</span></footer></div>
    </dialog>
  </>;
}
