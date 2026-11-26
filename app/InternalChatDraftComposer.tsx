"use client";

import {
  useEffect,
  useId,
  useState,
  type ClipboardEventHandler,
  type RefObject,
} from "react";
import { Send } from "lucide-react";
import type { ChatDraftStore } from "@/lib/chat-drafts";
import useChatDraftInput from "@/app/useChatDraftInput";
import { chatMentionQuery } from "@/lib/chat-mentions";

// Navegadores com field-sizing: content (Chrome e Edge) já cuidam da altura pelo CSS.
// Nos demais, ajusta a altura ao conteúdo; o limite máximo e a rolagem vêm do CSS.
function fitComposer(element: HTMLTextAreaElement | null) {
  if (!element || CSS.supports("field-sizing", "content")) return;
  element.style.height = "auto";
  const borders = element.offsetHeight - element.clientHeight;
  element.style.height = `${element.scrollHeight + borders}px`;
}

export default function InternalChatDraftComposer({
  drafts,
  conversationKey,
  inputRef,
  busy,
  canCreate,
  recording,
  hasAttachments,
  onPaste,
  onTyping,
  participants,
}: {
  drafts: ChatDraftStore;
  conversationKey: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  busy: boolean;
  canCreate: boolean;
  recording: boolean;
  hasAttachments: boolean;
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  onTyping?: (active: boolean) => void;
  participants: Array<{ id: string; name: string }>;
}) {
  const { hasMessage, input } = useChatDraftInput(
    drafts,
    conversationKey,
    inputRef,
    onTyping,
  );
  // A caixa cresce sozinha com o texto (field-sizing no CSS). Onde o navegador não tem
  // field-sizing, fitComposer ajusta a altura ao digitar, ao trocar de conversa e quando
  // o rascunho muda por fora (enviar, limpar, mencionar).
  useEffect(() => {
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fitComposer(inputRef.current));
    };
    fit();
    const unsubscribe = drafts.subscribe(fit);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [drafts, conversationKey, inputRef]);
  const listId = useId();
  const [query, setQuery] = useState<ReturnType<typeof chatMentionQuery>>(null);
  const [active, setActive] = useState(0);
  const [queryKey, setQueryKey] = useState(conversationKey);
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const matches =
    query && queryKey === conversationKey
      ? participants.filter((person) =>
          normalize(person.name).includes(normalize(query.query)),
        )
      : [];
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));
  useEffect(() => {
    document
      .getElementById(`${listId}-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [listId, activeIndex, query?.query, queryKey]);
  const updateQuery = (element: HTMLTextAreaElement) => {
    setQueryKey(conversationKey);
    setQuery(chatMentionQuery(element.value, element.selectionStart));
    setActive(0);
  };
  const select = (person: { id: string; name: string }) => {
    const element = inputRef.current;
    if (!element || !query) return;
    const before = element.value,
      label = `@${person.name}`;
    const next =
      before.slice(0, query.start) + label + " " + before.slice(query.end);
    input(next);
    drafts.setMentions(conversationKey, [
      ...drafts.getMentions(conversationKey),
      {
        userId: person.id,
        name: person.name,
        start: query.start,
        length: label.length,
      },
    ]);
    element.value = next;
    element.focus();
    element.setSelectionRange(
      query.start + label.length + 1,
      query.start + label.length + 1,
    );
    setQuery(null);
  };
  return (
    <>
      <div className="internal-chat-mention-composer">
        {query && queryKey === conversationKey && (
          <div
            className="internal-chat-mention-list"
            role="listbox"
            id={listId}
            aria-label="Participantes para mencionar"
          >
            {matches.length ? (
              matches.map((person, index) => (
                <button
                  type="button"
                  role="option"
                  id={`${listId}-${index}`}
                  aria-selected={index === activeIndex}
                  key={person.id}
                  tabIndex={-1}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => select(person)}
                >
                  <span aria-hidden="true">@</span>
                  {person.name}
                </button>
              ))
            ) : (
              <p>Nenhum participante encontrado.</p>
            )}
          </div>
        )}
        <textarea
          ref={inputRef}
          rows={1}
          role="combobox"
          aria-haspopup="listbox"
          disabled={!canCreate || recording}
          aria-label="Mensagem do chat interno"
          aria-autocomplete="list"
          aria-controls={query ? listId : undefined}
          aria-expanded={Boolean(query && queryKey === conversationKey)}
          aria-activedescendant={
            matches.length ? `${listId}-${activeIndex}` : undefined
          }
          defaultValue={drafts.get(conversationKey)}
          onChange={(event) => {
            input(event.target.value);
            updateQuery(event.currentTarget);
            fitComposer(event.currentTarget);
          }}
          onClick={(event) => updateQuery(event.currentTarget)}
          onBlur={() => {
            onTyping?.(false);
            setQuery(null);
          }}
          onPaste={onPaste}
          placeholder="Escreva uma mensagem... use @ para mencionar"
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (query && queryKey === conversationKey) {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setQuery(null);
                return;
              }
              if (
                matches.length &&
                (event.key === "ArrowDown" || event.key === "ArrowUp")
              ) {
                event.preventDefault();
                setActive(
                  (activeIndex +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    matches.length) %
                    matches.length,
                );
                return;
              }
              if (matches.length && event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                select(matches[activeIndex]);
                return;
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              setQuery(null);
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
      </div>
      <button
        className="internal-chat-send"
        onPointerDown={(event) => {
          if (event.button === 0) event.preventDefault();
        }}
        disabled={busy || !canCreate || (!hasMessage && !hasAttachments)}
        aria-label="Enviar mensagem"
      >
        <Send size={18} />
      </button>
    </>
  );
}
