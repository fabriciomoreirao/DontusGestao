import assert from 'node:assert/strict';
import test from 'node:test';
import { INTERNAL_CHAT_FILE_BYTES, internalChatUploadBatches, sendInternalChatFiles } from '../lib/internal-chat-upload.ts';
import { POST } from '../app/api/internal-chat-files/route.ts';

test('divide dez arquivos de até 50 MB em lotes limitados sem perder a ordem', () => {
  const files = Array.from({ length: 10 }, (_, id) => ({ id, size: INTERNAL_CHAT_FILE_BYTES }));
  const batches = internalChatUploadBatches(files);
  assert.equal(batches.length, 10);
  assert.deepEqual(batches.flat(), files);
  const mixed = [{ size: 20 * 1024 * 1024 }, { size: 30 * 1024 * 1024 }, { size: 1 }];
  assert.deepEqual(internalChatUploadBatches(mixed).map(batch => batch.length), [2, 1]);
  assert.deepEqual(internalChatUploadBatches([]), []);
});

test('recusa arquivos vazios, acima de 50 MB ou mais de dez antes de iniciar o envio', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected upload'); });
  for (const files of [[{ size: 0 }], [{ size: INTERNAL_CHAT_FILE_BYTES + 1 }], Array.from({ length: 11 }, () => ({ size: 1 }))])
    await assert.rejects(sendInternalChatFiles('room', files), /50 MB|10 arquivos/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('envia um vídeo maior que 1 MB pelo proxy preservando sessão, conteúdo e tipo', async t => {
  const bytes = new Uint8Array(2 * 1024 * 1024).fill(7);
  const file = new File([bytes], 'video.mp4', { type: 'video/mp4' });
  const form = new FormData(); form.append('files', file);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/api/internal-chats/room/attachments'));
    assert.equal(options.headers.get('x-local-session'), 'user/session');
    const [uploaded] = (await new Request(url, options).formData()).getAll('files');
    assert.equal(uploaded.name, file.name); assert.equal(uploaded.type, file.type);
    assert.deepEqual(new Uint8Array(await uploaded.arrayBuffer()), bytes);
    return Response.json({ ids: ['video-id'] }, { status: 201 });
  });
  const response = await POST(new Request('http://localhost/api/internal-chat-files?roomId=room', {
    method: 'POST', headers: { cookie: 'dontus_session=user%2Fsession' }, body: form,
  }));
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).ids, ['video-id']);
});

test('confirma somente os lotes enviados e interrompe ao falhar sem repetir arquivos anteriores', async t => {
  const files = ['a', 'b', 'c'].map(name => new File([name], `${name}.mp4`, { type: 'video/mp4' }));
  // Simulate large file sizes for batching without allocating 150 MB in this transport test.
  files.forEach(file => Object.defineProperty(file, 'size', { value: INTERNAL_CHAT_FILE_BYTES }));
  const sent = []; let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/internal-chat-files?roomId=room%2Fid');
    assert.equal(options.body.getAll('files')[0].name, `${String.fromCharCode(97 + calls)}.mp4`);
    return ++calls === 1 ? Response.json({ ids: ['a'] }, { status: 201 }) : Response.json({ detail: 'Sem acesso' }, { status: 403 });
  });
  await assert.rejects(sendInternalChatFiles('room/id', files, batch => sent.push(...batch)), /Sem acesso/);
  assert.deepEqual(sent, [files[0]]); assert.equal(calls, 2);
});

test('traduz o erro 413 de um proxy e mantém a mensagem de validação da API', async t => {
  const file = new File(['video'], 'video.mp4');
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('Payload Too Large', { status: 413 }));
  await assert.rejects(sendInternalChatFiles('room', [file]), /50 MB/);
  fetch.mock.mockImplementation(async () => Response.json({ detail: 'Este tipo de arquivo não é permitido no chat.' }, { status: 400 }));
  await assert.rejects(sendInternalChatFiles('room', [file]), /tipo de arquivo/);
});
