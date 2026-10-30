import test from "node:test";
import assert from "node:assert/strict";
import { dontusUsersPage } from "../lib/dontus-users.ts";

const users = Array.from({ length: 27 }, (_, index) => ({ id: index + 1, name: index === 24 ? "Cláudia Última" : `Pessoa ${index + 1}`,
  username: `login${index + 1}`, email: `pessoa${index + 1}@test.local`, isSupervisor: index % 2 === 0 }));

test("a busca alcança usuários de qualquer página antes de paginar o resultado", () => {
  const result = dontusUsersPage(users, "claudia ultima", "", 3);
  assert.deepEqual(result.items.map(user => user.id), [25]);
  assert.equal(result.page, 1); assert.equal(result.total, 1);
  assert.deepEqual(dontusUsersPage(users, "pessoa27@test.local", "", 1).items.map(user => user.id), [27]);
  assert.deepEqual(dontusUsersPage(users, "login26", "common", 1).items.map(user => user.id), [26]);
  assert.equal(dontusUsersPage(users, "login26", "supervisor", 1).total, 0);
});

test("as páginas contêm dez usuários e preservam a última página parcial e o total dos filtros", () => {
  const first = dontusUsersPage(users, "", "", 1), second = dontusUsersPage(users, "", "", 2), last = dontusUsersPage(users, "", "", 99);
  assert.deepEqual(first.items.map(user => user.id), [1,2,3,4,5,6,7,8,9,10]);
  assert.deepEqual(second.items.map(user => user.id), [11,12,13,14,15,16,17,18,19,20]);
  assert.equal(last.page, 3); assert.equal(last.items.length, 7); assert.equal(last.start, 21); assert.equal(last.end, 27);
  const supervisors = dontusUsersPage(users, "", "supervisor", 2);
  assert.equal(supervisors.total, 14); assert.equal(supervisors.items.length, 4);
  const empty = dontusUsersPage(users, "inexistente", "", 3);
  assert.equal(empty.page, 1); assert.equal(empty.start, 0); assert.equal(empty.end, 0);
  assert.equal(users.length, 27);
});
