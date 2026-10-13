export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");

export async function GET(request: Request, { params }: { params: Promise<{ requestId: string; attachmentId: string }> }) {
  const { requestId, attachmentId } = await params;
  const headers = new Headers(request.headers);
  const localSession = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
  if (localSession) headers.set("x-local-session", decodeURIComponent(localSession));
  headers.delete("host");
  const response = await fetch(`${apiBase()}/api/service-request-files/${encodeURIComponent(requestId)}/${encodeURIComponent(attachmentId)}`, { headers, cache: "no-store" });
  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/octet-stream",
      "content-disposition": response.headers.get("content-disposition") ?? "inline",
    },
  });
}
