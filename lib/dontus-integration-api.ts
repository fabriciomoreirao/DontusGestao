import { ACCESS_DENIED_EVENT, OUTSIDE_WORKING_HOURS } from "./access-session.ts";

export async function dontusIntegrationApi<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/dontus-integration/${path}`, {
    method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(40000)]) : AbortSignal.timeout(40000),
  });
  const result = await response.json();
  if (response.status === 401 && typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(ACCESS_DENIED_EVENT, { detail: result.code === "access_outside_hours" ? OUTSIDE_WORKING_HOURS : undefined }));
  if (!response.ok) throw new Error(result.detail || "Não foi possível consultar o Ambiente Dontus.");
  return result as T;
}
