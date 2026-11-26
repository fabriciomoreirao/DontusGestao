import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeInternalChat,
  chatUnreadTotals,
} from "../lib/internal-chat-state.ts";

const room = (id, unreadCount = 0, fields = {}) => ({
  id,
  unreadCount,
  isGroup: false,
  isArchived: false,
  lastMessageAt: "2026-11-13T12:00:00Z",
  messages: [],
  ...fields,
});
const state = (rooms, snapshotAt = "2026-11-13T12:00:00Z", extra = {}) => ({
  currentUserId: "ana",
  users: [],
  rooms,
  snapshotAt,
  ...extra,
});

test("a confirmação de envio preserva o histórico, não duplica mensagens e reaproveita as linhas sem alterações", () => {
  const previous = {
    id: "old",
    createdAt: "2026-11-13T12:00:00Z",
    body: "Histórico",
  };
  const next = {
    id: "new",
    createdAt: "2026-11-13T12:01:00Z",
    body: "Nova mensagem",
  };
  const initial = state([room("a", 0, { messages: [previous] })]);
  const patch = state(
    [room("a", 0, { messages: [next], messagesPartial: true })],
    "2026-11-13T12:01:01Z",
    { isPartial: true },
  );
  const merged = mergeInternalChat(initial, patch);
  assert.deepEqual(merged.rooms[0].messages, [previous, next]);
  assert.equal(merged.rooms[0].messages[0], previous);
  const repeated = mergeInternalChat(merged, patch);
  assert.equal(repeated.rooms[0].messages.length, 2);
  const full = mergeInternalChat(
    repeated,
    state(
      [room("a", 0, { messages: [{ ...previous }, { ...next }] })],
      "2026-11-13T12:01:02Z",
    ),
  );
  assert.equal(full.rooms[0].messages[0], previous);
  const edited = { ...next, body: "Texto editado" };
  const changed = mergeInternalChat(
    full,
    state(
      [room("a", 0, { messages: [edited], messagesPartial: true })],
      "2026-11-13T12:01:03Z",
      { isPartial: true },
    ),
  );
  assert.equal(changed.rooms[0].messages.length, 2);
  assert.equal(changed.rooms[0].messages[1].body, "Texto editado");
});

test("cada aba soma mensagens e inclui conversas e grupos arquivados apenas em arquivadas", () => {
  assert.deepEqual(
    chatUnreadTotals([
      room("a", 3),
      room("b", 2),
      room("g", 7, { isGroup: true }),
      room("arq", 4, { isArchived: true }),
      room("ga", 2, { isGroup: true, isArchived: true }),
      room("read"),
    ]),
    { conversations: 5, groups: 7, archived: 6 },
  );
});
test("resposta de uma conversa mantém as demais mensagens e remove grupos após perder o acesso", () => {
  const initial = state([room("a"), room("b", 4)]);
  const updated = mergeInternalChat(
    initial,
    state([room("a", 2)], undefined, { isPartial: true }),
  );
  assert.equal(updated.rooms.length, 2);
  assert.equal(updated.rooms.find((r) => r.id === "b").unreadCount, 4);
  const left = mergeInternalChat(
    updated,
    state([], "2026-11-13T12:01:00Z", {
      isPartial: true,
      removedRoomIds: ["b"],
    }),
  );
  assert.deepEqual(
    left.rooms.map((r) => r.id),
    ["a"],
  );
});
test("respostas atrasadas não apagam mensagens nem reativam grupos removidos", () => {
  const initial = state([room("a")]);
  const updated = mergeInternalChat(
    initial,
    state([room("a", 2)], "2026-11-13T12:02:00Z", { isPartial: true }),
  );
  const delayed = mergeInternalChat(
    updated,
    state([room("a", 1), room("b", 3)], "2026-11-13T12:01:00Z"),
  );
  assert.equal(delayed.rooms.find((r) => r.id === "a").unreadCount, 2);
  assert.equal(delayed.rooms.find((r) => r.id === "b").unreadCount, 3);
  const removed = mergeInternalChat(
    delayed,
    state([], "2026-11-13T12:03:00Z", {
      isPartial: true,
      removedRoomIds: ["a"],
    }),
  );
  const stale = mergeInternalChat(
    removed,
    state([room("a")], "2026-11-13T12:02:00Z", { isPartial: true }),
  );
  assert.ok(!stale.rooms.some((r) => r.id === "a"));
});
test("snapshot completo atual remove conversas sem acesso e troca de usuário descarta dados anteriores", () => {
  const initial = state([room("a"), room("b")]);
  assert.deepEqual(
    mergeInternalChat(
      initial,
      state([room("a")], "2026-11-13T12:03:00Z"),
    ).rooms.map((r) => r.id),
    ["a"],
  );
  const another = state([room("c")], undefined, { currentUserId: "bia" });
  assert.equal(mergeInternalChat(initial, another), another);
});
