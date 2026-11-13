type Room = { id: string; isGroup: boolean; isArchived: boolean; unreadCount: number; lastMessageAt: string };
type ChatState<R extends Room> = { currentUserId: string; users: unknown[]; rooms: R[]; isPartial?: boolean; removedRoomIds?: string[]; snapshotAt?: string; roomSnapshotTimes?: Record<string, string>; fullSnapshotAt?: string };

export function mergeInternalChat<R extends Room, T extends ChatState<R>>(current: T | null | undefined, patch: T): T {
  if (!current || current.currentUserId !== patch.currentUserId) return patch;
  const at = patch.snapshotAt ?? "";
  const fullAt = current.fullSnapshotAt ?? (!current.isPartial ? current.snapshotAt ?? "" : "");
  const times = { ...Object.fromEntries(current.rooms.map(room => [room.id, current.snapshotAt ?? ""])), ...current.roomSnapshotTimes };
  const rooms = new Map(current.rooms.map(room => [room.id, room]));
  const removed = new Set(patch.removedRoomIds);
  const incomingIds = new Set(patch.rooms.map(room => room.id));
  if (!patch.isPartial) for (const room of current.rooms) if (!incomingIds.has(room.id)) removed.add(room.id);
  const isCurrent = (id: string) => !at || at >= (times[id] ?? fullAt);
  for (const id of removed) if (isCurrent(id)) { rooms.delete(id); times[id] = at; }
  for (const room of patch.rooms) if (!removed.has(room.id) && isCurrent(room.id)) { rooms.set(room.id, room); times[room.id] = at; }
  return { ...patch, users: at && at < (current.snapshotAt ?? "") ? current.users : patch.users,
    snapshotAt: at > (current.snapshotAt ?? "") ? at : current.snapshotAt,
    isPartial: false, removedRoomIds: [], roomSnapshotTimes: times, fullSnapshotAt: !patch.isPartial && at > fullAt ? at : fullAt,
    rooms: [...rooms.values()].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)) };
}

export function chatUnreadTotals(rooms: Room[]) {
  return rooms.reduce((totals, room) => {
    totals[room.isArchived ? "archived" : room.isGroup ? "groups" : "conversations"] += room.unreadCount;
    return totals;
  }, { conversations: 0, groups: 0, archived: 0 });
}
