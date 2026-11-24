import { customerSuccessScore } from './commission-rules.ts';

export type FeatureSnapshot = { createdAt: string; score: number; previousScore: number; featuresActive?: string[]; featuresPlus?: string[]; summary?: string };
export type FeatureJourney = { phase?: string; track?: string; clientId?: string; featuresBase?: string[]; featuresActive?: string[]; featuresPlus?: string[]; scoreEvolution?: FeatureSnapshot[] };
export const csPhaseLabels: Record<string,string> = { validation:'Validação', onboarding:'Onboarding', tracking:'Acompanhamento', conference:'Conferência', finished:'Finalizados', unsuccessful:'Finalizados sem sucesso', cancelled:'Cancelados', cancelledWithoutTraining:'Cancelado sem treinamento' };
export function featureNames(values: unknown): string[] {
  return Array.isArray(values) ? [...new Set(values.filter((v):v is string=>typeof v==='string').flatMap(v=>v.split(',')).map(v=>v.trim()).filter(Boolean))] : [];
}
const key = (v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
export function featureProgress(journey: FeatureJourney, defaultBase: string[] = []) {
  const base=featureNames(journey.featuresBase).length?featureNames(journey.featuresBase):featureNames(defaultBase);
  const active=featureNames(journey.featuresActive);
  const used=new Set(active.map(key));
  const history=(journey.scoreEvolution??[]).filter(s=>Number.isFinite(s.score)&&Number.isFinite(s.previousScore)&&Number.isFinite(Date.parse(s.createdAt))).slice().sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  const score=customerSuccessScore(journey,base);
  const adoption=base.length?Math.round(base.filter(f=>used.has(key(f))).length/base.length*100):null;
  const first=history[0];
  const previousFeatures=first?new Set(featureNames(first.featuresActive).map(key)):null;
  return {base,active,plus:featureNames(journey.featuresPlus),pending:base.filter(f=>!used.has(key(f))),adoption,score,history,delta:first?score-first.previousScore:null,added:previousFeatures?active.filter(f=>!previousFeatures.has(key(f))):[]};
}
