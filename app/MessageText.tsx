import { validChatMentions, type ChatMention } from "@/lib/chat-mentions";
import { messageLinks } from "@/lib/message-links";

export default function MessageText({
  text,
  mentions = [],
  currentUserId,
}: {
  text: string;
  mentions?: ChatMention[];
  currentUserId?: string;
}) {
  const selected = validChatMentions(text, mentions);
  const spans: Array<{ text: string; mention?: ChatMention }> = [];
  let cursor = 0;
  for (const mention of selected) {
    if (mention.start > cursor)
      spans.push({ text: text.slice(cursor, mention.start) });
    spans.push({
      text: text.slice(mention.start, mention.start + mention.length),
      mention,
    });
    cursor = mention.start + mention.length;
  }
  if (cursor < text.length) spans.push({ text: text.slice(cursor) });
  return (
    <>
      {spans.map((span, index) =>
        span.mention ? (
          <strong
            key={index}
            className={`chat-mention ${span.mention.userId === currentUserId ? "self" : ""}`}
          >
            {span.text}
          </strong>
        ) : (
          <span key={index}>
            {messageLinks(span.text).map((part, index) =>
              part.href ? (
                <a
                  className="message-text-link"
                  key={index}
                  href={part.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {part.text}
                </a>
              ) : (
                part.text
              ),
            )}
          </span>
        ),
      )}
    </>
  );
}
