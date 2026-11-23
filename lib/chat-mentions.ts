export type ChatMention = {
  userId: string;
  name: string;
  start: number;
  length: number;
};

export function validChatMentions(
  body: string,
  mentions: ChatMention[],
): ChatMention[] {
  let end = 0;
  return mentions
    .slice()
    .sort((a, b) => a.start - b.start)
    .filter((mention) => {
      const next = mention.start + mention.length;
      if (
        mention.start < end ||
        mention.start < 0 ||
        next > body.length ||
        mention.length !== mention.name.length + 1 ||
        body.slice(mention.start, next) !== `@${mention.name}` ||
        (mention.start > 0 &&
          /[\p{L}\p{N}_@]/u.test(body[mention.start - 1])) ||
        /[\p{L}\p{N}_]/u.test(body[next] || "")
      )
        return false;
      end = next;
      return true;
    });
}

/** Keep identities only for untouched mentions; changing a name removes its selection. */
export function reconcileChatMentions(
  before: string,
  after: string,
  mentions: ChatMention[],
) {
  if (mentions.length === 0) return [];
  if (before === after) return validChatMentions(after, mentions);
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let oldEnd = before.length,
    newEnd = after.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    before[oldEnd - 1] === after[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  const shift = newEnd - oldEnd;
  return validChatMentions(
    after,
    mentions.flatMap((mention) => {
      if (mention.start + mention.length <= start) return [mention];
      if (mention.start >= oldEnd)
        return [{ ...mention, start: mention.start + shift }];
      return [];
    }),
  );
}

export function chatMentionQuery(body: string, caret: number) {
  const prefix = body.slice(0, caret),
    start = prefix.lastIndexOf("@");
  if (start < 0 || (start > 0 && !/[\s(]/.test(prefix[start - 1]))) return null;
  const query = prefix.slice(start + 1);
  return query.length <= 80 && !/[\n@]/.test(query)
    ? { start, end: caret, query }
    : null;
}
