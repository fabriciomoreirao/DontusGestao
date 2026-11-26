import { apiRequestSignal } from "@/lib/api-request";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const headers = new Headers({ accept: "application/json" });
    const session = request.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
    if (session) headers.set("x-local-session", decodeURIComponent(session));
    const email = request.headers.get("oai-authenticated-user-email");
    if (email) headers.set("oai-authenticated-user-email", email);
    headers.set(
      "x-user-email",
      encodeURIComponent(
        email ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local",
      ),
    );
    headers.set(
      "x-user-name",
      encodeURIComponent(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"),
    );
    const response = await fetch(
      `${(process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "")}/api/goals/progress`,
      {
        headers,
        cache: "no-store",
        signal: apiRequestSignal(request),
      },
    );
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return Response.json(
      { detail: "Não foi possível calcular as metas. Tente novamente." },
      { status: 503 },
    );
  }
}
