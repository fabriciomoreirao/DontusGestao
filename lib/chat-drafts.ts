export type ChatDrafts = Record<string, string>;

export function moveChatDraft(drafts: ChatDrafts, from: string, to: string): ChatDrafts {
  if (from === to || !(from in drafts)) return drafts;
  const { [from]: draft, ...remaining } = drafts;
  return { ...remaining, [to]: [draft, drafts[to]].filter(Boolean).join("\n") };
}

export function restoreChatDraft(drafts: ChatDrafts, key: string, submitted: string): ChatDrafts {
  return { ...drafts, [key]: [submitted, drafts[key]].filter(Boolean).join("\n") };
}

/** Only the composer subscribes to text changes; the conversation history stays untouched. */
export function createChatDraftStore() {
  let drafts: ChatDrafts = {};
  const listeners = new Set<() => void>();
  const update = (next: ChatDrafts) => {
    if (next === drafts) return;
    drafts = next;
    listeners.forEach(listener => listener());
  };
  return {
    get: (key: string) => drafts[key] ?? "",
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set: (key: string, value: string) => { if ((drafts[key] ?? "") !== value) update({ ...drafts, [key]: value }); },
    move: (from: string, to: string) => update(moveChatDraft(drafts, from, to)),
    restore: (key: string, submitted: string) => update(restoreChatDraft(drafts, key, submitted)),
  };
}
export type ChatDraftStore = ReturnType<typeof createChatDraftStore>;
