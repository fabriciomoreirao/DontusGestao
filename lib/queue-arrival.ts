export const QUEUE_ARRIVAL_EVENT = 'dontus:queue-arrival';
export const QUEUE_ARRIVAL_DURATION = 30_000;
export type QueueArrival = { id: string; customerName: string; clientId: string; department: string };

export function queueArrivals(notifications: Array<{ id: string; module: string; category: string; sourceId?: string; title: string }>, items: Array<{ id: string; customer_name?: string; team: string; description: string }>): QueueArrival[] {
  return notifications.filter(entry => entry.module === 'waitingQueue' && entry.category === 'arrival').map(entry => {
    const item = items.find(item => item.id === entry.sourceId);
    let detail: Record<string, unknown> = {};
    try { detail = JSON.parse(item?.description || '{}') || {}; } catch { /* Legacy queue entries may only have a title. */ }
    return { id: entry.id, customerName: item?.customer_name || String(detail.clientName || entry.title.replace(/ chegou para você$/, '')),
      clientId: String(detail.clientCode || ''), department: String(detail.departmentName || item?.team || 'Seu setor') };
  });
}
