export type ChatTyping = { roomId: string; userId: string; sessionId: string; isTyping: boolean; at: string };
export const CHAT_TYPING_TTL = 6_000;

export function createChatTypingStore() {
  const entries = new Map<string, ChatTyping & { stamp: number; expires: number }>();
  const listeners = new Set<() => void>();
  let version = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const signature = () => [...new Set([...entries.values()].filter(entry => entry.isTyping && entry.expires > Date.now()).map(entry => `${entry.roomId}:${entry.userId}`))].sort().join('|');
  const notify = () => { version++; listeners.forEach(listener => listener()); };
  const schedule = () => {
    clearTimeout(timer);
    if (!entries.size) return;
    timer = setTimeout(() => {
      let removedActive = false;
      for (const [key, entry] of entries) if (entry.expires <= Date.now()) { entries.delete(key); removedActive ||= entry.isTyping; }
      if (removedActive) notify();
      schedule();
    }, Math.max(1, Math.min(...[...entries.values()].map(entry => entry.expires)) - Date.now()));
  };
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => version,
    users: (roomId: string, self: string) => [...new Set([...entries.values()].filter(entry => entry.roomId === roomId && entry.userId !== self && entry.isTyping && entry.expires > Date.now()).map(entry => entry.userId))],
    receive: (changes: unknown[]) => {
      const before = signature();
      for (const raw of changes) {
        if (!raw || typeof raw !== 'object') continue;
        const entry = raw as ChatTyping;
        if (![entry.roomId, entry.userId, entry.sessionId, entry.at].every(value => typeof value === 'string' && value.length > 0 && value.length <= 128) || typeof entry.isTyping !== 'boolean') continue;
        const stamp = Date.parse(entry.at), key = `${entry.roomId}:${entry.userId}:${entry.sessionId}`;
        const previous = entries.get(key);
        if (!Number.isFinite(stamp) || previous && (previous.stamp > stamp || previous.stamp === stamp && (!previous.isTyping || entry.isTyping))) continue;
        entries.set(key, { ...entry, stamp, expires: Date.now() + (entry.isTyping ? CHAT_TYPING_TTL : 15_000) });
      }
      while (entries.size > 2048) entries.delete(entries.keys().next().value!);
      if (before !== signature()) notify();
      schedule();
    },
    clear: () => { clearTimeout(timer); entries.clear(); notify(); },
  };
}
export const chatTypingStore = createChatTypingStore();

// Input events only touch refs/timers. Slow requests cannot hold up typing or overtake a stop.
export function createChatTypingPublisher(send: (active: boolean) => Promise<unknown>) {
  let active = false, stopped = false, running = false, lastPulse = -Infinity;
  let pending: boolean | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined, dispatch: ReturnType<typeof setTimeout> | undefined;
  const flush = async () => {
    if (running || pending === undefined) return;
    const value = pending; pending = undefined; running = true;
    try { await send(value); } catch { /* Ephemeral state expires if the connection is unavailable. */ }
    finally { running = false; if (pending !== undefined) void flush(); }
  };
  const queue = (value: boolean) => { pending = value; clearTimeout(dispatch); dispatch = setTimeout(() => { void flush(); }, 0); };
  const stop = () => { clearTimeout(idle); if (active) { active = false; queue(false); } };
  return {
    input: (hasText: boolean) => {
      if (stopped) return;
      if (!hasText) { stop(); return; }
      if (!active || Date.now() - lastPulse >= 3_000) { lastPulse = Date.now(); queue(true); }
      active = true; clearTimeout(idle); idle = setTimeout(stop, 1_400);
    },
    stop,
    dispose: () => { stop(); stopped = true; },
  };
}
