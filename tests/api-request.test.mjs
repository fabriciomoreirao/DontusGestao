import assert from 'node:assert/strict';
import test from 'node:test';
import { apiRequestTimeoutMs, apiRequestSignal } from '../lib/api-request.ts';
import { GET, POST } from '../app/api/operations/route.ts';

test('o prazo padrão suporta rajadas e a configuração rejeita valores inválidos', () => {
  for (const value of ['', 'invalid', '0', '-1', '20', 'Infinity']) assert.equal(apiRequestTimeoutMs(value), 120_000);
  assert.equal(apiRequestTimeoutMs('180'), 180_000);
  assert.equal(apiRequestTimeoutMs('9999'), 600_000);
});

test('a desconexão do cliente cancela a chamada interna', () => {
  const controller = new AbortController();
  const signal = apiRequestSignal(new Request('http://localhost', { signal: controller.signal }));
  assert.equal(signal.aborted, false);
  controller.abort();
  assert.equal(signal.aborted, true);
});

test('a operação usa o novo prazo e preserva sessão, corpo e resposta em GET e POST', async t => {
  const budgets = [];
  t.mock.method(AbortSignal, 'timeout', ms => { budgets.push(ms); return new AbortController().signal; });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/api/operations'));
    assert.equal(options.headers.get('x-local-session'), 'colaborador/session');
    assert.equal(options.cache, 'no-store');
    if (options.method === 'POST') assert.deepEqual(JSON.parse(options.body), { action: 'createWorkItem' });
    return Response.json({ assignmentDirectory: { employees: [{ displayName: 'Ana' }] } }, { headers: { 'x-dontus-realtime-cursor': 'cursor' } });
  });
  for (const method of ['GET', 'POST']) {
    const response = await (method === 'GET' ? GET : POST)(new Request('http://localhost/api/operations', {
      method, headers: { cookie: 'dontus_session=colaborador%2Fsession' },
      body: method === 'POST' ? JSON.stringify({ action: 'createWorkItem' }) : undefined,
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-dontus-realtime-cursor'), 'cursor');
    assert.equal((await response.json()).assignmentDirectory.employees[0].displayName, 'Ana');
  }
  assert.equal(budgets.length, 2);
  assert.ok(budgets.every(ms => ms >= 120_000));
});

test('a operação preserva recusas de autorização e identifica expiração do novo prazo', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'Sem acesso' }, { status: 403 }));
  let response = await GET(new Request('http://localhost/api/operations'));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).detail, 'Sem acesso');
  fetch.mock.mockImplementation(async () => { throw new DOMException('Timeout', 'TimeoutError'); });
  response = await GET(new Request('http://localhost/api/operations'));
  assert.equal(response.status, 503);
  assert.match((await response.json()).detail, /tempo esperado/);
});
