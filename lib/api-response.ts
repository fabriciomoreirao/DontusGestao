/** Stream large API payloads compressed, without buffering another JSON copy. */
export function apiResponse(request: Request, upstream: Response, extraHeaders: Record<string, string> = {}) {
  const headers = new Headers({
    "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  });
  const acceptsGzip = (request.headers.get("accept-encoding") ?? "").split(",").some(entry => {
    const [encoding, ...options] = entry.trim().toLowerCase().split(";");
    const quality = options.find(option => option.trim().startsWith("q="));
    return encoding === "gzip" && (!quality || Number(quality.trim().slice(2)) > 0);
  });
  let body = upstream.body;
  if (body && acceptsGzip && upstream.ok) {
    body = body.pipeThrough(new CompressionStream("gzip"));
    headers.set("content-encoding", "gzip");
  }
  headers.set("vary", "Accept-Encoding");
  return new Response(body, { status: upstream.status, headers });
}
