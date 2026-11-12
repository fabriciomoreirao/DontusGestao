type Lead = {stageEnteredAt?:string;wonAt?:string;closedAt?:string;follows?:Array<{type?:string;createdAt?:string}>};
type Stage = {resetMonthly?:boolean;resetMonthlySince?:number};
const validDate = (value?:string) => value ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value)?`${value}T00:00:00-03:00`:value) : NaN;

export function crmMonthNumber(value:string|number=Date.now()) {
  const date=new Date(typeof value==='string'?validDate(value):value);
  if(!Number.isFinite(date.getTime()))return 0;
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(date);
  return Number(parts.find(part=>part.type==='year')?.value)*100+Number(parts.find(part=>part.type==='month')?.value);
}

export function visibleAfterMonthlyReset(item:{created_at:string},lead:Lead|null,stage:Stage|undefined,at=Date.now()) {
  if(!stage?.resetMonthly)return true;
  const current=crmMonthNumber(at);
  if(stage.resetMonthlySince&&current<=stage.resetMonthlySince)return true;
  const entered=validDate(lead?.stageEnteredAt);
  const movements=(lead?.follows??[]).filter(entry=>/movimenta|resultado comercial|transfer[eê]ncia de crm/i.test(entry.type??'')).map(entry=>validDate(entry.createdAt));
  const legacy=[validDate(lead?.wonAt),validDate(lead?.closedAt),...movements].filter(Number.isFinite);
  const timestamp=Number.isFinite(entered)?entered:legacy.length?Math.max(...legacy):validDate(item.created_at);
  return !Number.isFinite(timestamp)||crmMonthNumber(timestamp)>=current;
}
