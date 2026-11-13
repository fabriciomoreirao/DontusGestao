import test from 'node:test';
import assert from 'node:assert/strict';
import { liaFormProxy } from '../lib/lia-form-proxy.ts';

test('public form proxy forwards multipart files as binary without authentication headers', async () => {
  const original = globalThis.fetch;
  const form = new FormData();
  form.set('answers', JSON.stringify({ answers: { name: 'Maria' } }));
  form.append('file:document', new File([new Uint8Array([0, 1, 2, 255])], 'dados.pdf', { type: 'application/pdf' }));
  let called = false;
  globalThis.fetch = async (url, options) => {
    called = true;
    assert.match(url, /public-lia-forms\/token$/);
    assert.equal(options.headers.has('content-type'), false);
    assert.equal(options.headers.has('x-local-session'), false);
    assert.equal(options.body.get('file:document').name, 'dados.pdf');
    assert.deepEqual(new Uint8Array(await options.body.get('file:document').arrayBuffer()), new Uint8Array([0, 1, 2, 255]));
    assert.deepEqual(JSON.parse(options.body.get('answers')), { answers: { name: 'Maria' } });
    return Response.json({ submittedAt: '2026-11-13T12:00:00Z' });
  };
  try {
    const response = await liaFormProxy(new Request('http://localhost/api/public-lia-forms/token', { method: 'POST', body: form }), '/api/public-lia-forms/token', false);
    assert.equal(response.status, 200); assert.equal(called, true);
  } finally { globalThis.fetch = original; }
});

test('authenticated downloads preserve attachment headers and do not forward the session to external storage', async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async (_url, options) => {
    count++;
    assert.equal(options.headers.get('x-local-session'), 'session-test');
    assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { location: 'https://storage.example.test/signed-file' } });
  };
  try {
    const response = await liaFormProxy(new Request('http://localhost/api/lia-forms/attachments/id', { headers: { cookie: 'dontus_session=session-test' } }), '/api/lia-forms/attachments/id', true);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://storage.example.test/signed-file');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(count, 1);
  } finally { globalThis.fetch = original; }
});

test('database file downloads keep the original bytes and file name', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([0, 255, 3]), { headers: { 'content-type': 'video/mp4', 'content-disposition': 'attachment; filename=video.mp4', 'content-length': '3' } });
  try {
    const response = await liaFormProxy(new Request('http://localhost/api/lia-forms/attachments/id'), '/api/lia-forms/attachments/id', true);
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename=video.mp4');
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([0, 255, 3]));
  } finally { globalThis.fetch = original; }
});
