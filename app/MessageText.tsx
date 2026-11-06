import { messageLinks } from "@/lib/message-links";

export default function MessageText({ text }: { text: string }) {
  return <>{messageLinks(text).map((part, index) => part.href
    ? <a className="message-text-link" key={index} href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>
    : part.text)}</>;
}
