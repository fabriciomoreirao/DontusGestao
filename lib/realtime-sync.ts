type Socket = Pick<WebSocket, "close" | "onopen" | "onmessage" | "onclose" | "onerror">;
type Changes = { operations?: boolean; internalChat?: boolean };
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
  unauthorized: () => void;
};

// One socket and one request queue per mounted workspace. Bursts collapse into one projection fetch.
export function createRealtimeSync(options: SyncOptions) {
  let socket: Socket | undefined;
  let stopped = false, connected = false, hadReady = false, running = false;
  let pending: Changes = {}, attempts = 0, lastFrame = Date.now();
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let lastFallback = Date.now();
  const setStatus = (value: boolean) => { connected = value; options.status(value); };
  const schedule = (delay = 300) => {
    if (!stopped && !flushTimer) flushTimer = setTimeout(() => { flushTimer = undefined; void flush(); }, delay);
  };
  const queue = (changes: Changes) => {
    pending.operations ||= changes.operations === true;
    pending.internalChat ||= options.canChat && changes.internalChat === true;
    schedule();
  };
  const flush = async () => {
    if (stopped || running) return;
    if (options.busy()) { schedule(1000); return; }
    const operations = pending.operations && !options.hidden();
    const chat = pending.internalChat;
    if (!operations && !chat) return;
    if (operations) pending = {}; else pending.internalChat = false;
    running = true;
    let ok = false;
    try { ok = await (operations ? options.operations() : options.chat()); } catch { /* Retry after a transient HTTP failure. */ }
    finally {
      running = false;
      if (!ok) { pending.operations ||= operations; pending.internalChat ||= chat; }
      if (!stopped && (pending.internalChat || pending.operations && !options.hidden())) schedule(ok ? 300 : 5000);
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
      if (message.type === "ready") {
        clearTimeout(openTimer); attempts = 0; setStatus(true);
        // A cursor captured before the initial snapshot avoids downloading it twice on normal startup.
        if (hadReady || message.cursor !== options.cursor()) queue({ operations: true, internalChat: true });
        hadReady = true;
      } else if (message.type === "changed") queue(message);
      else if (message.type === "unauthorized") { options.unauthorized(); stop(); }
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
