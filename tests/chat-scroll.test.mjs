import assert from "node:assert/strict";
import test from "node:test";
import { isCloseToChatEnd, syncChatEnd } from "../lib/chat-scroll.ts";

test("abrir uma conversa posiciona no fim imediatamente, mesmo se a anterior estava no histórico", () => {
  const calls = [];
  const view = { scrollTop: 0, scrollHeight: 1600, clientHeight: 500, scrollTo: (position) => calls.push(position) };
  assert.equal(syncChatEnd(view, false, true), true);
  assert.deepEqual(calls, [{ top: 1600, behavior: "instant" }]);
});

test("quando a mídia amplia a conversa, só acompanha o fim se a pessoa já estava seguindo", () => {
  const calls = [];
  const view = { scrollTop: 500, scrollHeight: 1000, clientHeight: 500, scrollTo: (position) => calls.push(position) };
  const following = isCloseToChatEnd(view);
  assert.equal(following, true);
  view.scrollHeight = 1500;
  assert.equal(syncChatEnd(view, following, false), true);
  assert.deepEqual(calls, [{ top: 1500, behavior: "instant" }]);
  assert.equal(isCloseToChatEnd(view), false);
  assert.equal(syncChatEnd(view, false, false), false);
  assert.equal(calls.length, 1);
});
