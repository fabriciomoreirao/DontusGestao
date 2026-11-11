import {parseMoneyInput} from "./money.ts";
export function cancellationMonthlyCents(detail:Record<string,unknown>,fallback=0):number {
 const raw=detail.monthlyValueCents;
 if((typeof raw==="number"||typeof raw==="string"&&/^\d+$/.test(raw))&&Number.isSafeInteger(Number(raw))&&Number(raw)>=0)return Number(raw);
 if(typeof detail.monthlyValue==="string"||typeof detail.monthlyValue==="number") {const parsed=parseMoneyInput(String(detail.monthlyValue));if(parsed!==null)return parsed;}
 return Number.isSafeInteger(fallback)&&fallback>=0?fallback:0;
}
export function cancellationFinance(rows:Array<{status:string;monthlyValueCents:number}>) {
 const sum=(filter:(status:string)=>boolean)=>rows.filter(row=>filter(row.status)).reduce((total,row)=>total+row.monthlyValueCents,0);
 return {recovered:sum(status=>status==="Convertido"),lost:sum(status=>status==="Não convertido"),atRisk:sum(status=>!["Convertido","Não convertido"].includes(status)),riskAndLost:sum(status=>status!=="Convertido")};
}
