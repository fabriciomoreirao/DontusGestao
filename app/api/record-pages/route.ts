import { apiRequestSignal } from "@/lib/api-request";
import { apiResponse } from "@/lib/api-response";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("host");
  headers.delete("content-length");
  const session = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
  if (session) headers.set("x-local-session", decodeURIComponent(session));
  headers.set(
    "x-user-email",
    encodeURIComponent(
      request.headers.get("oai-authenticated-user-email") ??
        process.env.LOCAL_USER_EMAIL ??
        "gestor@dontus.local",
    ),
  );
  headers.set(
    "x-user-name",
    encodeURIComponent(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"),
  );
  headers.set(
    "x-user-role",
    encodeURIComponent(process.env.LOCAL_USER_ROLE ?? "Administrador técnico"),
  );
  try {
    const response = await fetch(
      `${(process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "")}/api/record-pages`,
      {
        method: "POST",
        headers,
        body: await request.text(),
        cache: "no-store",
        signal: apiRequestSignal(request),
      },
    );
    return apiResponse(request, response, {
      "cache-control": "private, no-store",
    });
  } catch {
    return Response.json(
      { detail: "Não foi possível carregar os registros. Tente novamente." },
      { status: 503 },
    );
  }
}
