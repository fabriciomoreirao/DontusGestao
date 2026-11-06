export type AccessFilters = { from:string;to:string;responsible:string;reasonId:string;identification:string };
export const emptyAccessFilters:AccessFilters={from:'',to:'',responsible:'',reasonId:'',identification:''};
export function supportAccessQuery(filters:AccessFilters,page?:number){
  const query=new URLSearchParams(Object.entries(filters).filter(([,value])=>value.trim()).map(([key,value])=>[key,value.trim()]));
  if(page!==undefined)query.set('page',String(Math.max(1,page)));
  return query.toString();
}
export function validAccessPeriod(filters:Pick<AccessFilters,'from'|'to'>){return !filters.from||!filters.to||filters.from<=filters.to}
