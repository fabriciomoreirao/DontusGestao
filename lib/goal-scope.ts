export type GoalFunnel = { id: string; name: string };
export type GoalModule = { productId: string; productName: string; plan: string };
export type GoalScope = {
  funnelId?: string; funnelName?: string; funnels?: GoalFunnel[];
  moduleScope?: 'moduleFunnels'; modules?: GoalModule[];
};
export type GoalScopeCatalog = { id: string; name: string; catalog: string; description: string; active: boolean };
export type GoalModuleOption = GoalModule & { key: string; label: string };
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const detail = (raw: string): Record<string, unknown> => { try { return JSON.parse(raw) || {}; } catch { return {}; } };
const isModuleName = (name: unknown) => /\bmodulos?\b/.test(normalize(name));

export function selectedGoalFunnels(scope: GoalScope): GoalFunnel[] {
  const values = Array.isArray(scope.funnels) ? scope.funnels : scope.funnelId || scope.funnelName ? [{ id: scope.funnelId || '', name: scope.funnelName || '' }] : [];
  return [...new Map(values.filter(value => value && (value.id || value.name)).map(value => [normalize(value.id || value.name), value])).values()];
}
export function goalFunnelName(scope: GoalScope, catalogs: GoalScopeCatalog[] = []) {
  return selectedGoalFunnels(scope).map(funnel => catalogs.find(entry => entry.catalog === 'funnelStage' && entry.id === funnel.id)?.name || funnel.name).filter(Boolean).join(', ');
}
export function isModuleGoalFunnel(funnel: GoalFunnel, catalogs: GoalScopeCatalog[] = []) {
  return isModuleName(funnel.name) || isModuleName(catalogs.find(entry => entry.catalog === 'funnelStage' && entry.id === funnel.id)?.name);
}
function matchesFunnel(funnel: GoalFunnel, source: Record<string, unknown>, catalogs: GoalScopeCatalog[]) {
  if (funnel.id && source.funnelId) return normalize(funnel.id) === normalize(source.funnelId);
  const currentName = catalogs.find(entry => entry.catalog === 'funnelStage' && entry.id === funnel.id)?.name;
  return [funnel.name, currentName].some(name => name && normalize(name) === normalize(source.funnel));
}
export function matchesGoalFunnel(scope: GoalScope, source: Record<string, unknown>, catalogs: GoalScopeCatalog[]) {
  const selected = selectedGoalFunnels(scope);
  return !selected.length || selected.some(funnel => matchesFunnel(funnel, source, catalogs));
}
export const goalModuleKey = (selection: GoalModule) => `${selection.productId || normalize(selection.productName)}:${normalize(selection.plan)}`;
export function goalModuleOptions(catalogs: GoalScopeCatalog[]): GoalModuleOption[] {
  return catalogs.filter(entry => entry.catalog === 'commercialProduct' && entry.active && isModuleName(entry.name)).flatMap(entry => {
    const plans = detail(entry.description).plans;
    const rows = Array.isArray(plans) ? plans.filter(plan => plan && typeof plan === 'object' && plan.active !== false && String(plan.name || '').trim()) : [];
    return (Array.isArray(plans) && plans.length ? rows : [{ name: '' }]).map(plan => {
      const selection = { productId: entry.id, productName: entry.name, plan: String(plan.name).trim() };
      return { ...selection, key: goalModuleKey(selection), label: selection.plan || selection.productName };
    });
  });
}
export function goalModuleName(scope: GoalScope) {
  return scope.moduleScope ? scope.modules?.length ? scope.modules.map(selection => selection.plan || selection.productName).join(', ') : 'Todos os módulos' : '';
}
function sourceIsModule(source: Record<string, unknown>, catalogs: GoalScopeCatalog[]) {
  return isModuleName(source.product || source.productName || source.name)
    || isModuleName(catalogs.find(entry => entry.catalog === 'commercialProduct' && entry.id === source.productId)?.name);
}
function matchesModule(selection: GoalModule, source: Record<string, unknown>, catalogs: GoalScopeCatalog[]) {
  const currentName = catalogs.find(entry => entry.catalog === 'commercialProduct' && entry.id === selection.productId)?.name;
  const sameProduct = selection.productId && source.productId ? normalize(selection.productId) === normalize(source.productId)
    : [selection.productName, currentName].some(name => name && normalize(name) === normalize(source.product || source.productName || source.name));
  return sameProduct && (!selection.plan || normalize(selection.plan) === normalize(source.plan));
}
export function goalSaleValueCents(scope: GoalScope, source: Record<string, unknown>, totalCents: number, catalogs: GoalScopeCatalog[] = []): number | null {
  if (!matchesGoalFunnel(scope, source, catalogs)) return null;
  const moduleFunnel = isModuleName(source.funnel)
    || selectedGoalFunnels(scope).some(funnel => isModuleGoalFunnel(funnel, catalogs) && matchesFunnel(funnel, source, catalogs))
    || isModuleName(catalogs.find(entry => entry.catalog === 'funnelStage' && entry.id === source.funnelId)?.name);
  if (!scope.moduleScope || scope.moduleScope === 'moduleFunnels' && !moduleFunnel) return totalCents;
  const products = Array.isArray(source.products) ? source.products.filter((product): product is Record<string, unknown> => product && typeof product === 'object') : [];
  const matching = products.filter(product => scope.modules?.length ? scope.modules.some(selection => matchesModule(selection, product, catalogs)) : sourceIsModule(product, catalogs));
  if (!matching.length) return null;
  return matching.reduce((sum, product) => {
    const unit = Number('unitValue' in product ? product.unitValue : product.value);
    const quantity = Number(product.quantity);
    const amount = (Number.isFinite(unit) ? Math.max(0, unit) : 0) * (Number.isFinite(quantity) ? Math.max(1, quantity) : 1);
    return sum + Math.round((amount + Number.EPSILON * Math.max(1, amount)) * 100);
  }, 0);
}
