import { commissionDate } from "./commission-rules.ts";

export const LIA_FINAL_FOLLOWUP_DAYS = 3;
export function liaFinalFollowupDays(startedAt: string | undefined, now = new Date()) {
  const start = commissionDate(startedAt);
  const today = commissionDate(now.toISOString());
  return start && today ? Math.max(0, Math.round((Date.parse(today) - Date.parse(start)) / 86400000)) : 0;
}
