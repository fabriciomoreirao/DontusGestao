type Socket = Pick<WebSocket, "close" | "onopen" | "onmessage" | "onclose" | "onerror">;
type Changes = { operations?: boolean; internalChat?: boolean };
type Presence = {userId:string;isOnline:boolean;lastSeenAt:string|null};
type SyncOptions = {
  url: string;
  connect?: (url: string) => Socket;
  operations: () => Promise<boolean>;
  chat: () => Promise<boolean>;
  canChat: boolean;
  busy: () => boolean;
  hidden: () => boolean;
  cursor: () => string;
  status: (connected: boolean) => void;
  unauthorized: (message?: string) => void;
  presence?: (users:Presence[]) => void;
};

// One socket with independent chat and operations requests. Bursts coalesce within each channel.
export function createRealtimeSync(options: SyncOptions) {
  let socket: Socket | undefined;
  let stopped = false, connected = false, hadReady = false, operationsRunning = false, chatRunning = false;
  const pending: Changes = {};
  let attempts = 0, lastFrame = Date.now();
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let flushAt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let lastFallback = Date.now();
  const setStatus = (value: boolean) => { connected = value; options.status(value); };
  const schedule = (delay = 300) => {
    const at = Date.now() + delay;
    if (stopped || flushTimer && flushAt <= at) return;
    clearTimeout(flushTimer); flushAt = at;
    flushTimer = setTimeout(() => { flushTimer = undefined; flush(); }, delay);
  };
  const queue = (changes: Changes) => {
    pending.operations ||= changes.operations === true;
    pending.internalChat ||= options.canChat && changes.internalChat === true;
    schedule(changes.internalChat ? 75 : 300);
  };
  const run = async (chat: boolean) => {
    if (chat) { chatRunning = true; pending.internalChat = false; }
    else { operationsRunning = true; pending.operations = false; }
    let ok = false;
    try { ok = await (chat ? options.chat() : options.operations()); } catch { /* Keep the invalidation for recovery. */ }
    finally {
      if (chat) { chatRunning = false; pending.internalChat ||= !ok; }
      else { operationsRunning = false; pending.operations ||= !ok; }
      if (!stopped && (pending.internalChat && !chatRunning || pending.operations && !operationsRunning && !options.hidden())) schedule(ok ? 75 : 5000);
    }
  };
  const flush = () => {
    if (stopped) return;
    // Chat never waits for a slow operational snapshot or an unrelated form save.
    if (pending.internalChat && !chatRunning) void run(true);
    if (pending.operations && !operationsRunning && !options.hidden()) {
      if (options.busy()) schedule(1000);
      else void run(false);
    }
  };
  const start = () => {
    if (stopped) return;
    clearTimeout(reconnectTimer);
    const current = (options.connect ?? (url => new WebSocket(url)))(options.url);
    socket = current;
    lastFrame = Date.now();
    openTimer = setTimeout(() => current.close(), 10_000);
    current.onopen = () => { lastFrame = Date.now(); };
    current.onmessage = event => {
      if (stopped || socket !== current) return;
      lastFrame = Date.now();
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if(options.canChat&&Array.isArray(message.presence))options.presence?.(message.presence.filter((entry:Presence)=>entry&&typeof entry.userId==="string"&&typeof entry.isOnline==="boolean"&&(entry.lastSeenAt===null||typeof entry.lastSeenAt==="string")));
      if (message.type === "ready") {
        clearTimeout(openTimer); attempts = 0; setStatus(true);
        // A cursor captured before the initial snapshot avoids downloading it twice on normal startup.
        if (hadReady || message.cursor !== options.cursor()) queue({ operations: true, internalChat: true });
        hadReady = true;
      } else if (message.type === "changed"&&(message.operations||message.internalChat)) queue(message);
      else if (message.type === "unauthorized") { options.unauthorized(typeof message.detail === "string" ? message.detail : undefined); stop(); }
    };
    current.onerror = () => current.close();
    current.onclose = () => {
      if (stopped || socket !== current) return;
      clearTimeout(openTimer); setStatus(false); socket = undefined;
      reconnectTimer = setTimeout(start, Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)) + Math.random() * 500);
    };
  };
  // Recovery only: no HTTP polling while the socket is healthy, or while the tab is hidden.
  const health = setInterval(() => {
    if (connected && Date.now() - lastFrame > 70_000) socket?.close();
    if (!connected && !options.hidden()) {
      const operations = Date.now() - lastFallback >= 60_000;
      if (operations) lastFallback = Date.now();
      queue({ operations, internalChat: true });
    }
  }, 15_000);
  const visible = () => {
    if (options.hidden() || stopped) return;
    // Visibility alone does not re-download data on a healthy connection.
    if (!connected) { queue({ operations: true, internalChat: true }); if (!socket) start(); }
    else schedule();
  };
  const online = () => { if (!stopped && !connected && !socket) start(); };
  function stop() {
    stopped = true; clearInterval(health); clearTimeout(flushTimer); clearTimeout(reconnectTimer); clearTimeout(openTimer);
    if (socket) { socket.onclose = null; socket.onerror = null; socket.onmessage = null; socket.close(); }
  }
  start();
  return { stop, visible, online };
}
