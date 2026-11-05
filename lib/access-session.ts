export const ACCESS_DENIED_EVENT = "dontus:access-denied";
export const OUTSIDE_WORKING_HOURS = "Acesso proibido fora do expediente.";

export async function accessDeniedMessage(response: Response) {
  try { const body = await response.json(); return body.code === "access_outside_hours" ? OUTSIDE_WORKING_HOURS : undefined; }
  catch { return undefined; }
}
