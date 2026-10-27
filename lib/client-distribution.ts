export type DistributionCollaborator = {
  userId: string; displayName: string; department: string; photoDataUrl: string;
  totalClients: number; activeClients: number; clientsByVersion: Record<string, number>; lastAssignedAt: string | null;
};
export type DistributionQueue = {
  version: string; suggestedUserId: string | null; lastRecipientUserId: string | null;
  lastRecipientName: string | null; lastAssignedAt: string | null; orderedUserIds: string[];
};
export type ClientDistribution = {
  track: string; updatedAt: string; collaborators: DistributionCollaborator[];
  queues: DistributionQueue[]; pendingClients: Array<{workItemId: string; version: string}>;
};
export const unknownClientVersion = "Versão não informada";
export const distributionQueue = (board: ClientDistribution | undefined, version: string) => board?.queues.find(queue => queue.version === version);
export function orderedDistributionCollaborators(board: ClientDistribution, version: string) {
  const queue = distributionQueue(board, version);
  const positions = new Map(queue?.orderedUserIds.map((id, index) => [id, index]));
  return board.collaborators.slice().sort((a, b) => (positions.get(a.userId) ?? Infinity) - (positions.get(b.userId) ?? Infinity));
}
export function distributionWarning(board: ClientDistribution | undefined, version: string, selectedUserId: string) {
  const queue = distributionQueue(board, version);
  if (!queue || !selectedUserId || queue.suggestedUserId === selectedUserId) return "";
  const next = board?.collaborators.find(employee => employee.userId === queue.suggestedUserId)?.displayName ?? "o próximo colaborador da fila";
  return queue.lastRecipientUserId === selectedUserId
    ? `O último cliente da versão ${version} já foi enviado para este colaborador. A sugestão agora é ${next}.`
    : `Esta escolha está fora da sugestão de rodízio para ${version}. Para equilibrar as carteiras, o próximo sugerido é ${next}.`;
}
