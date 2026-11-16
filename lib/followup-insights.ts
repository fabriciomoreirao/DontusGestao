import { customerSuccessScore } from './commission-rules.ts';

export type FollowupDetail = { track?: string; phase?: string; productVersion?: string; systemVersion?: string; version?: string; firstMeetingCompletedAt?: string; trainingCompletedAt?: string; singleAlignmentCompletedAt?: string; featuresBase?: unknown; featuresActive?: unknown; featuresPlus?: unknown };
export type FollowupHistoryEntry = { text: string; createdAt: string; actor?: string; kind?: string; type?: string };
const normalized = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export const isCriticalFollowup = (detail: FollowupDetail, defaultBase: string[] = []) => customerSuccessScore(detail, defaultBase) < 50;
export function pendingTrainingSteps(detail: FollowupDetail) {
  if (detail.track !== 'activation' || ['cancelled','cancelledWithoutTraining','unsuccessful'].includes(detail.phase || '') || detail.singleAlignmentCompletedAt) return [];
  return [!detail.firstMeetingCompletedAt ? 'Kick off' : '', !detail.trainingCompletedAt ? 'Treinamento' : ''].filter(Boolean);
}
export const hasTrainingPending = (detail: FollowupDetail) => pendingTrainingSteps(detail).length > 0;
export function followupVersion(detail: FollowupDetail, customer?: { product_version?: string }, commercial?: { version?: string; products?: { product?: string; plan?: string }[] }) {
  return [customer?.product_version, detail.productVersion, detail.systemVersion, detail.version, commercial?.version,
    commercial?.products?.find(product => /^(sistema|dontus|dontus one)$/.test(normalized(product.product)))?.plan].find(value => value?.trim()) || 'Não informada';
}
export function splitFollowupHistory(entries: FollowupHistoryEntry[]) {
  const comments: FollowupHistoryEntry[] = [], movements: FollowupHistoryEntry[] = [];
  for (const entry of [...entries].sort((a,b) => b.createdAt.localeCompare(a.createdAt))) {
    // Legacy follow-ups without a type were user comments; retain their contents.
    const kind = normalized(entry.kind || entry.type);
    (kind === '' || /comentario|mensagem|analise|follow.?up|ligacao|whatsapp|contato|observacao/.test(kind) ? comments : movements).push(entry);
  }
  return { comments, movements };
}
