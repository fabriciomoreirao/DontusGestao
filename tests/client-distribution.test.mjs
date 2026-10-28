import test from "node:test";
import assert from "node:assert/strict";
import { currentDistributionRows, distributionQueue, distributionWarning, orderedDistributionCollaborators } from "../lib/client-distribution.ts";

const board = {
  track: "activation", updatedAt: "2026-10-27T12:00:00Z", pendingClients: [],
  collaborators: [{ userId: "a", displayName: "Alice", totalClients: 3, clientsByVersion: { Essencial: 1 } }, { userId: "b", displayName: "Bruno", totalClients: 2, clientsByVersion: { Essencial: 0 } }],
  queues: [{ version: "Essencial", suggestedUserId: "b", lastRecipientUserId: "a", orderedUserIds: ["b", "a"] }, { version: "Maxi", suggestedUserId: "a", lastRecipientUserId: "b", orderedUserIds: ["a", "b"] }],
};
test("a fila usa a ordem calculada para a versão, sem misturar versões ou alterar os dados recebidos", () => {
  assert.deepEqual(orderedDistributionCollaborators(board, "Essencial").map(entry => entry.userId), ["b", "a"]);
  assert.deepEqual(orderedDistributionCollaborators(board, "Maxi").map(entry => entry.userId), ["a", "b"]);
  assert.equal(board.collaborators[0].userId, "a");
  assert.equal(distributionQueue(board, "Ultra"), undefined);
});
test("avisa ao selecionar quem recebeu o último cliente da mesma versão e identifica o próximo sugerido", () => {
  assert.match(distributionWarning(board, "Essencial", "a"), /já foi enviado.*Bruno/);
  assert.equal(distributionWarning(board, "Essencial", "b"), "");
  assert.equal(distributionWarning(board, "Maxi", "a"), "");
  assert.match(distributionWarning(board, "Maxi", "b"), /já foi enviado.*Alice/);
  assert.equal(distributionWarning(undefined, "Essencial", "a"), "");
});

test("indicadores usam somente a carteira atual, somam as três etapas e permitem consultar cada etapa", () => {
  const current = { ...board, collaborators: [
    { ...board.collaborators[1], currentPortfolio: [{ phase: "onboarding", version: "Maxi", quantity: 2 }] },
    { ...board.collaborators[0], currentPortfolio: [
      { phase: "onboarding", version: "Essencial", quantity: 1 },
      { phase: "tracking", version: "Essencial", quantity: 2 },
      { phase: "conference", version: "Ultra", quantity: 1 },
      { phase: "finished", version: "Maxi", quantity: 99 },
    ] },
  ] };
  const rows = currentDistributionRows(current);
  assert.deepEqual(rows.map(row => [row.displayName, row.totalClients, row.clientsByVersion]), [
    ["Alice", 4, { Essencial: 3, Ultra: 1 }], ["Bruno", 2, { Maxi: 2 }],
  ]);
  assert.deepEqual(currentDistributionRows(current, "onboarding").map(row => row.totalClients), [1, 2]);
  assert.deepEqual(currentDistributionRows(current, "tracking").map(row => row.totalClients), [2, 0]);
  assert.deepEqual(currentDistributionRows(current, "conference").map(row => row.totalClients), [1, 0]);
  assert.equal(current.collaborators[0].displayName, "Bruno");
  assert.deepEqual(currentDistributionRows(board).map(row => row.totalClients), [0, 0]);
});
