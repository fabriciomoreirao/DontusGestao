export type ChatDrafts = Record<string, string>;

export function moveChatDraft(drafts: ChatDrafts, from: string, to: string): ChatDrafts {
  if (from === to || !(from in drafts)) return drafts;
  const { [from]: draft, ...remaining } = drafts;
  return { ...remaining, [to]: [draft, drafts[to]].filter(Boolean).join("\n") };
}

export function restoreChatDraft(drafts: ChatDrafts, key: string, submitted: string): ChatDrafts {
  return { ...drafts, [key]: [submitted, drafts[key]].filter(Boolean).join("\n") };
}
