"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Trophy, Sparkles } from "lucide-react";
import { createPortal } from "react-dom";
import { enqueueSales, PUBLIC_SALE_DURATION_MS, SALE_WON_EVENT, type SaleCelebration } from "@/lib/sales-celebration";
import { playNotificationSound, unlockNotificationSound } from "@/lib/notification-sound";

function Confetti({ eventId }: { eventId: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    const context = element.getContext("2d"); if (!context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = window.innerWidth, height = window.innerHeight, frame = 0, last = 0;
    const resize = () => { width = window.innerWidth; height = window.innerHeight; const scale = Math.min(2, window.devicePixelRatio || 1); element.width = width * scale; element.height = height * scale; context.setTransform(scale, 0, 0, scale, 0, 0); };
    resize(); window.addEventListener("resize", resize);
    const colors = ["#37d6fd", "#a78bfa", "#f9cc55", "#ff6d9f", "#57e5ac", "#ffffff"];
    const pieces = Array.from({ length: reduced ? 32 : 180 }, (_, i) => ({ x: reduced ? Math.random() * width : width * .5 + (Math.random() - .5) * 100, y: reduced ? Math.random() * height : height * .45, speed: -7 - Math.random() * 10, drift: (Math.random() * 2 - 1) * 11, rotation: Math.random() * Math.PI, spin: Math.random() * .08 - .04, size: 4 + Math.random() * 7, color: colors[i % colors.length] }));
    const draw = (time: number) => {
      const delta = Math.min(2, (time - last) / 16.67 || 1); last = time;
      context.clearRect(0, 0, width, height);
      for (const piece of pieces) {
        if (!reduced) { piece.speed = Math.min(4, piece.speed + .15 * delta); piece.y += piece.speed * delta; piece.x += piece.drift * delta; piece.drift *= .995; piece.rotation += piece.spin * delta; if (piece.y > height + 20 || piece.x < -30 || piece.x > width + 30) { piece.y = -20; piece.x = Math.random() * width; piece.speed = 2 + Math.random() * 2; piece.drift = Math.random() * 2 - 1; } }
        context.save(); context.translate(piece.x, reduced ? Math.abs(piece.y) : piece.y); context.rotate(piece.rotation); context.fillStyle = piece.color; context.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * .5); context.restore();
      }
      if (!reduced) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, [eventId]);
  return <canvas ref={canvas} className="sale-confetti" aria-hidden="true" />;
}

export default function SalesCelebration({ events, publicBoard = false }: { events?: SaleCelebration[]; publicBoard?: boolean }) {
  const [queue, setQueue] = useState<SaleCelebration[]>([]);
  const [remaining, setRemaining] = useState(60);
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  const active = queue[0];
  const receiveSales = useCallback((incoming: SaleCelebration[]) => {
    if (!initialized.current) { initialized.current = true; incoming.forEach(event => seen.current.add(event.id)); return; }
    const additions = enqueueSales([], incoming, seen.current);
    if (additions.length) setQueue(current => [...current, ...additions]);
  }, []);
  useEffect(() => {
    if (!publicBoard || !events) return;
    receiveSales(events);
  }, [events, publicBoard, receiveSales]);
  useEffect(() => {
    if (!publicBoard) return;
    const controller = new AbortController(); let pending = false;
    const load = async () => { if (pending) return; pending = true; try { const response = await fetch("/api/public-sale-events", { cache: "no-store", signal: controller.signal }); if (response.ok) receiveSales(await response.json()); } catch { /* The next poll resumes after temporary disconnections. */ } finally { pending = false; } };
    const timer = window.setInterval(() => void load(), 3000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [publicBoard, receiveSales]);
  useEffect(() => {
    if (publicBoard) return;
    const receive = (event: Event) => { const sale = (event as CustomEvent<SaleCelebration>).detail; if (sale?.id && !seen.current.has(sale.id)) { seen.current.add(sale.id); setQueue(current => [...current, sale]); } };
    window.addEventListener(SALE_WON_EVENT, receive);
    return () => window.removeEventListener(SALE_WON_EVENT, receive);
  }, [publicBoard]);
  useEffect(() => {
    const unlock = () => unlockNotificationSound();
    window.addEventListener("pointerdown", unlock, { passive: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);
  useEffect(() => {
    if (!active) return;
    playNotificationSound(true);
    const duration = publicBoard ? PUBLIC_SALE_DURATION_MS : 6_000;
    const endsAt = Date.now() + duration; setRemaining(Math.ceil(duration / 1000));
    const tick = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))), 1000);
    const timer = window.setTimeout(() => setQueue(current => current.slice(1)), duration);
    return () => { window.clearInterval(tick); window.clearTimeout(timer); };
  }, [active?.id, publicBoard]);
  if (!active || typeof document === "undefined") return null;
  return createPortal(<div className={`sale-celebration ${publicBoard ? "sale-public" : "sale-operator"}`} role="status" aria-live="polite"><Confetti eventId={active.id} /><section className="sale-celebration-card" key={active.id}><div className="sale-trophy"><Trophy size={46} /></div><span className="sale-eyebrow"><Sparkles size={16} /> DONTUS CRESCENDO</span><h2>+1 venda realizada!</h2><p>Seja bem-vindo{active.customerName ? "," : " à Dontus!"}</p><strong className="sale-customer">{active.customerName}</strong>{active.clientId && <span className="sale-client-id">ID {active.clientId}</span>}<small>Venda fechada por <b>{active.seller || "nossa equipe"}</b></small>{publicBoard && <footer><span>Celebrando esta conquista · {remaining}s</span>{queue.length > 1 && <b>{queue.length - 1} venda(s) na fila</b>}<i style={{ transform: `scaleX(${remaining / 60})` }} /></footer>}</section></div>, document.body);
}
