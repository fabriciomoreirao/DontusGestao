import assert from "node:assert/strict";
import test from "node:test";
import { paginate } from "../lib/pagination.ts";

test("divide todos os registros em páginas de dez sem alterar a lista original", () => {
  const rows = Array.from({ length: 23 }, (_, id) => ({ id }));
  const pages = [1, 2, 3].map((page) => paginate(rows, page));
  assert.deepEqual(
    pages.map((page) => page.items.length),
    [10, 10, 3],
  );
  assert.deepEqual(
    pages.map((page) => [page.start, page.end, page.total]),
    [
      [1, 10, 23],
      [11, 20, 23],
      [21, 23, 23],
    ],
  );
  assert.deepEqual(
    pages.flatMap((page) => page.items),
    rows,
  );
  assert.equal(rows.length, 23);
});

test("pesquisa e filtros são aplicados antes da paginação e encontram registros posteriores", () => {
  const rows = Array.from({ length: 1050 }, (_, index) => ({
    id: index + 1,
    group: index % 2,
  }));
  const filtered = rows.filter((row) => row.id >= 1000 && row.group === 1);
  assert.equal(paginate(filtered, 1).total, filtered.length);
  assert.ok(paginate(filtered, 1).items.every((row) => row.id >= 1000));
  assert.equal(
    paginate(
      rows.filter((row) => row.id === 1050),
      1,
    ).items[0].id,
    1050,
  );
});

test("ajusta páginas após exclusões e trata listas vazias e parâmetros inválidos", () => {
  assert.deepEqual(paginate([], 5), {
    items: [],
    page: 1,
    pages: 1,
    total: 0,
    start: 0,
    end: 0,
  });
  assert.equal(paginate(Array.from({ length: 11 }), 9).page, 2);
  assert.equal(paginate([1, 2], -3).page, 1);
  assert.equal(paginate([1, 2], NaN, 0).pages, 1);
});
