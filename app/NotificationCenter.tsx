"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  CalendarClock,
  ChevronRight,
  Inbox,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  X,
} from "lucide-react";
import type { AppNotification, NotificationDisplay } from "@/lib/notifications";
import "./notification-center.css";

// Tempo que uma notificação precisa ficar visível no painel para ser marcada como lida.
export const AUTO_READ_DELAY_MS = 3000;

// Notificações de chat não são lidas sozinhas: marcar uma delas como lida marca
// a conversa inteira como lida no chat interno.
export const autoReadable = (entry: AppNotification) =>
  entry.category !== "chat";

const CATEGORY_ICONS = {
  arrival: Inbox,
  comment: MessageSquareText,
  task: Inbox,
  chat: MessageCircle,
  reminder: AlarmClock,
  notice: Megaphone,
  agenda: CalendarClock,
} as const;

const AVATAR_TONES = ["blue", "violet", "teal", "amber", "rose", "green"];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

function avatarTone(name: string) {
  let hash = 0;
  for (const character of name)
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

const MONTHS = [
  "jan.",
  "fev.",
  "mar.",
  "abr.",
  "mai.",
  "jun.",
  "jul.",
  "ago.",
  "set.",
  "out.",
  "nov.",
  "dez.",
];

// "23 nov., 16:18" no horário de quem está usando o painel.
export function notificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${time}`;
}

// Notificações sem texto próprio (chat, avisos, lembretes...) usam o título e o meta.
function displayOf(entry: AppNotification): NotificationDisplay {
  return (
    entry.display ?? { action: "", subject: entry.title, reference: entry.meta }
  );
}

// Quantas notificações o painel mostra, no mínimo: as não lidas e, para completar,
// as últimas já lidas, para a pessoa rever ou confirmar algo.
export const NOTIFICATION_HISTORY_LIMIT = 10;

export default function NotificationCenter({
  entries,
  history,
  busy,
  onClose,
  onOpen,
  onRead,
  onMarkAll,
}: {
  // Notificações ainda não lidas, como o sistema as calcula agora.
  entries: AppNotification[];
  // Notificações já lidas, para completar a lista com as últimas.
  history: AppNotification[];
  busy: boolean;
  onClose: () => void;
  onOpen: (entry: AppNotification) => void;
  // Marca como lidas (no servidor ou localmente); chamado pela leitura automática.
  onRead: (entries: AppNotification[]) => void;
  onMarkAll: () => void;
}) {
  // Tudo o que apareceu desde que o painel abriu continua na lista até ele fechar,
  // inclusive o que acabou de ser lido, para nada sumir enquanto a pessoa lê.
  const [session, setSession] = useState(
    () => new Map(entries.map((entry) => [entry.id, entry])),
  );
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const timers = useRef(new Map<string, number>());
  const pending = useRef<AppNotification[]>([]);
  const flush = useRef<number | undefined>(undefined);
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);

  // Notificações novas entram na lista da sessão assim que chegam (ajuste de estado
  // durante a renderização, o padrão do React para estado derivado de props).
  const [seenEntries, setSeenEntries] = useState(entries);
  if (entries !== seenEntries) {
    setSeenEntries(entries);
    if (entries.some((entry) => session.get(entry.id) !== entry)) {
      const next = new Map(session);
      for (const entry of entries) next.set(entry.id, entry);
      setSession(next);
    }
  }

  const unreadIds = useMemo(
    () =>
      new Set(
        entries
          .filter((entry) => !readIds.has(entry.id))
          .map((entry) => entry.id),
      ),
    [entries, readIds],
  );
  // Tudo da sessão (não lidas e as que acabaram de ser lidas) e, se faltar para chegar
  // a 10, as últimas já lidas. Passando de 10 não lidas, todas aparecem.
  const list = useMemo(() => {
    const current = [...session.values()];
    const shown = new Set(current.map((entry) => entry.id));
    const older = [...history]
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .filter((entry) => !shown.has(entry.id))
      .slice(0, Math.max(0, NOTIFICATION_HISTORY_LIMIT - current.length));
    return [...current, ...older].sort(
      (a, b) => Date.parse(b.at) - Date.parse(a.at),
    );
  }, [session, history]);

  // Leitura automática: cada notificação não lida que fica visível por 3 s seguidos
  // é marcada como lida. As marcações próximas são enviadas juntas.
  useEffect(() => {
    const root = listRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const byId = new Map(list.map((entry) => [entry.id, entry]));
    const queueRead = (entry: AppNotification) => {
      setReadIds((current) => new Set(current).add(entry.id));
      pending.current.push(entry);
      window.clearTimeout(flush.current);
      flush.current = window.setTimeout(() => {
        const batch = pending.current.splice(0);
        if (batch.length) onReadRef.current(batch);
      }, 250);
    };
    const observer = new IntersectionObserver(
      (observed) => {
        for (const item of observed) {
          const id = (item.target as HTMLElement).dataset.notificationId ?? "";
          const entry = byId.get(id);
          if (!entry) continue;
          const running = timers.current.get(id);
          if (item.isIntersecting && unreadIds.has(id) && autoReadable(entry)) {
            if (running === undefined)
              timers.current.set(
                id,
                window.setTimeout(() => {
                  timers.current.delete(id);
                  queueRead(entry);
                }, AUTO_READ_DELAY_MS),
              );
          } else if (running !== undefined) {
            window.clearTimeout(running);
            timers.current.delete(id);
          }
        }
      },
      { root, threshold: 0.6 },
    );
    root
      .querySelectorAll<HTMLElement>("[data-notification-id]")
      .forEach((element) => observer.observe(element));
    // Os cronômetros em andamento continuam: a lista muda a cada leitura, e reiniciar
    // a contagem das outras notificações visíveis atrasaria a leitura delas.
    return () => observer.disconnect();
  }, [list, unreadIds]);

  // Ao fechar, para os cronômetros e envia o que já tinha sido lido e ainda estava na fila.
  useEffect(() => {
    const running = timers.current;
    const queue = pending.current;
    const send = onReadRef;
    return () => {
      for (const timer of running.values()) window.clearTimeout(timer);
      running.clear();
      window.clearTimeout(flush.current);
      const batch = queue.splice(0);
      if (batch.length) send.current(batch);
    };
  }, []);

  const unread = unreadIds.size;
  return (
    <section className="notification-panel" aria-label="Notificações">
      <header>
        <div className="notification-panel-title">
          <strong>Notificações</strong>
          {unread > 0 && (
            <span className="notification-panel-count">
              {unread} {unread === 1 ? "nova" : "novas"}
            </span>
          )}
          <button
            type="button"
            className="notification-panel-close"
            onClick={onClose}
            aria-label="Fechar notificações"
          >
            <X size={15} />
          </button>
        </div>
        <div className="notification-panel-subtitle">
          <small>
            {unread > 0
              ? "Chegadas e comentários para você"
              : "Suas últimas notificações"}
          </small>
          {unread > 0 && (
            <button
              type="button"
              className="notification-panel-read-all"
              disabled={busy}
              onClick={onMarkAll}
            >
              Marcar como lidas
            </button>
          )}
        </div>
      </header>
      <div className="notification-panel-list" ref={listRef}>
        {list.length === 0 ? (
          <p className="notification-panel-empty">
            Nenhuma notificação pendente.
          </p>
        ) : (
          list.map((entry) => {
            const display = displayOf(entry);
            const isUnread = unreadIds.has(entry.id);
            const Icon = CATEGORY_ICONS[entry.category] ?? Inbox;
            return (
              <button
                type="button"
                key={entry.id}
                data-notification-id={entry.id}
                data-reminder-entity-id={entry.id}
                className={`notification-panel-item${isUnread ? " is-unread" : ""}`}
                onClick={() => onOpen(entry)}
              >
                {display.actor ? (
                  <span
                    className={`notification-avatar tone-${avatarTone(display.actor)}`}
                    aria-hidden="true"
                  >
                    {initials(display.actor)}
                  </span>
                ) : (
                  <span
                    className={`notification-avatar is-icon category-${entry.category}`}
                    aria-hidden="true"
                  >
                    <Icon size={17} />
                  </span>
                )}
                <span className="notification-panel-body">
                  {(display.actor || display.action) && (
                    <span className="notification-panel-line">
                      {display.actor && <b>{display.actor}</b>} {display.action}
                    </span>
                  )}
                  <strong>{display.subject}</strong>
                  {display.reference && <small>{display.reference}</small>}
                  <span className="notification-panel-meta">
                    {display.status && (
                      <span
                        className={`notification-status tone-${display.status.tone}`}
                      >
                        {display.status.label}
                      </span>
                    )}
                    <time dateTime={entry.at}>
                      {notificationDate(entry.at)}
                    </time>
                  </span>
                </span>
                <span className="notification-panel-trail">
                  {isUnread && (
                    <i
                      className="notification-unread-dot"
                      aria-label="Não lida"
                    />
                  )}
                  <ChevronRight size={15} aria-hidden="true" />
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
