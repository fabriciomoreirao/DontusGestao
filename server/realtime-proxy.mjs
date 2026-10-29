import http from 'node:http';
import https from 'node:https';

// Keep the session cookie on the same origin. Only the API receives its value.
export function attachRealtimeProxy(server, { apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:8080', rejectUnknown = true } = {}) {
  server.on('upgrade', (request, socket, head) => {
    const reject = status => socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, () => socket.destroy());
    socket.on('error', () => socket.destroy());
    if (request.url !== '/api/realtime') { if (rejectUnknown) reject('404 Not Found'); return; }
    try {
      const origin = new URL(request.headers.origin ?? '');
      if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== request.headers.host)
        return reject('403 Forbidden');
      const upstream = new URL('/api/realtime', apiUrl);
      const headers = {
        connection: 'Upgrade', upgrade: 'websocket',
        'sec-websocket-key': request.headers['sec-websocket-key'],
        'sec-websocket-version': request.headers['sec-websocket-version'],
        'x-user-email': encodeURIComponent(request.headers['oai-authenticated-user-email'] ?? process.env.LOCAL_USER_EMAIL ?? 'gestor@dontus.local'),
        'x-user-name': encodeURIComponent(process.env.LOCAL_USER_NAME ?? 'Gestor Dontus'),
        'x-user-role': encodeURIComponent(process.env.LOCAL_USER_ROLE ?? 'Administrador técnico'),
      };
      const token = request.headers.cookie?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
      if (token) headers['x-local-session'] = decodeURIComponent(token);
      const proxy = (upstream.protocol === 'https:' ? https : http).request(upstream, { headers });
      let upgraded = false;
      proxy.setTimeout(10_000, () => proxy.destroy());
      socket.on('close', () => proxy.destroy());
      proxy.on('error', () => { if (upgraded) socket.destroy(); else if (!socket.destroyed) reject('502 Bad Gateway'); });
      proxy.on('response', response => { response.resume(); reject(`${response.statusCode ?? 502} Upstream Response`); });
      proxy.on('upgrade', (response, remote, remoteHead) => {
        upgraded = true;
        proxy.setTimeout(0);
        if (socket.destroyed) { remote.destroy(); return; }
        socket.write('HTTP/1.1 101 Switching Protocols\r\n');
        for (const [name, value] of Object.entries(response.headers))
          if (value !== undefined) socket.write(`${name}: ${value}\r\n`);
        socket.write('\r\n');
        if (remoteHead.length) socket.write(remoteHead);
        if (head.length) remote.write(head);
        remote.on('error', () => socket.destroy());
        remote.on('close', () => socket.destroy());
        remote.on('end', () => socket.destroy());
        socket.on('close', () => remote.destroy());
        socket.on('end', () => remote.destroy());
        socket.pipe(remote).pipe(socket);
      });
      proxy.end();
    } catch { reject('400 Bad Request'); }
  });
}
