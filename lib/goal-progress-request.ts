type GoalRecord = { id: string; module: string; version: number };
const sources = new Set(["goals", "commercial", "referrals", "cs", "lia"]);
export function goalProgressRevision(items: readonly GoalRecord[]) {
  return items
    .filter((item) => sources.has(item.module))
    .map((item) => `${item.id}:${item.version}`)
    .sort()
    .join("|");
}
