import { headers } from "next/headers";

export type AppUser = {
  email: string;
  displayName: string;
  role: string;
  department: string;
};

export async function currentUser(): Promise<AppUser> {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email") ?? "gestor@dontus.local";
  const encodedName = requestHeaders.get("oai-authenticated-user-full-name");
  const encoding = requestHeaders.get("oai-authenticated-user-full-name-encoding");
  let displayName = "Gestor Dontus";
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try { displayName = decodeURIComponent(encodedName); } catch { /* fallback seguro */ }
  }
  return { email, displayName, role: "Administrador técnico", department: "Gestão" };
}
