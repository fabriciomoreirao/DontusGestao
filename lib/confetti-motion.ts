export const confettiColors = ["#37d6fd", "#a78bfa", "#f9cc55", "#ff6d9f", "#57e5ac", "#ffffff"];
export type ConfettiParticle = { x: number; y: number; speed: number; terminalSpeed: number; drift: number; rotation: number; spin: number; size: number; phase: number; color: string };

export function createConfetti(width: number, height: number, count: number, random = Math.random): ConfettiParticle[] {
  return Array.from({ length: count }, (_, index) => {
    const burst = index % 4 === 0;
    const terminalSpeed = 100 + random() * 150;
    return { x: burst ? width * .5 + (random() - .5) * 100 : random() * width,
      y: burst ? height * .42 : random() * (height + 100) - 100,
      speed: burst ? -220 - random() * 280 : terminalSpeed, terminalSpeed,
      drift: burst ? (random() - .5) * 500 : (random() - .5) * 45,
      rotation: random() * Math.PI, spin: (random() - .5) * 6, size: 4 + random() * 7,
      phase: random() * Math.PI * 2, color: confettiColors[index % confettiColors.length] };
  });
}

export function advanceConfetti(particles: ConfettiParticle[], elapsedSeconds: number, width: number, height: number, gentle = false, random = Math.random) {
  const elapsed = Math.min(.05, Math.max(0, elapsedSeconds)) * (gentle ? .6 : 1);
  for (const piece of particles) {
    piece.speed = Math.min(piece.terminalSpeed, piece.speed + 350 * elapsed);
    piece.phase += elapsed * 2;
    piece.y += piece.speed * elapsed;
    piece.x += (piece.drift + Math.sin(piece.phase) * 22) * elapsed;
    piece.drift *= Math.exp(-elapsed * .3);
    piece.rotation += piece.spin * elapsed;
    if (piece.y > height + 20 || piece.x < -40 || piece.x > width + 40) {
      piece.y = -piece.size - random() * 80; piece.x = random() * width;
      piece.speed = piece.terminalSpeed; piece.drift = (random() - .5) * 45;
    }
  }
}
