export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ detail: 'Informe a conversa.' }, { status: 400 }); }
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!guid.test(body?.roomId) || !guid.test(body?.sessionId) || typeof body?.isTyping !== 'boolean') return new Response(null, { status: 400 });
  const headers = new Headers({ 'content-type': 'application/json',
    'x-user-email': encodeURIComponent(request.headers.get('oai-authenticated-user-email') ?? process.env.LOCAL_USER_EMAIL ?? 'gestor@dontus.local'),
    'x-user-name': encodeURIComponent(process.env.LOCAL_USER_NAME ?? 'Gestor Dontus'), 'x-user-role': encodeURIComponent(process.env.LOCAL_USER_ROLE ?? 'Administrador técnico') });
  const session = request.headers.get('cookie')?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
  if (session) headers.set('x-local-session', decodeURIComponent(session));
  try {
    const response = await fetch(`${(process.env.API_INTERNAL_URL ?? 'http://localhost:8080').replace(/\/$/, '')}/api/internal-chats/typing`, {
      method: 'POST', headers, body: JSON.stringify({ roomId: body.roomId, sessionId: body.sessionId, isTyping: body.isTyping }), cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(5_000)]) });
    return new Response(null, { status: response.status, headers: { 'cache-control': 'no-store' } });
  } catch { return new Response(null, { status: 503 }); }
}
