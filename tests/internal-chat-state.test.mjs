import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeInternalChat, chatUnreadTotals } from '../lib/internal-chat-state.ts';

const room = (id, unreadCount = 0, fields = {}) => ({ id, unreadCount, isGroup: false, isArchived: false, lastMessageAt: '2026-11-13T12:00:00Z', messages: [], ...fields });
const state = (rooms, snapshotAt = '2026-11-13T12:00:00Z', extra = {}) => ({ currentUserId: 'ana', users: [], rooms, snapshotAt, ...extra });

test('cada aba soma mensagens e inclui conversas e grupos arquivados apenas em arquivadas', () => {
  assert.deepEqual(chatUnreadTotals([room('a', 3), room('b', 2), room('g', 7, { isGroup: true }),
    room('arq', 4, { isArchived: true }), room('ga', 2, { isGroup: true, isArchived: true }), room('read')]),
  { conversations: 5, groups: 7, archived: 6 });
});
test('resposta de uma conversa mantém as demais mensagens e remove grupos após perder o acesso', () => {
  const initial = state([room('a'), room('b', 4)]);
  const updated = mergeInternalChat(initial, state([room('a', 2)], undefined, { isPartial: true }));
  assert.equal(updated.rooms.length, 2); assert.equal(updated.rooms.find(r => r.id === 'b').unreadCount, 4);
  const left = mergeInternalChat(updated, state([], '2026-11-13T12:01:00Z', { isPartial: true, removedRoomIds: ['b'] }));
  assert.deepEqual(left.rooms.map(r => r.id), ['a']);
});
test('respostas atrasadas não apagam mensagens nem reativam grupos removidos', () => {
  const initial = state([room('a')]);
  const updated = mergeInternalChat(initial, state([room('a', 2)], '2026-11-13T12:02:00Z', { isPartial: true }));
  const delayed = mergeInternalChat(updated, state([room('a', 1), room('b', 3)], '2026-11-13T12:01:00Z'));
  assert.equal(delayed.rooms.find(r => r.id === 'a').unreadCount, 2);
  assert.equal(delayed.rooms.find(r => r.id === 'b').unreadCount, 3);
  const removed = mergeInternalChat(delayed, state([], '2026-11-13T12:03:00Z', { isPartial: true, removedRoomIds: ['a'] }));
  const stale = mergeInternalChat(removed, state([room('a')], '2026-11-13T12:02:00Z', { isPartial: true }));
  assert.ok(!stale.rooms.some(r => r.id === 'a'));
});
test('snapshot completo atual remove conversas sem acesso e troca de usuário descarta dados anteriores', () => {
  const initial = state([room('a'), room('b')]);
  assert.deepEqual(mergeInternalChat(initial, state([room('a')], '2026-11-13T12:03:00Z')).rooms.map(r => r.id), ['a']);
  const another = state([room('c')], undefined, { currentUserId: 'bia' });
  assert.equal(mergeInternalChat(initial, another), another);
});
