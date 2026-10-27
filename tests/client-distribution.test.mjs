import test from "node:test";
import assert from "node:assert/strict";
import { distributionQueue, distributionWarning, orderedDistributionCollaborators } from "../lib/client-distribution.ts";

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
