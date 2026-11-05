import assert from "node:assert/strict";
import test from "node:test";
import { createConfetti, advanceConfetti } from "../lib/confetti-motion.ts";

test("os confetes caem e giram continuamente nos dois modos de movimento", () => {
  for (const gentle of [false, true]) {
    const pieces = createConfetti(1200, 1000, 8, () => .75);
    const initial = { ...pieces[1] };
    for (let frame = 0; frame < 15; frame++) advanceConfetti(pieces, 1 / 60, 1200, 1000, gentle, () => .75);
    assert.ok(pieces[1].y > initial.y, `o modo ${gentle ? "suave" : "normal"} precisa manter a queda`);
    assert.notEqual(pieces[1].rotation, initial.rotation);
  }
});

test("a queda usa o tempo decorrido e mantém a velocidade em telas com taxas de atualização diferentes", () => {
  const fast = createConfetti(10000, 10000, 2, () => .5);
  const slow = createConfetti(10000, 10000, 2, () => .5);
  for (let frame = 0; frame < 120; frame++) advanceConfetti(fast, 1 / 60, 10000, 10000);
  for (let frame = 0; frame < 60; frame++) advanceConfetti(slow, 1 / 30, 10000, 10000);
  assert.ok(Math.abs(fast[1].y - slow[1].y) < .01);
});

test("os confetes que saem da tela voltam pelo topo para manter a chuva durante a celebração", () => {
  const pieces = createConfetti(1200, 700, 2, () => .5);
  pieces[1].y = 750;
  advanceConfetti(pieces, 1 / 60, 1200, 700, false, () => .5);
  assert.ok(pieces[1].y < 0);
  assert.ok(pieces[1].x >= 0 && pieces[1].x <= 1200);
  assert.equal(pieces[1].speed, pieces[1].terminalSpeed);
});
