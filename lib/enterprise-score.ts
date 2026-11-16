type Feature = { name: string; status: string; category: string };
type Unit = { active?: boolean; features: Feature[]; trackingScore?: number };
const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function enterpriseUnitScore(unit: Unit, featureUniverse: string[] = []) {
  if (typeof unit.trackingScore === "number" && Number.isFinite(unit.trackingScore)) return unit.trackingScore;
  const universe = new Set((featureUniverse.length ? featureUniverse : unit.features.map(feature => feature.name)).map(normalized).filter(Boolean));
  if (!universe.size) return 0;
  const inUse = new Set(unit.features.filter(feature => /em utilizacao|configurada/.test(normalized(feature.status)) || /ativa/.test(normalized(feature.category))).map(feature => normalized(feature.name)).filter(name => universe.has(name)));
  return Math.round(inUse.size / universe.size * 100);
}

export function enterpriseHealthScore(units: Unit[], featureUniverse: string[] = []) {
  const active = units.filter(unit => unit.active !== false);
  return active.length ? Math.round(active.reduce((sum, unit) => sum + enterpriseUnitScore(unit, featureUniverse), 0) / active.length) : 0;
}
