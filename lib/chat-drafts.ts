import {
  reconcileChatMentions,
  validChatMentions,
  type ChatMention,
} from "./chat-mentions.ts";
export type ChatDrafts = Record<string, string>;

export function moveChatDraft(
  drafts: ChatDrafts,
  from: string,
  to: string,
): ChatDrafts {
  if (from === to || !(from in drafts)) return drafts;
  const { [from]: draft, ...remaining } = drafts;
  return { ...remaining, [to]: [draft, drafts[to]].filter(Boolean).join("\n") };
}

export function restoreChatDraft(
  drafts: ChatDrafts,
  key: string,
  submitted: string,
): ChatDrafts {
  return {
    ...drafts,
    [key]: [submitted, drafts[key]].filter(Boolean).join("\n"),
  };
}

/** Only the composer subscribes to text changes; the conversation history stays untouched. */
export function createChatDraftStore() {
  let drafts: ChatDrafts = {};
  const mentions: Record<string, ChatMention[]> = {};
  const listeners = new Set<() => void>();
  const update = (next: ChatDrafts) => {
    if (next === drafts) return;
    drafts = next;
    listeners.forEach((listener) => listener());
  };
  return {
    get: (key: string) => drafts[key] ?? "",
    getMentions: (key: string) =>
      validChatMentions(drafts[key] ?? "", mentions[key] ?? []),
    setMentions: (key: string, values: ChatMention[]) => {
      mentions[key] = validChatMentions(drafts[key] ?? "", values);
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    // The browser already owns the visible text. Notify React only when the
    // send button changes between empty/nonempty; avoid copying every draft.
    input: (key: string, value: string) => {
      const hadText = Boolean(drafts[key]?.trim());
      mentions[key] = reconcileChatMentions(
        drafts[key] ?? "",
        value,
        mentions[key] ?? [],
      );
      drafts[key] = value;
      if (hadText !== Boolean(value.trim()))
        listeners.forEach((listener) => listener());
    },
    set: (key: string, value: string) => {
      if ((drafts[key] ?? "") !== value) {
        mentions[key] = reconcileChatMentions(
          drafts[key] ?? "",
          value,
          mentions[key] ?? [],
        );
        update({ ...drafts, [key]: value });
      }
    },
    move: (from: string, to: string) => {
      if (from !== to && from in drafts) {
        const offset =
          (drafts[from]?.length ?? 0) + (drafts[from] && drafts[to] ? 1 : 0);
        mentions[to] = [
          ...(mentions[from] ?? []),
          ...(mentions[to] ?? []).map((entry) => ({
            ...entry,
            start: entry.start + offset,
          })),
        ];
        delete mentions[from];
      }
      update(moveChatDraft(drafts, from, to));
    },
    restore: (
      key: string,
      submitted: string,
      submittedMentions: ChatMention[] = [],
    ) => {
      const offset = submitted.length + (submitted && drafts[key] ? 1 : 0);
      mentions[key] = [
        ...submittedMentions,
        ...(mentions[key] ?? []).map((entry) => ({
          ...entry,
          start: entry.start + offset,
        })),
      ];
      update(restoreChatDraft(drafts, key, submitted));
    },
  };
}
export type ChatDraftStore = ReturnType<typeof createChatDraftStore>;

export async function sendChatDraft(
  store: ChatDraftStore,
  key: string,
  send: (body: string) => Promise<unknown>,
): Promise<boolean> {
  const submitted = store.get(key);
  if (!submitted.trim()) return false;
  store.set(key, "");
  try {
    if (await send(submitted)) return true;
  } catch {
    /* Restore below, including text typed during the request. */
  }
  store.restore(key, submitted);
  return false;
}
