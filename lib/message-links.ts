export type MessagePart = { text: string; href?: string };

/** Plain text stays escaped by React. Only HTTP(S) and explicit www addresses become links. */
export function messageLinks(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const pattern = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index!;
    if (start > 0 && /[\p{L}\p{N}_@/]/u.test(text[start - 1])) continue;
    let value = match[0].replace(/[.,;:!?]+$/, "");
    // Keep balanced parentheses used in real URLs, discard surrounding prose punctuation.
    for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
      while (value.endsWith(close) && value.split(close).length > value.split(open).length) value = value.slice(0, -1);
    }
    try {
      const url = new URL(/^www\./i.test(value) ? `https://${value}` : value);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) continue;
      if (start > cursor) parts.push({ text: text.slice(cursor, start) });
      parts.push({ text: value, href: url.href });
      cursor = start + value.length;
    } catch { /* Leave malformed addresses as text. */ }
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
