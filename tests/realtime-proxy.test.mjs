import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { attachRealtimeProxy } from '../server/realtime-proxy.mjs';

async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; }
function upgrade(url, headers = {}) {
  const request = http.request(new URL('/api/realtime', url), { headers: { connection: 'Upgrade', upgrade: 'websocket',
    'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', 'sec-websocket-version': '13', origin: url, ...headers } });
  return { request, result: new Promise((resolve, reject) => {
    request.once('upgrade', (response, socket, head) => resolve({ status: response.statusCode, socket, head }));
    request.once('response', response => { response.resume(); resolve({ status: response.statusCode }); });
    request.once('error', reject); request.end();
  }) };
}
test('o upgrade usa a sessão existente, mantém o túnel e não permite origem externa', async t => {
  let received; const remotes = new Set();
  const api = http.createServer();
  api.on('upgrade', (request, socket) => {
    remotes.add(socket); socket.on('close', () => remotes.delete(socket)); received = request.headers;
    if (request.headers['x-local-session'] !== 'session-test') { socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); return; }
    const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.on('data', data => socket.write(data));
  });
  const apiUrl = await listen(api); const web = http.createServer(); attachRealtimeProxy(web, { apiUrl }); const webUrl = await listen(web);
  t.after(() => { for (const remote of remotes) remote.destroy(); api.close(); web.close(); });
  const { socket, status } = await upgrade(webUrl, { cookie: 'dontus_session=session-test', 'x-local-session': 'forged-header' }).result;
  t.after(() => socket?.destroy()); assert.equal(status, 101); assert.equal(received['x-local-session'], 'session-test');
  const echoed = once(socket, 'data', { signal: AbortSignal.timeout(3000) }); socket.write('tunnel-test');
  assert.equal(String((await echoed)[0]), 'tunnel-test'); socket.destroy();
  assert.equal((await upgrade(webUrl, { origin: 'https://outsider.invalid' }).result).status, 403);
  assert.equal((await upgrade(webUrl, { 'x-local-session': 'forged-header' }).result).status, 401);
  assert.equal(received['x-local-session'], undefined);
});
