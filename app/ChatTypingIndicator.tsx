"use client";
import { useSyncExternalStore } from "react";
import { chatTypingStore } from "@/lib/chat-typing";

export default function ChatTypingIndicator({ roomId, self, members, users }: {
  roomId: string; self: string; members: string[]; users: Array<{ id: string; name: string; photoDataUrl: string }>;
}) {
  useSyncExternalStore(chatTypingStore.subscribe, chatTypingStore.snapshot, () => 0);
  const people = chatTypingStore.users(roomId, self).filter(id => members.includes(id)).map(id => users.find(user => user.id === id)).filter(person => person !== undefined);
  if (!people.length) return null;
  const label = `${people.map(person => person.name).join(', ')} ${people.length === 1 ? 'está digitando' : 'estão digitando'}`;
  return <div className="internal-chat-typing" role="status" aria-label={label}><div className="internal-chat-typing-photos">{people.slice(0,3).map(person => <span key={person.id} className="internal-chat-typing-photo" role={person.photoDataUrl?"img":undefined} aria-label={person.photoDataUrl?`Foto de ${person.name}`:undefined} style={person.photoDataUrl?{backgroundImage:`url("${person.photoDataUrl}")`}:undefined}>{!person.photoDataUrl&&<span>{person.name.slice(0,2).toUpperCase()}</span>}</span>)}</div><span className="internal-chat-typing-bubble" aria-hidden="true"><i/><i/><i/></span><span className="internal-chat-typing-label">{label}</span></div>;
}
